//! TS 원본: apps/api/src/app.ts (home, programs, type-test)
use crate::api::store::Store;
use crate::app::Cx;
use crate::http::{HResult, HttpError, Req, Resp};
use crate::jsstr::{iso, js_trim};
use crate::shared::{
    constants::{PROGRAM_CATEGORIES, STAGES},
    profile::is_profile_complete,
    query, type_test,
};
use serde_json::{json, Map, Value};

fn optional_profile(cx: &mut Cx<'_>) -> Value {
    let Some(id) = cx.user.as_ref().and_then(|u| u["id"].as_str()) else {
        return Value::Null;
    };
    let p = Store::new(cx.kv, cx.now).mentor(id)["profile"].clone();
    if is_profile_complete(&p) {
        p
    } else {
        Value::Null
    }
}

fn integer(req: &Req, key: &str) -> Result<Option<f64>, HttpError> {
    let Some(raw) = req.query(key).filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    let s = js_trim(raw);
    let number = if s.is_empty() {
        Some(0.0)
    } else if let Some((digits, radix)) = s
        .strip_prefix("0x")
        .or_else(|| s.strip_prefix("0X"))
        .map(|v| (v, 16))
        .or_else(|| {
            s.strip_prefix("0b")
                .or_else(|| s.strip_prefix("0B"))
                .map(|v| (v, 2))
        })
        .or_else(|| {
            s.strip_prefix("0o")
                .or_else(|| s.strip_prefix("0O"))
                .map(|v| (v, 8))
        })
    {
        if digits.is_empty() {
            None
        } else {
            digits.chars().try_fold(0.0, |n, c| {
                c.to_digit(radix)
                    .map(|d| n * f64::from(radix) + f64::from(d))
            })
        }
    } else {
        s.parse::<f64>().ok()
    };
    match number {
        Some(n) if n.is_finite() && n >= 0.0 && n.fract() == 0.0 => Ok(Some(n)),
        _ => Err(HttpError::bad(&format!("{key} 값이 올바르지 않아요"))),
    }
}

/// GET /api/home
pub async fn home(cx: &mut Cx<'_>, _req: &Req) -> HResult {
    let programs = Store::new(cx.kv, cx.now).programs();
    Resp::ok(query::home_summary(&programs, cx.now))
}

/// GET /api/programs/categories
pub async fn categories(cx: &mut Cx<'_>, _req: &Req) -> HResult {
    let mut categories: Vec<String> = PROGRAM_CATEGORIES.iter().map(|s| (*s).to_owned()).collect();
    for p in Store::new(cx.kv, cx.now).programs() {
        if let Some(category) = p["category"].as_str() {
            if !categories.iter().any(|c| c == category) {
                categories.push(category.to_owned());
            }
        }
    }
    Resp::ok(json!({"categories": categories}))
}

/// GET /api/programs
pub async fn list(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let mut q = Map::new();
    for key in ["q", "region", "category", "stage"] {
        if let Some(v) = req.query(key).filter(|v| !v.is_empty()) {
            if key == "region" && !["부산", "전국"].contains(&v)
                || key == "stage" && !STAGES.iter().any(|(s, _)| *s == v)
            {
                return Err(HttpError::bad(&format!("{key} 값이 올바르지 않아요")));
            }
            q.insert(key.into(), json!(v));
        }
    }
    if let Some(age) = integer(req, "age")? {
        q.insert("age".into(), json!(age));
    }
    for (key, allowed) in [
        ("due", &["7", "30", "always"][..]),
        ("verdict", &["eligible", "check", "ineligible"][..]),
        ("sort", &["deadline", "latest"][..]),
    ] {
        if let Some(v) = req.query(key).filter(|v| !v.is_empty()) {
            if !allowed.contains(&v) {
                return Err(HttpError::bad(&format!("{key} 값이 올바르지 않아요")));
            }
            q.insert(key.into(), json!(v));
        }
    }
    if let Some(v) = req.query("includeClosed").filter(|v| !v.is_empty()) {
        q.insert("includeClosed".into(), json!(v == "true" || v == "1"));
    }
    for key in ["offset", "limit"] {
        if let Some(v) = integer(req, key)? {
            // list_programs consumes integer pagination; larger values are equivalent
            // to an offset past the end or the maximum page size respectively.
            let bounded = if key == "limit" {
                v.min(100.0)
            } else {
                v.min(i64::MAX as f64)
            };
            q.insert(key.into(), json!(bounded as i64));
        }
    }
    let programs = Store::new(cx.kv, cx.now).programs();
    let profile = optional_profile(cx);
    Resp::ok(query::list_programs(
        &programs,
        &Value::Object(q),
        cx.now,
        &profile,
    ))
}

/// GET /api/programs/:id
pub async fn detail(cx: &mut Cx<'_>, _req: &Req, id: &str) -> HResult {
    let programs = Store::new(cx.kv, cx.now).programs();
    let p = programs
        .iter()
        .find(|p| p["id"] == id)
        .ok_or_else(|| HttpError::not_found("공고를 찾을 수 없어요"))?;
    let profile = optional_profile(cx);
    Resp::ok(query::to_card(p, cx.now, &profile))
}

/// POST /api/type-test
pub async fn type_test(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let body = req.json_object()?;
    let answers = body
        .get("answers")
        .filter(|v| v.is_object())
        .ok_or_else(|| HttpError::bad("answers가 필요해요"))?;
    for (id, axis, _, _, _) in type_test::TYPE_QUESTIONS {
        let valid = type_test::TYPE_AXES
            .iter()
            .find(|(a, _, _, _, _)| *a == axis)
            .is_some_and(|(_, left, right, _, _)| {
                answers[id.to_string()]
                    .as_str()
                    .is_some_and(|v| v == *left || v == *right)
            });
        if !valid {
            return Err(HttpError::bad(&format!("{id}번 문항 답이 올바르지 않아요")));
        }
    }
    let result = type_test::score_type_test(answers)
        .ok_or_else(|| HttpError::bad("요청을 처리하지 못했어요"))?;
    let mut saved = false;
    if let Some(id) = cx.user.as_ref().and_then(|u| u["id"].as_str()) {
        let mut store = Store::new(cx.kv, cx.now);
        let mut mentor = store.mentor(id);
        mentor["profile"]["typeCode"] = result["code"].clone();
        mentor["updatedAt"] = json!(iso(cx.now));
        store
            .set_mentor(id, mentor)
            .map_err(|_| HttpError::bad("요청을 처리하지 못했어요"))?;
        saved = true;
    }
    Resp::ok(json!({"result": result, "saved": saved}))
}
