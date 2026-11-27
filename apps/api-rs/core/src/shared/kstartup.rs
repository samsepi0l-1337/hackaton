//! TS 원본: packages/shared/src/kstartup.ts
use serde_json::{json, Value};
/// `toIso(v: string | undefined): string | null`
pub fn to_iso(v: Option<&str>) -> Option<String> {
    let d: String = v?.chars().filter(char::is_ascii_digit).collect();
    (d.len() >= 8).then(|| format!("{}-{}-{}", &d[..4], &d[4..6], &d[6..8]))
}
fn text<'a>(v: &'a Value, k: &str) -> Option<&'a str> {
    v.get(k).and_then(Value::as_str)
}
fn blank(v: Option<&str>) -> Option<&str> {
    v.map(str::trim).filter(|s| !s.is_empty())
}
fn js_number(n: &serde_json::Number) -> String {
    let Some(number) = n.as_f64() else {
        return n.to_string();
    };
    if number == 0.0 {
        return "0".into();
    }
    let abs = number.abs();
    let raw = number.to_string();
    if (1e-6..1e21).contains(&abs) {
        return raw;
    }
    let scientific = format!("{number:e}");
    if let Some((mantissa, exp)) = scientific.split_once('e') {
        if let Ok(exponent) = exp.parse::<i32>() {
            return format!(
                "{mantissa}e{}{exponent}",
                if exponent >= 0 { "+" } else { "" }
            );
        }
    }
    raw
}
/// `fromKStartup(item: KStartupItem, tags: string[] = []): Program`
pub fn from_kstartup(item: &Value, tags: &[String]) -> Value {
    let start = to_iso(text(item, "pbanc_rcpt_bgng_dt"));
    let id = match item.get("pbanc_sn") {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => js_number(n),
        Some(v) => v.to_string(),
        None => "undefined".into(),
    };
    let mut result = json!({"id": id, "title": item.get("biz_pbanc_nm"), "agency": text(item,"pbanc_ntrp_nm").unwrap_or(""), "category": text(item,"supt_biz_clsfc").unwrap_or(""), "region": blank(text(item,"supt_regin")), "startDate": start, "endDate": to_iso(text(item,"pbanc_rcpt_end_dt")), "recruiting": text(item,"rcrt_prgs_yn") != Some("N"), "target": blank(text(item,"aply_trgt")), "bizYears": blank(text(item,"biz_enyy")), "targetAge": blank(text(item,"biz_trgt_age")), "content": text(item,"support_ctnt").or_else(|| text(item,"pbanc_ctnt")).unwrap_or(""), "url": text(item,"detl_pg_url").unwrap_or(""), "registeredAt": start.as_deref().unwrap_or("1970-01-01"), "tags": tags});
    if item.get("biz_pbanc_nm").is_none() {
        if let Some(map) = result.as_object_mut() {
            map.shift_remove("title");
        }
    }
    result
}
/// 함수 골든.
pub fn golden(f: &str, args: &[Value]) -> Option<Value> {
    match f {
        "toIso" => Some(json!(to_iso(args.first().and_then(Value::as_str)))),
        "fromKStartup" => {
            let tags: Vec<String> = args
                .get(1)
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(Value::as_str)
                        .map(str::to_owned)
                        .collect()
                })
                .unwrap_or_default();
            Some(from_kstartup(args.first()?, &tags))
        }
        _ => None,
    }
}
