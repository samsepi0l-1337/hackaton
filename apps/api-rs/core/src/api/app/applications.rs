//! TS 원본: apps/api/src/app.ts (/api/applications/*)
use crate::api::{
    ai::tasks::create_ai_tasks,
    app::common::require_user,
    docs::pipeline::{read_announcement_form, ParsedDocCache, PipelineDeps, Summarizer},
    store::Store,
};
use crate::api::explore::quota::{quota_config, quota_status, record_consult};
use chrono::{DateTime, Datelike, Utc};
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
/// 지원서 작성은 AI 초안·문서 파싱 비용이 든다. 창업 준비와 같이 이메일 인증을 마친 계정만 쓴다
/// (인증 없이 계정을 많이 만들어 비용을 쓰지 못하게).
fn verified_user_id(cx: &Cx<'_>) -> Result<String, HttpError> {
    let user = require_user(cx)?;
    if user["emailVerified"] != true {
        return Err(HttpError::new(403, "email_unverified", "이메일 인증을 마치면 지원서를 쓸 수 있어요"));
    }
    Ok(user["id"].as_str().unwrap_or("").to_owned())
}
fn own(cx: &mut Cx<'_>, id: &str) -> Result<Value, HttpError> {
    let uid = user_id(cx)?;
    Store::new(cx.kv, cx.now)
        .get_application(id)
        .filter(|a| a["userId"] == uid)
        .ok_or_else(|| HttpError::not_found("지원서를 찾을 수 없어요"))
}
fn resource_program(r: &Value) -> Value {
    let mut tags = r["industryTags"].as_array().cloned().unwrap_or_default();
    tags.extend(r["capabilityTags"].as_array().into_iter().flatten().cloned());
    let mut p = Map::new();
    for (key, value) in [
        ("id", r["id"].clone()),
        ("title", r["title"].clone()),
        ("agency", r["agency"].clone()),
        ("category", r["type"].clone()),
        ("region", r["regions"].as_array().and_then(|a| a.first()).cloned().unwrap_or(Value::Null)),
        ("startDate", r["startDate"].clone()),
        ("endDate", r["endDate"].clone()),
        ("recruiting", json!(r["recruitStatus"] != "closed")),
        ("target", r["target"].clone()),
        ("bizYears", Value::Null),
        ("targetAge", Value::Null),
        ("content", r["content"].clone()),
        ("url", r.get("url").filter(|v| !v.is_null()).cloned().unwrap_or_else(|| json!(""))),
        ("registeredAt", r.get("checkedAt").filter(|v| !v.is_null()).or_else(|| r.get("startDate").filter(|v| !v.is_null())).cloned().unwrap_or_else(|| json!(""))),
        ("tags", Value::Array(tags)),
    ] {
        p.insert(key.into(), value);
    }
    Value::Object(p)
}
fn program(cx: &mut Cx<'_>, id: &str) -> Option<Value> {
    Store::new(cx.kv, cx.now)
        .programs()
        .into_iter()
        .find(|p| p["id"] == id)
        .or_else(|| crate::api::explore::state::resources_now(cx)
            .into_iter()
            .find(|r| r["id"] == id)
            .map(|r| resource_program(&r)))
}
fn closed(p: &Value, now: i64) -> bool {
    p["recruiting"] != true || is_closed(p["endDate"].as_str(), now)
}
fn view(cx: &mut Cx<'_>, mut a: Value) -> Value {
    let p = program(cx, a["programId"].as_str().unwrap_or(""));
    if let (Some(o), Some(p)) = (a.as_object_mut(), p) {
        o.insert("program".into(), p);
    }
    a["polishRemaining"] = json!(5_i64.saturating_sub(a["polishCount"].as_i64().unwrap_or(0)).max(0));
    a
}
fn draft_context(cx: &mut Cx<'_>, uid: &str) -> Value {
    let mentor = Store::new(cx.kv, cx.now).mentor(uid);
    let explore = Store::new(cx.kv, cx.now).explore(uid).unwrap_or(Value::Null);
    let start = &explore["start"];
    let summary = &explore["summary"];
    if !summary.is_null() || nonempty(start, "idea").is_some() {
        json!({"mentor":mentor["profile"],"start":start,"summary":summary,"answers":explore["answers"],"conditions":start["conditions"]})
    } else { mentor["profile"].clone() }
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
fn application_quota(cx: &mut Cx<'_>, uid: &str) -> Value {
    match cx.opts.application_limit {
        Some(limit) => quota_status(&Store::new(cx.kv, cx.now), &[format!("app:{uid}")], cx.now, quota_config(Some(limit))),
        None => json!({"used":0,"limit":null,"remaining":null,"resetAt":null,"blocked":false}),
    }
}
pub async fn quota(cx: &mut Cx<'_>, _req: &Req) -> HResult {
    let uid = user_id(cx)?;
    Resp::ok(application_quota(cx, &uid))
}
/// POST /api/applications
pub async fn create(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let uid = verified_user_id(cx)?;
    let q = application_quota(cx, &uid);
    if q["blocked"] == true {
        let date = q["resetAt"].as_str().and_then(crate::jsstr::parse_ms).and_then(|ms| DateTime::<Utc>::from_timestamp_millis(ms + 9 * 3_600_000)).map(|d| format!("{}월 {}일", d.month(), d.day())).unwrap_or_else(|| "며칠 뒤".into());
        let count = cx.opts.application_limit.map(|x| x.0).unwrap_or(0);
        return Err(HttpError::new(429, "application_limit", &format!("이번 주 지원서 작성 {count}회를 모두 사용했어요. {date}부터 다시 쓸 수 있어요.")));
    }
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
    let explore = Store::new(cx.kv, cx.now).explore(&uid).unwrap_or(Value::Null);
    let es = &explore["summary"];
    let start = &explore["start"];
    let has_explore = !es.is_null() || nonempty(start, "idea").is_some();
    let mut prefill = json!({"itemName":profile["idea"].as_str().unwrap_or(""),"problem":nonempty(summary,"problem").or_else(|| nonempty(profile,"problem")).unwrap_or(""),"solution":nonempty(summary,"solution").or_else(|| nonempty(profile,"idea")).unwrap_or(""),"market":market,"plan":""});
    if has_explore {
        let pick = |v: &Value| v.as_str().filter(|s| !s.is_empty()).map(str::to_owned);
        if let Some(v) = pick(&start["idea"]).or_else(|| pick(&es["interest"]["text"])) { prefill["itemName"] = json!(v); }
        if let Some(v) = pick(&es["value"]["text"]).or_else(|| pick(&es["exploration"]["problem"]["title"])).or_else(|| pick(&explore["exploration"]["customProblem"])) { prefill["problem"] = json!(v); }
        if let Some(v) = pick(&es["exploration"]["direction"]["text"]).or_else(|| pick(&start["idea"])) { prefill["solution"] = json!(v); }
        let market_parts: Vec<_> = [&es["target"]["text"], &start["reviewRegion"], &start["district"]].into_iter().filter_map(pick).collect();
        if !market_parts.is_empty() { prefill["market"] = json!(market_parts.join(" / ")); }
        let mut plan: Vec<String> = pick(&es["exploration"]["hypotheses"]["text"]).into_iter().collect();
        for answer in explore["answers"].as_array().into_iter().flatten() {
            if ["prepared", "direction"].contains(&answer["key"].as_str().unwrap_or("")) {
                if let Some(t) = pick(&answer["text"]) { plan.push(t); }
            }
        }
        prefill["plan"] = json!(plan.join(" / "));
    }
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
    let mut form_source = None;
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
                form_source = Some((form["attachment"]["url"].clone(), form["attachment"]["kind"].as_str().unwrap_or("").to_lowercase()));
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
    let draft_profile = draft_context(cx, &uid);
    let fields = create_ai_tasks(cx.env, cx.ports)
        .draft(&fields, &draft_profile, &p, Some(&uid))
        .await;
    let at = iso(cx.now);
    let mut a = json!({"id":uuid(cx),"userId":uid,"programId":pid,"status":"drafting","channel":channel,"formFileName":filename,"fields":fields,"approval":null,"receiptNo":null,"receiptImageUrl":null,"failReason":null,"retries":0,"history":[{"status":"drafting","at":at}],"createdAt":at,"updatedAt":at});
    if let Some((url, kind)) = form_source { a["formUrl"] = url; a["formKind"] = json!(kind); }
    save(cx, a.clone())?;
    if let Some(limit) = cx.opts.application_limit {
        record_consult(&mut Store::new(cx.kv, cx.now), &[format!("app:{uid}")], cx.now, quota_config(Some(limit))).map_err(|_| HttpError::bad("요청을 처리하지 못했어요"))?;
    }
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
pub async fn polish(cx: &mut Cx<'_>, req: &Req, id: &str) -> HResult {
    let mut a = own(cx, id)?;
    if a["status"] != "drafting" { return Err(HttpError::new(409, "conflict", "지금은 다듬을 수 없어요")); }
    let count = a["polishCount"].as_u64().unwrap_or(0);
    if count >= 5 { return Err(HttpError::new(429, "polish_limit", "이 지원서는 AI 다듬기를 5번 모두 썼어요. 직접 고쳐 주세요.")); }
    let body = req.json_or_empty();
    let mut fields = a["fields"].as_array().cloned().unwrap_or_default();
    for field in &mut fields {
        if let Some(value) = field["key"].as_str().and_then(|k| body["values"].get(k)).and_then(Value::as_str) { field["value"] = json!(take16(value, 2000)); }
    }
    let uid = a["userId"].as_str().unwrap_or("");
    let context = draft_context(cx, uid);
    let p = program(cx, a["programId"].as_str().unwrap_or("")).ok_or_else(|| HttpError::bad("요청을 처리하지 못했어요"))?;
    let suggestions = create_ai_tasks(cx.env, cx.ports).polish(&fields, &context, &p, Some(uid)).await.ok_or_else(|| HttpError::new(503, "ai_unavailable", "지금은 AI로 다듬을 수 없어요. 잠시 뒤 다시 시도해 주세요."))?;
    a["polishCount"] = json!(count + 1);
    save(cx, a)?;
    Resp::ok(json!({"suggestions":suggestions,"remaining":4-count}))
}
pub async fn export(cx: &mut Cx<'_>, req: &Req, id: &str) -> HResult {
    use base64::Engine;
    let a = own(cx, id)?;
    let format = req.query.iter().find(|(k, _)| k == "format").map(|(_, v)| v.as_str()).unwrap_or("");
    if !["docx", "hwpx"].contains(&format) { return Err(HttpError::bad("format은 docx 또는 hwpx예요")); }
    let p = program(cx, a["programId"].as_str().unwrap_or("")).ok_or_else(|| HttpError::bad("요청을 처리하지 못했어요"))?;
    let mut values = Map::new();
    let (mut applicant, mut body) = (Vec::new(), Vec::new());
    for f in a["fields"].as_array().into_iter().flatten() {
        let key = f["key"].as_str().unwrap_or("");
        let label = f["label"].as_str().unwrap_or("");
        let value = match a["approval"]["values"].as_object() { Some(m) => m.get(key).and_then(Value::as_str).unwrap_or(""), None => f["value"].as_str().unwrap_or("") };
        if !value.trim().is_empty() { values.insert(label.into(), json!(value)); }
        // 본인 정보 칸은 비어 있으면 손으로 쓸 수 있게 빈칸으로 둔다.
        let row = (label.to_owned(), value.to_owned());
        if f["identity"] == true { applicant.push(row) } else { body.push(row) }
    }
    let mime_of = mime_for;
    // 공고 원본 양식이 채울 수 있는 형식(DOCX·HWPX·PPTX)이면, 고른 형식과 달라도 원본 양식에 채운다.
    let form_kind = a["formKind"].as_str().unwrap_or("");
    if cx.env("DOC_WORKER") == Some("1") && ["docx", "hwpx", "pptx"].contains(&form_kind) && a["formUrl"].as_str().is_some_and(|s| !s.is_empty()) {
        let ports = cx.ports;
        let attempt = async {
            let dl = ports.doc_worker("/download", &json!({"url":a["formUrl"],"referer":p["url"]})).await?.ok()?;
            if !dl.ok() { return None; }
            let dl = dl.json()?;
            let name = dl["fileName"].as_str()?; let data = dl["fileBase64"].as_str()?;
            let filled = ports.doc_worker("/fill", &json!({"fileName":name,"fileBase64":data,"values":values})).await?.ok()?;
            if !filled.ok() { return None; }
            let filled = filled.json()?;
            if filled["filled"].as_array().is_none_or(|x| x.is_empty()) { return None; }
            Some((filled["fileName"].as_str()?.to_owned(), filled["fileBase64"].as_str()?.to_owned()))
        };
        if let Some(Some((file_name, data))) = crate::time::timeout(ports, 30_000, attempt).await {
            return Resp::ok(json!({"fileName":file_name,"mimeType":mime_of(form_kind),"fileBase64":data,"source":"form","format":form_kind}));
        }
        ports.log("warn", "[export] 원본 양식 채우기 실패, 공통 양식을 씁니다");
    }
    let title = p["title"].as_str().unwrap_or("");
    let agency = p["agency"].as_str().unwrap_or("");
    let date = DateTime::<Utc>::from_timestamp_millis(cx.now + 9 * 3_600_000).map(|d| format!("{}년 {}월 {}일", d.year(), d.month(), d.day())).unwrap_or_default();
    let doc = super::export::ExportDoc { program: title, agency, date: &date, applicant: &applicant, body: &body };
    let data = if format == "docx" { super::export::standard_docx(&doc) } else { super::export::standard_hwpx(&doc) };
    let clean: String = title.chars().take(40).map(|c| if "/\\:*?\"<>|".contains(c) { '_' } else { c }).collect();
    // 원본 양식이 HWP·PDF 처럼 채울 수 없는 형식이면, 그 양식의 항목 이름으로 공통 양식을 만든다.
    let source = if a["channel"] == "web" { "standard_form_fields" } else { "standard" };
    Resp::ok(json!({"fileName":format!("{clean} 지원서.{format}"),"mimeType":mime_of(format),"fileBase64":base64::engine::general_purpose::STANDARD.encode(data),"source":source,"format":format}))
}
fn mime_for(kind: &str) -> &'static str {
    match kind {
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        _ => "application/hwp+zip",
    }
}
/// 공통 양식 항목 이름과 흔히 쓰는 다른 이름. 사용자가 올린 양식의 칸 이름이 달라도 채울 수 있게 한다.
const LABEL_ALIASES: &[(&str, &[&str])] = &[
    ("대표자 이름", &["성명", "대표자", "대표자명", "대표자 성명", "신청인", "신청자", "이름"]),
    ("연락처", &["전화번호", "휴대전화", "휴대폰", "핸드폰", "연락처(휴대폰)", "전화"]),
    ("이메일", &["e-mail", "email", "전자우편", "메일", "이메일 주소"]),
    ("창업 아이템명", &["아이템명", "창업아이템", "사업명", "과제명", "아이템", "서비스명", "제품명"]),
    ("문제 인식", &["문제인식", "추진 배경", "개발 동기", "창업 동기", "필요성", "배경 및 필요성"]),
    ("해결 방안", &["실현 가능성", "실현가능성", "솔루션", "해결방안", "개발 방안", "아이템 개요", "사업 개요"]),
    ("목표 시장과 고객", &["목표 시장", "목표시장", "시장 분석", "고객", "타깃 고객", "목표 고객"]),
    ("사업화 계획", &["성장 전략", "성장전략", "사업화 전략", "추진 계획", "사업 추진 계획", "향후 계획"]),
];
/// POST /api/applications/:id/form-fill  { fileName, fileBase64 }
/// 사용자가 찾은 제출 양식(DOCX·HWPX)에 지원서 내용을 채워 돌려준다.
pub async fn form_fill(cx: &mut Cx<'_>, req: &Req, id: &str) -> HResult {
    use base64::Engine;
    let a = own(cx, id)?;
    let b = req.json_object()?;
    let name = b.get("fileName").and_then(Value::as_str).unwrap_or("");
    let data = b.get("fileBase64").and_then(Value::as_str).unwrap_or("");
    let lower = name.to_lowercase();
    let kind = ["docx", "hwpx", "pptx"].into_iter().find(|k| lower.ends_with(&format!(".{k}"))).unwrap_or("");
    if kind.is_empty() {
        return Err(HttpError::new(422, "unsupported", "DOCX·HWPX·PPTX 양식만 채울 수 있어요. HWP·PDF·PPT 양식은 한글·워드·파워포인트에서 HWPX·DOCX·PPTX로 저장한 뒤 올려 주세요."));
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|_| HttpError::bad("파일을 읽지 못했어요"))?;
    if bytes.is_empty() || bytes.len() > 4 * 1024 * 1024 { return Err(HttpError::bad("4MB 이하의 양식 파일을 올려 주세요")); }
    if cx.env("DOC_WORKER") != Some("1") { return Err(HttpError::new(503, "doc_worker_off", "지금은 양식 채우기를 쓸 수 없어요. 공통 양식으로 내려받아 주세요.")); }
    let mut values = Map::new();
    for f in a["fields"].as_array().into_iter().flatten() {
        let key = f["key"].as_str().unwrap_or("");
        let label = f["label"].as_str().unwrap_or("");
        let value = match a["approval"]["values"].as_object() { Some(m) => m.get(key).and_then(Value::as_str).unwrap_or(""), None => f["value"].as_str().unwrap_or("") };
        if value.trim().is_empty() { continue; }
        values.insert(label.into(), json!(value));
        for (base, alts) in LABEL_ALIASES {
            if *base == label { for alt in *alts { values.entry(alt.to_string()).or_insert(json!(value)); } }
        }
    }
    if values.is_empty() { return Err(HttpError::bad("채울 내용이 없어요. 지원서를 먼저 작성해 주세요")); }
    let ports = cx.ports;
    let call = async { ports.doc_worker("/fill", &json!({"fileName":name,"fileBase64":data,"values":values})).await?.ok() };
    let res = crate::time::timeout(ports, 30_000, call).await.flatten().ok_or_else(|| HttpError::new(502, "fill_failed", "양식을 채우지 못했어요. 잠시 뒤 다시 시도해 주세요."))?;
    let body = res.json().unwrap_or(Value::Null);
    if !res.ok() {
        return Err(HttpError::new(422, "fill_failed", body["error"]["message"].as_str().unwrap_or("양식을 채우지 못했어요")));
    }
    let filled: Vec<String> = body["filled"].as_array().into_iter().flatten().filter_map(Value::as_str).map(str::to_owned).collect();
    if filled.is_empty() {
        return Err(HttpError::new(422, "no_match", "양식에서 채울 칸을 찾지 못했어요. 항목 이름 옆에 빈 칸이 있는 표 양식인지 확인해 주세요."));
    }
    // 채운 칸을 우리 항목 이름으로 돌려 보여 준다 (다른 이름으로 채운 경우 포함).
    let ours: Vec<String> = a["fields"].as_array().into_iter().flatten().filter_map(|f| f["label"].as_str()).filter(|l| {
        filled.iter().any(|x| x == l) || LABEL_ALIASES.iter().any(|(base, alts)| base == l && alts.iter().any(|alt| filled.iter().any(|x| x == alt)))
    }).map(str::to_owned).collect();
    Resp::ok(json!({"fileName":body["fileName"].as_str().unwrap_or(name),"mimeType":mime_for(kind),"fileBase64":body["fileBase64"],"filled":ours,"format":kind}))
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
    fn polish_status_and_ai_off_and_export_bad_format() {
        let mut kv = MemKv::default();
        let env = Env::new(); let opts = AppOpts::default(); let ports = FakePorts::default(); let now = 1_795_741_200_000;
        Store::new(&mut kv, now).save_application(json!({"id":"a","userId":"u","programId":"missing","status":"completed","channel":"mock","formFileName":"form","fields":[],"approval":null,"receiptNo":null,"receiptImageUrl":null,"failReason":null,"retries":0,"history":[],"createdAt":iso(now),"updatedAt":iso(now)})).unwrap();
        let mut cx = Cx { env: &env, kv: &mut kv, ports: &ports, opts: &opts, now, user: Some(json!({"id":"u"})) };
        let req = Req::default();
        assert_eq!(block_on(polish(&mut cx, &req, "a")).unwrap_err().status, 409);
        assert_eq!(block_on(export(&mut cx, &req, "a")).unwrap_err().status, 400);
    }

    #[test]
    fn polish_suggests_counts_and_stops_at_five() {
        let mut kv = MemKv::default();
        let env = Env::from([("AI_MODE".into(), "upstage".into()), ("UPSTAGE_API_KEY".into(), "k".into())]);
        let opts = AppOpts::default(); let ports = FakePorts::default(); let now = 1_795_741_200_000;
        *ports.fetch.borrow_mut() = Some(Box::new(|_req| {
            let content = r#"{"f1":"홍길동","f2":"동네 직장인의 점심 고민을 해결합니다."}"#;
            Ok(crate::ports::HttpResp { status: 200, headers: vec![], body: json!({"choices":[{"message":{"content":content}}]}).to_string().into_bytes() })
        }));
        let pid = crate::shared::seed::seed_programs(now)[0]["id"].as_str().unwrap().to_owned();
        let fields = json!([{"key":"f1","label":"성명","maxLength":20,"required":true,"identity":true,"value":""},{"key":"f2","label":"사업 개요","maxLength":200,"required":true,"value":"점심 도시락"}]);
        Store::new(&mut kv, now).save_application(json!({"id":"a","userId":"u","programId":pid,"status":"drafting","channel":"mock","formFileName":"form","fields":fields,"approval":null,"receiptNo":null,"receiptImageUrl":null,"failReason":null,"retries":0,"history":[],"createdAt":iso(now),"updatedAt":iso(now)})).unwrap();
        let mut cx = Cx { env: &env, kv: &mut kv, ports: &ports, opts: &opts, now, user: Some(json!({"id":"u"})) };
        let req = Req { body: Some(r#"{"values":{"f2":"점심 도시락 배달"}}"#.into()), ..Req::default() };
        for i in 0..5 {
            let r = block_on(polish(&mut cx, &req, "a")).unwrap();
            let v: Value = serde_json::from_str(&r.body).unwrap();
            let keys: Vec<_> = v["suggestions"].as_array().unwrap().iter().map(|x| x["key"].as_str().unwrap().to_owned()).collect();
            assert_eq!(keys, vec!["f2"], "identity field is never suggested");
            assert_eq!(v["suggestions"][0]["before"], "점심 도시락 배달", "unsaved edit is the input");
            assert_eq!(v["remaining"], 4 - i);
        }
        let stored = Store::new(cx.kv, now).get_application("a").unwrap();
        assert_eq!(stored["polishCount"], 5, "count survives the stored-record check");
        assert_eq!(stored["fields"][1]["value"], "점심 도시락", "polish does not save values");
        assert_eq!(block_on(polish(&mut cx, &req, "a")).unwrap_err().status, 429);
    }

    #[test]
    fn form_fill_uses_aliases_and_reports_filled_fields() {
        let mut kv = MemKv::default();
        let env = Env::from([("DOC_WORKER".into(), "1".into())]);
        let opts = AppOpts::default(); let ports = FakePorts::default(); let now = 1_795_741_200_000;
        *ports.doc_worker.borrow_mut() = Some(Box::new(|path, body| {
            assert_eq!(path, "/fill");
            // 사용자 양식의 칸 이름은 "성명"과 "사업명" 이다.
            assert_eq!(body["values"]["성명"], "김해보");
            assert_eq!(body["values"]["사업명"], "도시락 구독");
            Ok(crate::ports::HttpResp { status: 200, headers: vec![], body: json!({"fileName":"form.hwpx","fileBase64":"UEsDBA==","filled":["성명","사업명"],"missing":[]}).to_string().into_bytes() })
        }));
        let fields = json!([{"key":"f1","label":"대표자 이름","maxLength":20,"required":true,"identity":true,"value":"김해보"},{"key":"f2","label":"창업 아이템명","maxLength":50,"required":true,"value":"도시락 구독"}]);
        Store::new(&mut kv, now).save_application(json!({"id":"a","userId":"u","programId":"p","status":"drafting","channel":"mock","formFileName":"form","fields":fields,"approval":null,"receiptNo":null,"receiptImageUrl":null,"failReason":null,"retries":0,"history":[],"createdAt":iso(now),"updatedAt":iso(now)})).unwrap();
        let mut cx = Cx { env: &env, kv: &mut kv, ports: &ports, opts: &opts, now, user: Some(json!({"id":"u"})) };
        let bad = Req { body: Some(r#"{"fileName":"form.hwp","fileBase64":"AAAA"}"#.into()), ..Req::default() };
        assert_eq!(block_on(form_fill(&mut cx, &bad, "a")).unwrap_err().status, 422);
        let req = Req { body: Some(r#"{"fileName":"form.hwpx","fileBase64":"UEsDBA=="}"#.into()), ..Req::default() };
        let r = block_on(form_fill(&mut cx, &req, "a")).unwrap();
        let v: Value = serde_json::from_str(&r.body).unwrap();
        assert_eq!(v["filled"], json!(["대표자 이름", "창업 아이템명"]));
        assert_eq!(v["format"], "hwpx");
        let env_off = Env::new();
        let mut cx = Cx { env: &env_off, kv: cx.kv, ports: &ports, opts: &opts, now, user: Some(json!({"id":"u"})) };
        assert_eq!(block_on(form_fill(&mut cx, &req, "a")).unwrap_err().status, 503);
    }

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

    #[test]
    fn unverified_accounts_cannot_create_applications() {
        use crate::testkit::TestApp;
        let mut app = TestApp::new();
        let mut c = app.client();
        let pw = "Unverified123!";
        let b = json!({"email":"new@example.com","password":pw,"passwordConfirm":pw,"consent":true});
        assert_eq!(app.call(&mut c, "POST", "/api/auth/signup", Some(b)).0, 201);
        assert_eq!(app.call(&mut c, "POST", "/api/auth/login", Some(json!({"email":"new@example.com","password":pw}))).0, 200);
        let (s, v, _) = app.call(&mut c, "POST", "/api/applications", Some(json!({"programId":"any"})));
        assert_eq!((s, v["error"]["code"].as_str()), (403, Some("email_unverified")));
    }
}
