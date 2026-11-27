//! K-Startup 공고 조회.
use crate::jsstr::{js_trim, js_value_string};
use crate::ports::{HttpReq, Ports};
use serde_json::Value;
use std::collections::HashSet;

const URL: &str =
    "https://apis.data.go.kr/B552735/kisedKstartupService02/getAnnouncementInformation02";

fn normalize_key(key: &str) -> String {
    let key = js_trim(key);
    let bytes = key.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                return key.to_owned();
            }
            let Some(h) = (bytes[i + 1] as char).to_digit(16) else {
                return key.to_owned();
            };
            let Some(l) = (bytes[i + 2] as char).to_digit(16) else {
                return key.to_owned();
            };
            out.push((h * 16 + l) as u8);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).unwrap_or_else(|_| key.to_owned())
}

fn encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

fn page(value: &Value) -> Option<(Vec<Value>, f64)> {
    let obj = value.as_object()?;
    let raw = match obj.get("data") {
        Some(Value::Array(a)) => Value::Array(a.clone()),
        Some(Value::Object(o)) => o.get("item")?.clone(),
        None | Some(Value::Null) if obj.contains_key("totalCount") => Value::Array(vec![]),
        _ => return None,
    };
    let items: Vec<Value> = match raw {
        Value::Array(a) => a
            .into_iter()
            .filter(|v| v.is_object() || v.is_array())
            .collect(),
        Value::Object(_) => vec![raw],
        _ => vec![],
    };
    // totalCount 를 모르면 NaN 으로 둔다. 모르는 값을 0 이나 이 페이지 개수로 바꾸면 첫 페이지에서 끝난 것으로 보여,
    // 동기화가 나머지 공고를 마감으로 표시한다.
    let total = match obj.get("totalCount") {
        Some(Value::Null) => f64::NAN,
        Some(Value::Bool(b)) => {
            if *b {
                1.0
            } else {
                0.0
            }
        }
        Some(Value::Number(n)) => n.as_f64().unwrap_or(f64::NAN),
        Some(Value::String(s)) if js_trim(s).is_empty() => f64::NAN,
        Some(Value::String(s)) => js_trim(s).parse().unwrap_or(f64::NAN),
        _ => f64::NAN,
    };
    Some((items, total))
}

pub async fn fetch_announcements(
    key: Option<&str>,
    ports: &dyn Ports,
) -> Result<(Vec<Value>, bool), String> {
    let key = key
        .map(js_trim)
        .filter(|s| !s.is_empty())
        .ok_or("KSTARTUP_SERVICE_KEY 없음")?;
    let mut all = Vec::new();
    let mut ids = HashSet::new();
    let mut complete = true;
    for region in ["부산", "전국"] {
        let mut count = 0;
        let mut finished = false;
        for n in 1..=10 {
            let url = format!("{URL}?serviceKey={}&page={n}&perPage=100&returnType=json&cond[supt_regin::LIKE]={}&cond[rcrt_prgs_yn::EQ]=Y", encode(&normalize_key(key)), encode(region));
            let req = HttpReq {
                method: "GET".into(),
                url,
                headers: vec![("accept".into(), "application/json".into())],
                timeout_ms: Some(15_000),
                ..Default::default()
            };
            let resp = ports.fetch(req).await.map_err(|e| {
                if e == "timeout" {
                    "K-Startup 응답 시간 초과 (15초)".to_owned()
                } else {
                    format!("K-Startup 호출 실패: {e}")
                }
            })?;
            if resp.status == 401 || resp.status == 403 {
                return Err(format!(
                    "K-Startup 인증 실패 (HTTP {}): 키를 확인해 주세요",
                    resp.status
                ));
            }
            if !resp.ok() {
                return Err(format!("K-Startup 응답 오류 (HTTP {})", resp.status));
            }
            let json = resp
                .json()
                .ok_or("K-Startup 응답이 JSON 이 아니에요 (키·요청 확인 필요)")?;
            let (items, total) = page(&json).ok_or("K-Startup 응답 형식을 읽지 못했어요")?;
            count += items.len();
            let empty = items.is_empty();
            // 전체 개수를 모르면 100개보다 적게 온 페이지를 마지막으로 본다.
            let short = items.len() < 100;
            for item in items {
                let id = item
                    .get("pbanc_sn")
                    .filter(|v| !v.is_null())
                    .map(js_value_string)
                    .unwrap_or_default();
                let id = js_trim(&id).to_owned();
                if !id.is_empty() && ids.insert(id) {
                    all.push(item);
                }
            }
            if empty || (total.is_finite() && count as f64 >= total) || (!total.is_finite() && short) {
                finished = true;
                break;
            }
        }
        complete &= finished;
    }
    Ok((all, complete))
}

#[cfg(test)]
mod tests {
    use super::{encode, fetch_announcements};
    use crate::ports::HttpResp;
    use crate::testkit::{block_on, FakePorts};
    use serde_json::json;

    /// 지역마다 page=1 은 100개, page=2 는 50개. totalCount 는 null.
    fn ports() -> FakePorts {
        let p = FakePorts::default();
        *p.fetch.borrow_mut() = Some(Box::new(|req| {
            let page2 = req.url.contains("page=2&");
            let region = if req.url.contains(&encode("부산")) { "b" } else { "n" };
            let n = if page2 { 50 } else { 100 };
            let start = if page2 { 100 } else { 0 };
            let data: Vec<_> = (start..start + n).map(|i| json!({"pbanc_sn": format!("{region}{i}")})).collect();
            Ok(HttpResp { status: 200, headers: vec![], body: json!({"data":data,"totalCount":null}).to_string().into_bytes() })
        }));
        p
    }

    #[test]
    fn unknown_total_keeps_paging_until_a_short_page() {
        let p = ports();
        let (items, complete) = block_on(fetch_announcements(Some("key"), &p)).unwrap();
        assert_eq!(items.len(), 300);
        assert!(complete);
    }
}
