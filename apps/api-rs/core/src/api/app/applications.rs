//! TS 원본: apps/api/src/app.ts (/api/applications/*)
use crate::api::{
    ai::tasks::create_ai_tasks,
    app::common::require_user,
    docs::pipeline::{read_announcement_form, ParsedDocCache, PipelineDeps, Summarizer},
    store::Store,
};
use crate::app::Cx;
use crate::http::{HResult, HttpError, Req, Resp};
use crate::jsstr::{iso, js_trim, len16, take16};
use crate::shared::{date::is_closed, seed::mock_form_fields};
use serde_json::{json, Map, Value};
use std::{future::Future, pin::Pin};

struct Cache<'a, 'b>(&'a mut Store<'b>);
impl ParsedDocCache for Cache<'_, '_> {
    fn get(&self, url: &str) -> Option<Value> {
        self.0.parsed_doc(url)
    }
    fn put(&mut self, record: Value) {
        let _ = self.0.save_parsed_doc(record);
    }
}

pub(crate) async fn read_form(cx: &mut Cx<'_>, url: &str, user: Option<&str>) -> Value {
    let env = cx.env;
    let ports = cx.ports;
    let now = cx.now;
    let mut store = Store::new(cx.kv, now);
    let mut cache = Cache(&mut store);
    let summarize = |doc: Value| -> Pin<Box<dyn Future<Output = Option<String>> + '_>> {
        Box::pin(async move { create_ai_tasks(env, ports).doc_summary(&doc, user).await })
    };
    let summarize: &Summarizer<'_> = &summarize;
    let mut deps = PipelineDeps {
        ports,
        docs: Some(&mut cache),
        summarize: Some(summarize),
        summary_timeout_ms: None,
        now,
    };
    read_announcement_form(env, &mut deps, url).await
}
fn user_id(cx: &Cx<'_>) -> Result<String, HttpError> {
    let user = require_user(cx)?;
    Ok(user["id"].as_str().unwrap_or("").to_owned())
}
fn own(cx: &mut Cx<'_>, id: &str) -> Result<Value, HttpError> {
    let uid = user_id(cx)?;
    Store::new(cx.kv, cx.now)
        .get_application(id)
        .filter(|a| a["userId"] == uid)
        .ok_or_else(|| HttpError::not_found("지원서를 찾을 수 없어요"))
}
fn program(cx: &mut Cx<'_>, id: &str) -> Option<Value> {
    Store::new(cx.kv, cx.now)
        .programs()
        .into_iter()
        .find(|p| p["id"] == id)
}
fn closed(p: &Value, now: i64) -> bool {
    p["recruiting"] != true || is_closed(p["endDate"].as_str(), now)
}
fn view(cx: &mut Cx<'_>, mut a: Value) -> Value {
    let p = program(cx, a["programId"].as_str().unwrap_or(""));
    if let (Some(o), Some(p)) = (a.as_object_mut(), p) {
        o.insert("program".into(), p);
    }
    a
}
fn save(cx: &mut Cx<'_>, a: Value) -> Result<(), HttpError> {
    Store::new(cx.kv, cx.now)
        .save_application(a)
        .map_err(|_| HttpError::bad("요청을 처리하지 못했어요"))
}
fn push(a: &mut Value, status: &str, at: &str) {
    a["status"] = json!(status);
    a["updatedAt"] = json!(at);
    if let Some(h) = a["history"].as_array_mut() {
        h.push(json!({"status":status,"at":at}));
    }
}
fn simulate(cx: &Cx<'_>, a: &mut Value) {
    let at = iso(cx.now);
    push(a, "filling", &at);
    push(a, "submitting", &at);
    if cx.opts.fail_submit && a["retries"] == 0 {
        a["failReason"] = json!("접수 시스템 응답이 없어요 (모의)");
        push(a, "failed", &at);
        return;
    }
    let chars = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let receipt: String = cx
        .ports
        .random_bytes(6)
        .into_iter()
        .map(|n| chars[usize::from(n) % chars.len()] as char)
        .collect();
    a["failReason"] = Value::Null;
    a["receiptNo"] = json!(format!("MOCK-{receipt}"));
    push(a, "completed", &at);
}
fn uuid(cx: &Cx<'_>) -> String {
    let mut bytes = cx.ports.random_bytes(16);
    bytes.resize(16, 0);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    let h = hex::encode(bytes);
    format!(
        "app-{}-{}-{}-{}-{}",
        &h[..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..32]
    )
}
fn identity(label: &str) -> bool {
    let lower = label.to_lowercase();
    [
        "성명",
        "이름",
        "대표자",
        "연락처",
        "전화",
        "휴대",
        "이메일",
        "email",
        "e-mail",
        "주소",
        "생년월일",
    ]
    .iter()
    .any(|s| lower.contains(s))
}
fn nonempty<'a>(v: &'a Value, k: &str) -> Option<&'a str> {
    v[k].as_str().filter(|s| !s.is_empty())
}

/// GET /api/applications
pub async fn list(cx: &mut Cx<'_>, _req: &Req) -> HResult {
    let uid = user_id(cx)?;
    let apps = Store::new(cx.kv, cx.now).applications_of(&uid);
    let items: Vec<Value> = apps.into_iter().map(|a| view(cx, a)).collect();
    Resp::ok(json!({"items":items}))
}
/// POST /api/applications
pub async fn create(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let uid = user_id(cx)?;
    let body = req.json_object()?;
    let pid = body
        .get("programId")
        .and_then(Value::as_str)
        .ok_or_else(|| HttpError::bad("programId가 필요해요"))?;
    let p = program(cx, pid).ok_or_else(|| HttpError::not_found("공고를 찾을 수 없어요"))?;
    if closed(&p, cx.now) {
        return Err(HttpError::new(409, "closed", "마감된 공고예요"));
    }
    let mentor = Store::new(cx.kv, cx.now).mentor(&uid);
    let profile = &mentor["profile"];
    let summary = &mentor["summary"];
    let ages = profile["customerAges"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join("·")
        })
        .unwrap_or_default();
    let market = nonempty(summary, "customer")
        .map(str::to_owned)
        .unwrap_or_else(|| {
            [
                profile["customerType"].as_str().unwrap_or(""),
                &ages,
                profile["customerDesc"].as_str().unwrap_or(""),
            ]
            .into_iter()
            .filter(|x| !x.is_empty())
            .collect::<Vec<_>>()
            .join(" / ")
        });
    let prefill = json!({"itemName":profile["idea"].as_str().unwrap_or(""),"problem":nonempty(summary,"problem").or_else(|| nonempty(profile,"problem")).unwrap_or(""),"solution":nonempty(summary,"solution").or_else(|| nonempty(profile,"idea")).unwrap_or(""),"market":market,"plan":""});
    let mut fields = mock_form_fields();
    for f in &mut fields {
        let key = f["key"].as_str().unwrap_or("");
        let value = if f["identity"] == true {
            ""
        } else {
            prefill[key].as_str().unwrap_or("")
        };
        f["value"] = json!(f["maxLength"]
            .as_u64()
            .map(|n| take16(value, n as usize))
            .unwrap_or_else(|| value.to_owned()));
    }
    let mut channel = "mock";
    let mut filename = format!("application-form-{pid}.txt");
    if cx.env("DOC_WORKER") == Some("1") {
        if let Some(url) = p["url"].as_str().filter(|v| !v.is_empty()) {
            let ports = cx.ports;
            let result = crate::time::timeout(ports, 30_000, read_form(cx, url, Some(&uid))).await;
            if let Some(form) = result
                .as_ref()
                .filter(|f| f["fields"].as_array().is_some_and(|a| !a.is_empty()))
            {
                fields = form["fields"].as_array().into_iter().flatten().enumerate().map(|(i, x)| {
                    let mut f = json!({"key":format!("f{}",i+1),"label":x["label"],"maxLength":x["maxLength"],"required":x["required"]});
                    if identity(x["label"].as_str().unwrap_or("")) { f["identity"] = json!(true); }
                    f["value"] = json!(""); f
                }).collect();
                channel = "web";
                filename = form["attachment"]["name"].as_str().unwrap_or("").to_owned();
            } else {
                let reason = result
                    .as_ref()
                    .and_then(|f| f["error"].as_str())
                    .unwrap_or("시간 초과");
                ports.log(
                    "warn",
                    &format!("[form] {pid} 양식 읽기 실패, 모의 양식을 씁니다: {reason}"),
                );
            }
        }
    }
    let fields = create_ai_tasks(cx.env, cx.ports)
        .draft(&fields, profile, &p, Some(&uid))
        .await;
    let at = iso(cx.now);
    let a = json!({"id":uuid(cx),"userId":uid,"programId":pid,"status":"drafting","channel":channel,"formFileName":filename,"fields":fields,"approval":null,"receiptNo":null,"receiptImageUrl":null,"failReason":null,"retries":0,"history":[{"status":"drafting","at":at}],"createdAt":at,"updatedAt":at});
    save(cx, a.clone())?;
    Resp::created(view(cx, a))
}
/// GET /api/applications/:id
pub async fn get(cx: &mut Cx<'_>, _req: &Req, id: &str) -> HResult {
    let a = own(cx, id)?;
    Resp::ok(view(cx, a))
}
/// PUT /api/applications/:id
pub async fn update(cx: &mut Cx<'_>, req: &Req, id: &str) -> HResult {
    let mut a = own(cx, id)?;
    let b = req.json_object()?;
    if a["status"] != "drafting" && a["status"] != "awaiting_approval" {
        return Err(HttpError::new(409, "conflict", "지금은 수정할 수 없어요"));
    }
    let values = b
        .get("values")
        .and_then(Value::as_object)
        .ok_or_else(|| HttpError::bad("values가 필요해요"))?;
    let fields = a["fields"].as_array().cloned().unwrap_or_default();
    let mut errors = Vec::new();
    for (key, value) in values {
        let Some(f) = fields.iter().find(|f| f["key"] == *key) else {
            errors.push(json!({"field":key,"message":"없는 항목이에요"}));
            continue;
        };
        let Some(s) = value.as_str() else {
            errors.push(json!({"field":key,"message":"글자만 입력할 수 있어요"}));
            continue;
        };
        if let Some(max) = f["maxLength"].as_i64() {
            if len16(s) as i64 > max {
                errors.push(json!({"field":key,"message":format!("{}은(는) {max}자 이하로 써 주세요",f["label"].as_str().unwrap_or(""))}));
            }
        }
    }
    if !errors.is_empty() {
        return Err(
            HttpError::new(400, "validation", "입력값을 확인해 주세요").with_fields(json!(errors))
        );
    }
    if let Some(fields) = a["fields"].as_array_mut() {
        for f in fields {
            if let Some(v) = f["key"]
                .as_str()
                .and_then(|k| values.get(k))
                .and_then(Value::as_str)
            {
                f["value"] = json!(v);
            }
        }
    }
    let at = iso(cx.now);
    if b.get("requestApproval") == Some(&json!(true)) {
        let missing: Vec<Value> = a["fields"].as_array().into_iter().flatten().filter(|f| f["required"] == true && js_trim(f["value"].as_str().unwrap_or("")).is_empty()).map(|f| json!({"field":f["key"],"message":format!("{}을(를) 입력해 주세요",f["label"].as_str().unwrap_or(""))})).collect();
        if !missing.is_empty() {
            save(cx, a)?;
            return Err(
                HttpError::new(400, "validation", "필수 항목을 모두 채워 주세요")
                    .with_fields(json!(missing)),
            );
        }
        if a["status"] != "awaiting_approval" {
            push(&mut a, "awaiting_approval", &at);
        }
    } else if a["status"] == "awaiting_approval" {
        push(&mut a, "drafting", &at);
    }
    a["updatedAt"] = json!(at);
    save(cx, a.clone())?;
    Resp::ok(view(cx, a))
}
/// POST /api/applications/:id/approve
pub async fn approve(cx: &mut Cx<'_>, req: &Req, id: &str) -> HResult {
    let mut a = own(cx, id)?;
    let b = req.json_or_empty();
    if b.get("confirm") != Some(&json!(true)) {
        return Err(HttpError::new(
            409,
            "approval_required",
            "승인 확인이 필요해요",
        ));
    }
    if a["status"] != "awaiting_approval" {
        return Err(HttpError::new(
            409,
            "approval_required",
            "승인 대기 상태가 아니에요",
        ));
    }
    let p = program(cx, a["programId"].as_str().unwrap_or(""))
        .ok_or_else(|| HttpError::bad("요청을 처리하지 못했어요"))?;
    if closed(&p, cx.now) {
        return Err(HttpError::new(409, "closed", "마감된 공고예요"));
    }
    let apps = Store::new(cx.kv, cx.now).applications_of(a["userId"].as_str().unwrap_or(""));
    if apps.iter().any(|x| {
        x["id"] != a["id"] && x["programId"] == a["programId"] && x["status"] == "completed"
    }) {
        return Err(HttpError::new(409, "conflict", "이미 제출을 마친 공고예요"));
    }
    let mut values = Map::new();
    for f in a["fields"].as_array().into_iter().flatten() {
        if let Some(k) = f["key"].as_str() {
            values.insert(k.to_owned(), f["value"].clone());
        }
    }
    a["approval"] = json!({"at":iso(cx.now),"values":values});
    simulate(cx, &mut a);
    save(cx, a.clone())?;
    Resp::ok(view(cx, a))
}
/// POST /api/applications/:id/retry
pub async fn retry(cx: &mut Cx<'_>, _req: &Req, id: &str) -> HResult {
    let mut a = own(cx, id)?;
    if a["status"] != "failed" {
        return Err(HttpError::new(
            409,
            "conflict",
            "실패한 지원서만 다시 시도할 수 있어요",
        ));
    }
    if a["retries"].as_i64().unwrap_or(0) >= 1 {
        return Err(HttpError::new(
            409,
            "conflict",
            "다시 시도는 1번만 할 수 있어요",
        ));
    }
    let p = program(cx, a["programId"].as_str().unwrap_or(""))
        .ok_or_else(|| HttpError::bad("요청을 처리하지 못했어요"))?;
    if closed(&p, cx.now) {
        return Err(HttpError::new(409, "closed", "마감된 공고예요"));
    }
    a["retries"] = json!(a["retries"].as_i64().unwrap_or(0) + 1);
    simulate(cx, &mut a);
    save(cx, a.clone())?;
    Resp::ok(view(cx, a))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        app::AppOpts,
        kv::MemKv,
        ports::Env,
        testkit::{block_on, FakePorts},
    };

    #[test]
    fn approval_validation_preserves_merged_values() {
        let mut kv = MemKv::default();
        let env = Env::new();
        let opts = AppOpts::default();
        let ports = FakePorts::default();
        let now = 1_795_741_200_000;
        let at = iso(now - 1000);
        let mut fields = mock_form_fields();
        for field in &mut fields {
            field["value"] = json!("");
        }
        let application = json!({"id":"a","userId":"u","programId":"p","status":"drafting","channel":"mock","formFileName":"form","fields":fields,"approval":null,"receiptNo":null,"receiptImageUrl":null,"failReason":null,"retries":0,"history":[{"status":"drafting","at":at}],"createdAt":at,"updatedAt":at});
        assert!(Store::new(&mut kv, now)
            .save_application(application)
            .is_ok());
        let mut cx = Cx {
            env: &env,
            kv: &mut kv,
            ports: &ports,
            opts: &opts,
            now,
            user: Some(json!({"id":"u"})),
        };
        let req = Req {
            body: Some(json!({"values":{"name":"Alice"},"requestApproval":true}).to_string()),
            ..Req::default()
        };
        let err = block_on(update(&mut cx, &req, "a")).err();
        assert!(err.is_some_and(|e| e.status == 400 && e.code == "validation"));
        let saved = Store::new(cx.kv, now)
            .get_application("a")
            .unwrap_or(Value::Null);
        assert_eq!(saved["fields"][0]["value"], "Alice");
        assert_eq!(saved["status"], "drafting");
        assert_eq!(saved["updatedAt"], at);
    }
}
