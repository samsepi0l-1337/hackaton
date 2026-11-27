//! TS 원본: apps/api/src/bufs.ts
use crate::{
    api::{
        app::common::sha256_hex,
        password::{create_passwords, random_token},
        schema,
        store::Store,
    },
    app::Cx,
    http::{delete_cookie, set_cookie, HResult, HttpError, Req, Resp},
    jsstr::{iso, js_trim, parse_ms},
    shared::account::{BUFS_COOKIE, BUFS_SESSION_HOURS},
};
use serde_json::{json, Value};

/// 읽기 전용 문맥에서 Store::bufs_session_valid와 같은 검사를 한다.
fn session_valid(cx: &Cx<'_>, req: &Req) -> bool {
    req.cookie(BUFS_COOKIE)
        .filter(|t| !t.is_empty())
        .and_then(|token| {
            let value = cx.kv.get(&format!("bufs:{token}"))?;
            let record = schema::check("BufsSession", value).ok()?;
            parse_ms(record.get("expiresAt")?.as_str()?)
        })
        .is_some_and(|expires| expires > cx.now)
}
/// 관리자 권한: 관리자 세션 또는 팀 계정.
pub fn is_admin(cx: &Cx<'_>, req: &Req) -> bool {
    cx.user
        .as_ref()
        .and_then(|u| u.get("isTeam"))
        .and_then(Value::as_bool)
        == Some(true)
        || session_valid(cx, req)
}
fn internal(_: String) -> HttpError {
    HttpError::bad("요청을 처리하지 못했어요")
}
/// POST /api/bufs/login
pub async fn login(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let body = req.json_or_empty();
    let password = body.get("password").and_then(Value::as_str).unwrap_or("");
    let ip = req
        .header("cf-connecting-ip")
        .map(js_trim)
        .filter(|s| !s.is_empty())
        .or_else(|| {
            req.header("x-forwarded-for")
                .and_then(|s| s.split(',').next())
                .map(js_trim)
                .filter(|s| !s.is_empty())
        })
        .unwrap_or("local");
    let key = sha256_hex(&format!("bufs:{ip}"));
    let mut lock = Store::new(cx.kv, cx.now).bufs_lock(&key);
    if lock
        .get("lockedUntil")
        .and_then(Value::as_str)
        .and_then(parse_ms)
        .is_some_and(|t| t > cx.now)
    {
        return Err(HttpError::new(
            429,
            "too_many",
            "로그인 시도가 너무 많아요. 10분 뒤에 다시 해 주세요",
        ));
    }
    if lock.get("lockedUntil").is_some_and(|v| !v.is_null()) {
        lock = json!({"fails":0,"lockedUntil":null});
    }
    let good = cx.env("ADMIN_PASSWORD_HASH").is_some_and(|hash| {
        !password.is_empty()
            && create_passwords(cx.env("PASSWORD_PEPPER"), cx.ports).verify(password, hash)
    });
    if !good {
        let fails = lock.get("fails").and_then(Value::as_i64).unwrap_or(0) + 1;
        let until = if fails >= 5 {
            json!(iso(cx.now + 600000))
        } else {
            Value::Null
        };
        Store::new(cx.kv, cx.now)
            .set_bufs_lock(&key, json!({"fails":fails,"lockedUntil":until}))
            .map_err(internal)?;
        return Err(HttpError::new(
            401,
            "unauthorized",
            "비밀번호가 맞지 않아요",
        ));
    }
    let token = random_token(cx.ports);
    let mut store = Store::new(cx.kv, cx.now);
    store.clear_bufs_lock(&key);
    store
        .create_bufs_session(
            &token,
            &iso(cx.now + i64::from(BUFS_SESSION_HOURS) * 3600000),
        )
        .map_err(internal)?;
    Ok(Resp::json(200, &json!({"ok":true})).with_header(
        "set-cookie",
        &set_cookie(
            BUFS_COOKIE,
            &token,
            i64::from(BUFS_SESSION_HOURS) * 3600,
            true,
            "Strict",
            req.is_https(),
        ),
    ))
}
/// POST /api/bufs/logout
pub async fn logout(cx: &mut Cx<'_>, req: &Req) -> HResult {
    if let Some(t) = req.cookie(BUFS_COOKIE).filter(|t| !t.is_empty()) {
        Store::new(cx.kv, cx.now).delete_bufs_session(&t);
    }
    Ok(Resp::json(200, &json!({"ok":true})).with_header("set-cookie", &delete_cookie(BUFS_COOKIE)))
}
/// GET /api/bufs/me
pub async fn me(cx: &mut Cx<'_>, req: &Req) -> HResult {
    Resp::ok(json!({"admin":session_valid(cx,req)}))
}
fn rate(items: &[Value], key: &str) -> Value {
    let vals: Vec<bool> = items
        .iter()
        .filter_map(|r| r.get(key).and_then(Value::as_bool))
        .collect();
    if vals.is_empty() {
        Value::Null
    } else {
        json!(vals.iter().filter(|x| **x).count() as f64 / vals.len() as f64)
    }
}
fn avg(items: &[Value], key: &str) -> Value {
    let vals: Vec<f64> = items
        .iter()
        .filter_map(|r| r.get("regionIntent")?.get(key)?.as_f64())
        .collect();
    if vals.is_empty() {
        Value::Null
    } else {
        json!((vals.iter().sum::<f64>() / vals.len() as f64 * 100.0).round() / 100.0)
    }
}
fn int_of(req: &Req, key: &str, default: usize, max: usize) -> Result<usize, HttpError> {
    let Some(raw) = req.query(key) else {
        return Ok(default);
    };
    if raw.is_empty() {
        return Ok(default);
    }
    let trimmed = js_trim(raw);
    let prefix = trimmed.get(..2).map(str::to_ascii_lowercase);
    let radix = match prefix.as_deref() {
        Some("0x") => Some(16),
        Some("0b") => Some(2),
        Some("0o") => Some(8),
        _ => None,
    };
    let n = if let Some(radix) = radix {
        let digits = &trimmed[2..];
        if digits.is_empty() || !digits.chars().all(|c| c.is_ascii() && c.is_digit(radix)) {
            None
        } else {
            u64::from_str_radix(digits, radix).ok().map(|n| n as f64)
        }
    } else if trimmed.is_empty() {
        Some(0.0)
    } else {
        trimmed.parse::<f64>().ok()
    };
    match n {
        Some(n) if n.is_finite() && n >= 0.0 && n.fract() == 0.0 => Ok((n as usize).min(max)),
        _ => Err(HttpError::bad(&format!("{key} 값이 올바르지 않아요"))),
    }
}
/// GET /api/bufs/feedback
pub async fn feedback(cx: &mut Cx<'_>, req: &Req) -> HResult {
    if !session_valid(cx, req) {
        return Err(HttpError::new(
            401,
            "unauthorized",
            "관리자 로그인이 필요해요",
        ));
    }
    let limit = int_of(req, "limit", 50, 200)?;
    let offset = int_of(req, "offset", 0, 1000000)?;
    let mut all = Store::new(cx.kv, cx.now).all_feedback();
    all.sort_by(|a, b| {
        b.get("createdAt")
            .and_then(Value::as_str)
            .cmp(&a.get("createdAt").and_then(Value::as_str))
            .then_with(|| {
                b.get("id")
                    .and_then(Value::as_str)
                    .cmp(&a.get("id").and_then(Value::as_str))
            })
    });
    let summary = json!({"helpfulRate":rate(&all,"helpful"),"directionClearRate":rate(&all,"directionClear"),"foundPathRate":rate(&all,"foundRegionalPath"),"regionIntentAvg":{"before":avg(&all,"before"),"after":avg(&all,"after")}});
    let items: Vec<Value> = all
        .iter()
        .skip(offset)
        .take(limit)
        .cloned()
        .map(|mut r| {
            for key in ["knowWhatToPrepare", "regionIntent"] {
                if r.get(key).is_none() {
                    r[key] = Value::Null;
                }
            }
            r
        })
        .collect();
    Resp::ok(json!({"total":all.len(),"items":items,"summary":summary}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn integer_query_accepts_javascript_radix_prefixes() {
        for (raw, expected) in [
            ("0x10", Some(16)),
            ("0b101", Some(5)),
            ("0o17", Some(15)),
            ("0x", None),
        ] {
            let req = Req {
                query: vec![("limit".into(), raw.into())],
                ..Req::default()
            };
            assert_eq!(int_of(&req, "limit", 50, 200).ok(), expected);
        }
    }
}
