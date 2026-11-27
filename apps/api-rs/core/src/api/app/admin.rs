//! TS 원본: apps/api/src/app.ts (/api/admin/form-probe, /api/admin/stats)
use crate::api::{
    app::applications::read_form, bufs::is_admin, explore::state::explore_stats, store::Store,
};
use crate::app::Cx;
use crate::http::{HResult, HttpError, Req, Resp};
use crate::jsstr::take16;
use serde_json::{json, Value};

fn authorize(cx: &Cx<'_>, req: &Req) -> Result<(), HttpError> {
    if is_admin(cx, req) {
        return Ok(());
    }
    let logged_in = cx.user.is_some();
    Err(HttpError::new(
        if logged_in { 403 } else { 401 },
        if logged_in {
            "forbidden"
        } else {
            "unauthorized"
        },
        "관리자만 쓸 수 있어요 (/bufs 로그인)",
    ))
}
fn rate(n: usize, d: usize) -> Value {
    if d == 0 {
        Value::Null
    } else {
        json!(n as f64 / d as f64)
    }
}

/// POST /api/admin/form-probe
pub async fn form_probe(cx: &mut Cx<'_>, req: &Req) -> HResult {
    authorize(cx, req)?;
    let b = req.json_object()?;
    let url = b
        .get("pageUrl")
        .and_then(Value::as_str)
        .filter(|s| s.starts_with("http://") || s.starts_with("https://"))
        .ok_or_else(|| HttpError::bad("pageUrl(http/https)이 필요해요"))?;
    if cx.env("DOC_WORKER") != Some("1") {
        return Err(HttpError::new(
            409,
            "conflict",
            "doc-worker 가 연결되어 있지 않아요",
        ));
    }
    if b.get("discoverOnly") == Some(&json!(true)) {
        let response = cx
            .ports
            .doc_worker("/discover", &json!({"pageUrl":url}))
            .await;
        return match response {
            Some(Ok(r)) => Resp::ok(json!({"status":r.status,"body":r.json()})),
            _ => Err(HttpError::bad("요청을 처리하지 못했어요")),
        };
    }
    let started = cx.ports.now_ms();
    let result = read_form(cx, url, None).await;
    let elapsed = match (started, cx.ports.now_ms()) {
        (Some(a), Some(b)) => b - a,
        _ => 0.0,
    };
    if let Some(error) = result.get("error") {
        return Resp::ok(json!({"ok":false,"ms":elapsed,"error":error}));
    }
    Resp::ok(
        json!({"ok":true,"ms":elapsed,"attachment":result["attachment"],"kind":result["parsed"]["kind"],"cached":result["cached"],"summary":result["summary"],"warnings":result["parsed"]["warnings"],"fields":result["fields"],"textPreview":take16(result["parsed"]["text"].as_str().unwrap_or(""),1500)}),
    )
}
/// GET /api/admin/stats
pub async fn stats(cx: &mut Cx<'_>, req: &Req) -> HResult {
    authorize(cx, req)?;
    let store = Store::new(cx.kv, cx.now);
    let mentors = store.all_mentors();
    let users = store.all_users();
    let apps = store.all_applications();
    let surveyed: Vec<&Value> = mentors.iter().filter(|m| !m["survey"].is_null()).collect();
    let feedback: Vec<&Value> = mentors
        .iter()
        .flat_map(|m| {
            m["feedback"]
                .as_object()
                .into_iter()
                .flat_map(|o| o.values())
        })
        .collect();
    let done = apps.iter().filter(|a| a["status"] == "completed").count();
    let failed = apps.iter().filter(|a| a["status"] == "failed").count();
    let typed: Vec<Value> = users
        .iter()
        .map(|u| store.mentor(u["id"].as_str().unwrap_or("")))
        .filter(|m| {
            m["profile"]["typeCode"]
                .as_str()
                .is_some_and(|s| !s.is_empty())
        })
        .collect();
    let members: Vec<&Value> = users.iter().filter(|u| u["isTeam"] != true).collect();
    let verified = members
        .iter()
        .filter(|u| u["emailVerified"] == true)
        .count();
    Resp::ok(
        json!({"users":members.len(),"consultsCompleted":mentors.iter().filter(|m| m["step"] == "result").count(),"discoveryRate":rate(surveyed.iter().filter(|m| m["survey"] == true).count(),surveyed.len()),"relevanceRate":rate(feedback.iter().filter(|v| ***v == json!(true)).count(),feedback.len()),"submitSuccessRate":rate(done,done+failed),"testToConsultRate":rate(typed.iter().filter(|m| m["messages"].as_array().is_some_and(|a| !a.is_empty())).count(),typed.len()),"accounts":{"verified":verified,"unverified":members.len()-verified},"explore":explore_stats(&store)}),
    )
}
