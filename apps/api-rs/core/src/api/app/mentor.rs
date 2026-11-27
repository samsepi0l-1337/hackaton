//! TS 원본: apps/api/src/app.ts (/api/mentor/*)
use crate::api::{
    ai::tasks::create_ai_tasks,
    app::common::require_user,
    store::{empty_mentor, Store},
};
use crate::app::Cx;
use crate::http::{HResult, HttpError, Req, Resp};
use crate::jsstr::{iso, js_trim, len16};
use crate::shared::{mentor, profile, recommend};
use serde_json::{json, Map, Value};
use std::{future::Future, task::Poll};

fn user_id(cx: &Cx<'_>) -> Result<String, HttpError> {
    Ok(require_user(cx)?["id"].as_str().unwrap_or("").to_owned())
}
fn load(cx: &mut Cx<'_>, id: &str) -> Value {
    Store::new(cx.kv, cx.now).mentor(id)
}
fn save(cx: &mut Cx<'_>, id: &str, m: Value) {
    let _ = Store::new(cx.kv, cx.now).set_mentor(id, m);
}
fn view(m: &Value) -> Value {
    json!({"step":m["step"],"profile":m["profile"],"profileComplete":profile::is_profile_complete(&m["profile"]),"messages":m["messages"],"questionIndex":m["questionIndex"],"summary":m["summary"],"updatedAt":m["updatedAt"]})
}
fn require_profile(m: &Value) -> Result<Value, HttpError> {
    let p = m["profile"].clone();
    let errors = profile::validate_profile(&p);
    if errors.is_empty() {
        Ok(p)
    } else {
        Err(
            HttpError::new(400, "validation", "상담 폼을 먼저 끝까지 채워 주세요")
                .with_fields(json!(errors)),
        )
    }
}
fn merge_profile(base: &Value, patch: &Map<String, Value>) -> (Value, Vec<Value>) {
    let mut p = base.as_object().cloned().unwrap_or_default();
    let mut errors = Vec::new();
    let arrays = ["revenue", "customerAges", "needs"];
    let strings = [
        "openedAt",
        "district",
        "affiliation",
        "teamSize",
        "typeCode",
        "idea",
        "industry",
        "bizForm",
        "problem",
        "readiness",
        "customerType",
        "customerRegion",
        "customerDesc",
        "alternative",
        "stage",
    ];
    for (k, v) in patch {
        if k != "age" && !arrays.contains(&k.as_str()) && !strings.contains(&k.as_str()) {
            continue;
        }
        if v.is_null() || v == "" || v.as_array().is_some_and(Vec::is_empty) {
            p.shift_remove(k);
            continue;
        }
        let valid = if k == "age" {
            v.is_number()
        } else if arrays.contains(&k.as_str()) {
            v.as_array().is_some_and(|a| a.iter().all(Value::is_string))
        } else {
            v.is_string()
        };
        if valid {
            p.insert(k.clone(), v.clone());
        } else {
            errors.push(json!({"field":k,"message":"형식이 맞지 않아요"}));
        }
    }
    (Value::Object(p), errors)
}
async fn top(cx: &mut Cx<'_>, m: &Value) -> Vec<Value> {
    let store = Store::new(cx.kv, cx.now);
    let programs = store.programs();
    let excluded: Vec<Value> = m["feedback"]
        .as_object()
        .into_iter()
        .flat_map(|o| o.iter())
        .filter(|(_, v)| *v == &json!(false))
        .map(|(k, _)| json!(k))
        .collect();
    let excluded = json!(excluded);
    let candidates =
        recommend::relevance_candidates(&programs, &m["profile"], cx.now, &excluded, 26);
    let relevance = create_ai_tasks(cx.env, cx.ports)
        .relevance(&m["profile"], &candidates)
        .await;
    recommend::recommend(
        &json!({"programs":programs,"profile":m["profile"],"summary":m["summary"],"excludeIds":excluded,"feedback":m["feedback"],"relevance":relevance}),
        cx.now,
    )
}

/// GET /api/mentor/session
pub async fn get_session(cx: &mut Cx<'_>, _req: &Req) -> HResult {
    let id = user_id(cx)?;
    Resp::ok(view(&load(cx, &id)))
}
/// DELETE /api/mentor/session
pub async fn delete_session(cx: &mut Cx<'_>, _req: &Req) -> HResult {
    let id = user_id(cx)?;
    let m = empty_mentor(load(cx, &id)["profile"].clone());
    let result = view(&m);
    save(cx, &id, m);
    Resp::ok(result)
}
/// PUT /api/mentor/profile
pub async fn put_profile(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let id = user_id(cx)?;
    let body = req.json_object()?;
    let patch = body
        .get("profile")
        .and_then(Value::as_object)
        .ok_or_else(|| HttpError::bad("profile이 필요해요"))?;
    let mut m = load(cx, &id);
    let (p, mut errors) = merge_profile(&m["profile"], patch);
    for e in profile::validate_profile(&p) {
        if !errors.iter().any(|x| x["field"] == e["field"]) {
            errors.push(e);
        }
    }
    let at = iso(cx.now);
    m["profile"] = p.clone();
    m["updatedAt"] = json!(at);
    save(cx, &id, m);
    Resp::ok(json!({"profile":p,"errors":errors,"savedAt":at}))
}
/// POST /api/mentor/chat
pub async fn chat(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let id = user_id(cx)?;
    let mut m = load(cx, &id);
    let p = require_profile(&m)?;
    let b = req.json_or_empty();
    let text = js_trim(b.get("message").and_then(Value::as_str).unwrap_or(""));
    let skip = b.get("skip") == Some(&json!(true));
    if len16(text) > 1000 {
        return Err(HttpError::bad("메시지는 1000자 이하로 써 주세요"));
    }
    let at = iso(cx.now);
    let questions = mentor::pick_mentor_questions(&p);
    let mut messages = m["messages"].as_array().cloned().unwrap_or_default();
    let mut index = m["questionIndex"].as_u64().unwrap_or(0) as usize;
    let ai = create_ai_tasks(cx.env, cx.ports);
    if messages.is_empty() && text.is_empty() && !skip {
        messages.push(json!({"role":"mentor","text":mentor::mentor_opening(&p),"at":at}));
        let question = ai.mentor_question(&questions[0], "", Some(&id)).await;
        messages.push(json!({"role":"mentor","text":question,"at":at,"questionIndex":0}));
    } else if text.is_empty() && !skip {
        // 빈 요청, 이미 시작함: 새 메시지 없음.
    } else if index < 3 {
        if messages.is_empty() {
            messages.push(json!({"role":"mentor","text":mentor::mentor_opening(&p),"at":at}));
            let question = ai.mentor_question(&questions[0], "", Some(&id)).await;
            messages.push(json!({"role":"mentor","text":question,"at":at,"questionIndex":0}));
        }
        messages.push(if skip {
            json!({"role":"user","text":"","at":at,"questionIndex":index,"skipped":true})
        } else {
            json!({"role":"user","text":text,"at":at,"questionIndex":index})
        });
        index += 1;
        if index < 3 {
            let question = ai.mentor_question(&questions[index], text, Some(&id)).await;
            messages.push(json!({"role":"mentor","text":question,"at":at,"questionIndex":index}));
        }
    } else if !text.is_empty() {
        messages.push(json!({"role":"user","text":text,"at":at}));
        messages.push(json!({"role":"mentor","text":if mentor::asks_about_programs(text) { mentor::MENTOR_PROGRAM_DEFLECT } else { "좋은 질문이에요. 지금 말씀해 주신 내용은 아이디어 요약에 반영해 둘게요." },"at":at}));
    }
    m["messages"] = json!(messages);
    m["questionIndex"] = json!(index);
    m["step"] = json!("chat");
    m["updatedAt"] = json!(at);
    let result = json!({"messages":m["messages"],"questionIndex":index,"done":index >= 3});
    save(cx, &id, m);
    Resp::ok(result)
}
/// POST /api/mentor/summary
pub async fn post_summary(cx: &mut Cx<'_>, _req: &Req) -> HResult {
    let id = user_id(cx)?;
    let mut m = load(cx, &id);
    let p = require_profile(&m)?;
    let answered: Vec<Value> = m["messages"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|x| x.get("questionIndex").is_some())
        .cloned()
        .collect();
    let answers: Vec<String> = answered
        .iter()
        .filter(|x| x["role"] == "user")
        .filter_map(|x| x["text"].as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .collect();
    let summary = create_ai_tasks(cx.env, cx.ports)
        .summary(&p, &answers, Some(&id))
        .await
        .unwrap_or_else(|| mentor::draft_summary(&p, &answered));
    m["summary"] = summary.clone();
    m["step"] = json!("summary");
    m["updatedAt"] = json!(iso(cx.now));
    save(cx, &id, m);
    Resp::ok(json!({"summary":summary}))
}
/// PUT /api/mentor/summary
pub async fn put_summary(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let id = user_id(cx)?;
    let mut m = load(cx, &id);
    let b = req.json_object()?;
    let s = b
        .get("summary")
        .filter(|v| v.is_object() || v.is_array())
        .ok_or_else(|| HttpError::bad("summary가 필요해요"))?;
    let mut out = Map::new();
    for k in ["problem", "customer", "solution", "revenue", "busan"] {
        let v = s
            .get(k)
            .and_then(Value::as_str)
            .filter(|v| len16(v) <= 1000)
            .ok_or_else(|| HttpError::bad(&format!("summary.{k} 값이 올바르지 않아요")))?;
        out.insert(k.into(), json!(v));
    }
    let out = Value::Object(out);
    m["summary"] = out.clone();
    m["step"] = json!("summary");
    m["updatedAt"] = json!(iso(cx.now));
    save(cx, &id, m);
    Resp::ok(json!({"summary":out}))
}
/// GET /api/mentor/result
pub async fn get_result(cx: &mut Cx<'_>, _req: &Req) -> HResult {
    let id = user_id(cx)?;
    let mut m = load(cx, &id);
    let p = require_profile(&m)?;
    let ranked = top(cx, &m).await;
    let ai = create_ai_tasks(cx.env, cx.ports);
    let rule = if m["plan"].is_null() {
        Some(recommend::build_plan(&ranked, cx.now))
    } else {
        None
    };
    let mut reason_future = Box::pin(ai.reasons(&ranked, &p, cx.now, Some(&id)));
    let mut plan_future = Box::pin(async {
        if let Some(rule) = rule {
            json!(ai.plan(&rule, &ranked, &p, Some(&id)).await.unwrap_or(rule))
        } else {
            m["plan"].clone()
        }
    });
    let mut top_result = None;
    let mut plan_result = None;
    let (top, plan) = std::future::poll_fn(|context| {
        if top_result.is_none() {
            if let Poll::Ready(v) = reason_future.as_mut().poll(context) {
                top_result = Some(v);
            }
        }
        if plan_result.is_none() {
            if let Poll::Ready(v) = plan_future.as_mut().poll(context) {
                plan_result = Some(v);
            }
        }
        if top_result.is_some() && plan_result.is_some() {
            Poll::Ready((
                top_result.take().unwrap_or_default(),
                plan_result.take().unwrap_or(Value::Null),
            ))
        } else {
            Poll::Pending
        }
    })
    .await;
    drop(plan_future);
    let agencies = recommend::pick_agencies(&Store::new(cx.kv, cx.now).agencies(), &p, 3);
    m["plan"] = plan.clone();
    m["step"] = json!("result");
    let survey = m["survey"].clone();
    save(cx, &id, m);
    Resp::ok(json!({"top":top,"agencies":agencies,"plan":plan,"survey":survey}))
}
/// PUT /api/mentor/plan
pub async fn put_plan(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let id = user_id(cx)?;
    let mut m = load(cx, &id);
    let b = req.json_object()?;
    let day = b
        .get("day")
        .and_then(Value::as_f64)
        .filter(|v| v.fract() == 0.0 && *v >= 1.0 && *v <= 7.0)
        .ok_or_else(|| HttpError::bad("day(1~7)와 done이 필요해요"))? as i64;
    let done = b
        .get("done")
        .and_then(Value::as_bool)
        .ok_or_else(|| HttpError::bad("day(1~7)와 done이 필요해요"))?;
    if m["plan"].is_null() {
        require_profile(&m)?;
        let ranked = top(cx, &m).await;
        m["plan"] = json!(recommend::build_plan(&ranked, cx.now));
    }
    let item = m["plan"]
        .as_array_mut()
        .and_then(|a| a.iter_mut().find(|p| p["day"] == day))
        .ok_or_else(|| HttpError::not_found("계획 항목이 없어요"))?;
    item["done"] = json!(done);
    let plan = m["plan"].clone();
    save(cx, &id, m);
    Resp::ok(json!({"plan":plan}))
}
/// POST /api/mentor/feedback
pub async fn post_feedback(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let id = user_id(cx)?;
    let mut m = load(cx, &id);
    let b = req.json_object()?;
    let program = b
        .get("programId")
        .and_then(Value::as_str)
        .ok_or_else(|| HttpError::bad("programId와 relevant가 필요해요"))?;
    let relevant = b
        .get("relevant")
        .and_then(Value::as_bool)
        .ok_or_else(|| HttpError::bad("programId와 relevant가 필요해요"))?;
    if !Store::new(cx.kv, cx.now)
        .programs()
        .iter()
        .any(|p| p["id"] == program)
    {
        return Err(HttpError::not_found("공고를 찾을 수 없어요"));
    }
    m["feedback"][program] = json!(relevant);
    save(cx, &id, m);
    Resp::ok(json!({"ok":true}))
}
/// POST /api/mentor/survey
pub async fn post_survey(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let id = user_id(cx)?;
    let mut m = load(cx, &id);
    let b = req.json_object()?;
    let discovered = b
        .get("discovered")
        .and_then(Value::as_bool)
        .ok_or_else(|| HttpError::bad("discovered가 필요해요"))?;
    m["survey"] = json!(discovered);
    save(cx, &id, m);
    Resp::ok(json!({"ok":true}))
}
