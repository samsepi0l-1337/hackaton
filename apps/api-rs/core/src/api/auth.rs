//! TS 원본: apps/api/src/auth.ts
use crate::{
    api::{
        app::common::{require_user, sha256_hex},
        mail,
        password::{create_passwords, random_token},
        store::Store,
    },
    app::Cx,
    http::{delete_cookie, set_cookie, HResult, HttpError, Req, Resp},
    jsstr::{iso, js_trim, parse_ms},
    shared::{account::*, api_types::SESSION_COOKIE, constants::BUSAN_DISTRICTS},
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::{json, Value};
use std::sync::LazyLock;

static EMAIL_PATTERN: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(EMAIL_RE).expect("valid EMAIL_RE constant"));

fn text<'a>(v: &'a Value, k: &str) -> &'a str {
    v.get(k).and_then(Value::as_str).unwrap_or("")
}
fn email(v: &Value) -> String {
    js_trim(text(v, "email")).to_lowercase()
}
fn valid_email(s: &str) -> bool {
    EMAIL_PATTERN.is_match(s)
}
fn body(req: &Req) -> Result<Value, HttpError> {
    Ok(Value::Object(req.json_object()?))
}
fn internal(_: String) -> HttpError {
    HttpError::bad("요청을 처리하지 못했어요")
}
fn validation(p: &str, c: &str, field: &str) -> Result<(), HttpError> {
    let check = check_password(p, c);
    if check.ok {
        return Ok(());
    }
    let fields: Vec<Value> = check
        .messages
        .iter()
        .map(|m| json!({"field":field,"message":m}))
        .collect();
    Err(HttpError::new(400, "validation", &check.messages.join(" ")).with_fields(json!(fields)))
}
pub fn public_user(u: &Value) -> Value {
    json!({"id":u.get("id"),"email":u.get("email"),"isTeam":u.get("isTeam"),"createdAt":u.get("createdAt"),"emailVerified":u.get("emailVerified").and_then(Value::as_bool)==Some(true),"mustChangePassword":u.get("mustChangePassword").and_then(Value::as_bool)==Some(true)})
}
fn start_session(cx: &mut Cx<'_>, req: &Req, id: &str, change: bool, value: Value) -> HResult {
    let token = random_token(cx.ports);
    Store::new(cx.kv, cx.now)
        .create_session(&token, id, change)
        .map_err(internal)?;
    Ok(Resp::json(200, &value).with_header(
        "set-cookie",
        &set_cookie(SESSION_COOKIE, &token, 1209600, true, "Lax", req.is_https()),
    ))
}
fn limited(cx: &mut Cx<'_>, kind: &str, address: &str, seconds: i64) -> bool {
    let mut store = Store::new(cx.kv, cx.now);
    let hash = sha256_hex(address);
    if store
        .last_request(kind, &hash)
        .and_then(|s| parse_ms(&s))
        .is_some_and(|t| cx.now - t < seconds * 1000)
    {
        return true;
    }
    store.set_last_request(kind, &hash, &iso(cx.now));
    false
}
async fn send_verification(cx: &mut Cx<'_>, req: &Req, user: &Value) -> Result<bool, HttpError> {
    let token = URL_SAFE_NO_PAD.encode(cx.ports.random_bytes(32));
    let bytes = cx.ports.random_bytes(4);
    let n = bytes
        .get(..4)
        .and_then(|b| <[u8; 4]>::try_from(b).ok())
        .map(u32::from_ne_bytes)
        .unwrap_or(0)
        % 1_000_000;
    let code = format!("{n:06}");
    let id = text(user, "id");
    Store::new(cx.kv,cx.now).set_verification(id,json!({"tokenHash":sha256_hex(&token),"codeHash":sha256_hex(&format!("{id}:{code}")),"expiresAt":iso(cx.now+i64::from(VERIFY_TTL_HOURS)*3_600_000),"sentAt":iso(cx.now),"attempts":0})).map_err(internal)?;
    let origin = match cx.env("APP_ORIGIN") {
        Some(origin) => origin.to_owned(),
        None => url::Url::parse(&req.url)
            .map_err(|e| internal(e.to_string()))?
            .origin()
            .ascii_serialization(),
    };
    let link = format!("{}/verify?token={token}", origin.trim_end_matches('/'));
    Ok(mail::send(
        cx.env,
        cx.ports,
        &mail::verification_mail(text(user, "email"), &link, &code),
    )
    .await
    .is_ok())
}
fn uuid(cx: &Cx<'_>) -> String {
    let mut b = cx.ports.random_bytes(16);
    b.resize(16, 0);
    b[6] = (b[6] & 15) | 64;
    b[8] = (b[8] & 63) | 128;
    let h = hex::encode(b);
    format!(
        "u-{}-{}-{}-{}-{}",
        &h[0..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..32]
    )
}
/// POST /api/auth/signup
pub async fn signup(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let b = body(req)?;
    let e = email(&b);
    let p = text(&b, "password");
    if !valid_email(&e) {
        return Err(HttpError::bad("이메일 형식이 올바르지 않아요"));
    }
    validation(p, text(&b, "passwordConfirm"), "password")?;
    if b.get("consent") != Some(&json!(true)) {
        return Err(HttpError::bad("개인정보 수집·이용에 동의해 주세요"));
    }
    let existing = Store::new(cx.kv, cx.now).find_user_by_email(&e);
    if existing
        .as_ref()
        .and_then(|u| u.get("emailVerified"))
        .and_then(Value::as_bool)
        == Some(true)
    {
        return Err(HttpError::new(409, "conflict", "이미 가입한 이메일이에요"));
    }
    let hash = create_passwords(cx.env("PASSWORD_PEPPER"), cx.ports)
        .hash(p)
        .map_err(internal)?;
    let mut user = existing.unwrap_or_else(|| json!({"id":uuid(cx),"email":e,"isTeam":false,"createdAt":iso(cx.now),"passwordHash":hash,"emailVerified":false,"mustChangePassword":false}));
    user["passwordHash"] = json!(hash);
    Store::new(cx.kv, cx.now)
        .add_user(user.clone())
        .map_err(internal)?;
    let sent = if limited(cx, "verify", &e, i64::from(VERIFY_RESEND_SECONDS)) {
        false
    } else {
        send_verification(cx, req, &user).await?
    };
    Resp::created(json!({"ok":true,"email":e,"verificationSent":sent}))
}
/// POST /api/auth/verify
pub async fn verify(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let b = body(req)?;
    let token = text(&b, "token");
    let mut store = Store::new(cx.kv, cx.now);
    let (mut user, rec) = if !token.is_empty() {
        let u = store
            .user_id_of_verify_token(&sha256_hex(token))
            .and_then(|id| store.find_user(&id))
            .ok_or_else(|| HttpError::bad("인증 링크가 올바르지 않거나 이미 썼어요"))?;
        let r = store
            .verification(text(&u, "id"))
            .ok_or_else(|| HttpError::bad("인증 링크가 올바르지 않거나 이미 썼어요"))?;
        if parse_ms(text(&r, "expiresAt")).is_some_and(|t| t <= cx.now) {
            return Err(HttpError::bad(
                "인증 링크가 만료됐어요. 인증 메일을 다시 받아 주세요",
            ));
        }
        (u, r)
    } else if !text(&b, "email").is_empty() && !text(&b, "code").is_empty() {
        let u = store
            .find_user_by_email(&email(&b))
            .ok_or_else(|| HttpError::bad("인증 코드가 맞지 않아요"))?;
        let mut r = store
            .verification(text(&u, "id"))
            .ok_or_else(|| HttpError::bad("인증 코드가 맞지 않아요"))?;
        let attempts = r.get("attempts").and_then(Value::as_i64).unwrap_or(0);
        if attempts >= 5 {
            return Err(HttpError::new(
                429,
                "too_many",
                "코드를 너무 많이 틀렸어요. 인증 메일을 다시 받아 주세요",
            ));
        }
        if parse_ms(text(&r, "expiresAt")).is_some_and(|t| t <= cx.now) {
            return Err(HttpError::bad(
                "인증 코드가 만료됐어요. 인증 메일을 다시 받아 주세요",
            ));
        }
        if sha256_hex(&format!("{}:{}", text(&u, "id"), js_trim(text(&b, "code"))))
            != text(&r, "codeHash")
        {
            r["attempts"] = json!(attempts + 1);
            store
                .set_verification(text(&u, "id"), r)
                .map_err(internal)?;
            return Err(HttpError::bad("인증 코드가 맞지 않아요"));
        }
        (u, r)
    } else {
        return Err(HttpError::bad("token 또는 email과 code가 필요해요"));
    };
    let _ = rec;
    user["emailVerified"] = json!(true);
    let id = text(&user, "id").to_string();
    store.add_user(user.clone()).map_err(internal)?;
    store.delete_verification(&id);
    start_session(cx, req, &id, false, json!({"user":public_user(&user)}))
}
/// POST /api/auth/verify/resend
pub async fn verify_resend(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let e = email(&body(req)?);
    if !valid_email(&e) {
        return Resp::ok(json!({"ok":true}));
    }
    if limited(cx, "verify", &e, i64::from(VERIFY_RESEND_SECONDS)) {
        return Err(HttpError::new(
            429,
            "too_many",
            &format!("인증 메일은 {VERIFY_RESEND_SECONDS}초에 한 번만 보낼 수 있어요"),
        ));
    }
    if let Some(u) = Store::new(cx.kv, cx.now).find_user_by_email(&e) {
        if u.get("emailVerified").and_then(Value::as_bool) != Some(true) {
            let _ = send_verification(cx, req, &u).await?;
        }
    }
    Resp::ok(json!({"ok":true}))
}
/// POST /api/auth/login
pub async fn login(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let b = body(req)?;
    let fail = || HttpError::new(401, "unauthorized", "이메일 또는 비밀번호가 맞지 않아요");
    let mut u = Store::new(cx.kv, cx.now)
        .find_user_by_email(&email(&b))
        .ok_or_else(fail)?;
    let id = text(&u, "id").to_string();
    let p = text(&b, "password");
    let pw = create_passwords(cx.env("PASSWORD_PEPPER"), cx.ports);
    let change = if pw.verify(p, text(&u, "passwordHash")) {
        if pw.needs_rehash(text(&u, "passwordHash")) {
            u["passwordHash"] = json!(pw.hash(p).map_err(internal)?);
            Store::new(cx.kv, cx.now)
                .add_user(u.clone())
                .map_err(internal)?;
        }
        false
    } else {
        let mut r = Store::new(cx.kv, cx.now).recovery(&id).ok_or_else(fail)?;
        if r.get("used").and_then(Value::as_bool) == Some(true)
            || !parse_ms(text(&r, "expiresAt")).is_some_and(|t| t > cx.now)
            || !pw.verify(p, text(&r, "hash"))
        {
            return Err(fail());
        }
        r["used"] = json!(true);
        r["expiresAt"] = json!(iso(cx.now + i64::from(RECOVERY_TTL_MINUTES) * 60_000));
        Store::new(cx.kv, cx.now)
            .set_recovery(&id, r)
            .map_err(internal)?;
        true
    };
    u["mustChangePassword"] = json!(change);
    start_session(cx, req, &id, change, json!({"user":public_user(&u)}))
}
/// POST /api/auth/logout
pub async fn logout(cx: &mut Cx<'_>, req: &Req) -> HResult {
    if let Some(t) = req.cookie(SESSION_COOKIE).filter(|t| !t.is_empty()) {
        Store::new(cx.kv, cx.now).delete_session(&t);
    }
    Ok(Resp::json(200, &json!({"ok":true}))
        .with_header("set-cookie", &delete_cookie(SESSION_COOKIE)))
}
/// GET /api/auth/me
pub async fn me(cx: &mut Cx<'_>, _: &Req) -> HResult {
    Resp::ok(json!({"user":cx.user.as_ref().map(public_user)}))
}
/// POST /api/auth/forgot
pub async fn forgot(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let e = email(&body(req)?);
    let reply = || Resp::ok(json!({"ok":true,"message":FORGOT_PASSWORD_NOTICE}));
    if !valid_email(&e) || limited(cx, "forgot", &e, i64::from(RECOVERY_REQUEST_MINUTES) * 60) {
        return reply();
    }
    let u = Store::new(cx.kv, cx.now).find_user_by_email(&e);
    let pw = create_passwords(cx.env("PASSWORD_PEPPER"), cx.ports);
    if u.as_ref()
        .and_then(|u| u.get("emailVerified"))
        .and_then(Value::as_bool)
        != Some(true)
    {
        pw.hash(&random_token(cx.ports)).map_err(internal)?;
        return reply();
    }
    let Some(u) = u else {
        return reply();
    };
    let alphabet = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let password = loop {
        let p: String = cx
            .ports
            .random_bytes(12)
            .iter()
            .map(|b| alphabet[usize::from(*b) % alphabet.len()] as char)
            .collect();
        if check_password(&p, &p).ok {
            break p;
        }
    };
    let hash = pw.hash(&password).map_err(internal)?;
    Store::new(cx.kv,cx.now).set_recovery(text(&u,"id"),json!({"hash":hash,"used":false,"createdAt":iso(cx.now),"expiresAt":iso(cx.now+i64::from(RECOVERY_TTL_MINUTES)*60_000)})).map_err(internal)?;
    let _ = mail::send(cx.env, cx.ports, &mail::recovery_mail(&e, &password)).await;
    reply()
}
/// POST /api/auth/password
pub async fn password(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let u = require_user(cx)?;
    let b = body(req)?;
    let current = text(&b, "currentPassword");
    let next = text(&b, "newPassword");
    validation(next, text(&b, "newPasswordConfirm"), "newPassword")?;
    let pw = create_passwords(cx.env("PASSWORD_PEPPER"), cx.ports);
    let id = text(&u, "id");
    if !pw.verify(current, text(&u, "passwordHash")) {
        let r = if u.get("mustChangePassword").and_then(Value::as_bool) == Some(true) {
            Store::new(cx.kv, cx.now).recovery(id)
        } else {
            None
        };
        if !r.as_ref().is_some_and(|r| {
            parse_ms(text(r, "expiresAt")).is_some_and(|t| t > cx.now)
                && pw.verify(current, text(r, "hash"))
        }) {
            let m = "현재 비밀번호가 맞지 않아요";
            return Err(HttpError::new(400, "validation", m)
                .with_fields(json!([{"field":"currentPassword","message":m}])));
        }
    }
    if next == current || pw.verify(next, text(&u, "passwordHash")) {
        let m = "새 비밀번호는 현재 비밀번호와 달라야 해요";
        return Err(HttpError::new(400, "validation", m)
            .with_fields(json!([{"field":"newPassword","message":m}])));
    }
    let hash = pw.hash(next).map_err(internal)?;
    let mut store = Store::new(cx.kv, cx.now);
    let mut saved = store
        .find_user(id)
        .ok_or_else(|| HttpError::bad("요청을 처리하지 못했어요"))?;
    saved["passwordHash"] = json!(hash);
    saved["mustChangePassword"] = json!(false);
    store.add_user(saved).map_err(internal)?;
    store.delete_recovery(id);
    let token = req.cookie(SESSION_COOKIE).unwrap_or_default();
    store.clear_session_must_change(&token).map_err(internal)?;
    store.delete_other_sessions(id, &token);
    Resp::ok(json!({"ok":true}))
}
/// GET /api/me/profile
pub async fn get_profile(cx: &mut Cx<'_>, _: &Req) -> HResult {
    let u = require_user(cx)?;
    Resp::ok(json!({"profile":Store::new(cx.kv,cx.now).basic_profile(text(&u,"id"))}))
}
/// PUT /api/me/profile
pub async fn put_profile(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let u = require_user(cx)?;
    let b = body(req)?;
    let patch = b
        .get("profile")
        .and_then(Value::as_object)
        .ok_or_else(|| HttpError::bad("profile이 필요해요"))?;
    let mut next = Store::new(cx.kv, cx.now).basic_profile(text(&u, "id"));
    let mut errors = Vec::new();
    for (field, message) in [
        ("age", "나이는 0~120 사이 정수예요"),
        ("residence", "거주지 값이 올바르지 않아요"),
        ("hasBusiness", "사업자등록 여부는 예·아니오예요"),
        ("occupation", "직업 값이 올바르지 않아요"),
    ] {
        if let Some(v) = patch.get(field) {
            let ok = v.is_null()
                || match field {
                    "age" => v
                        .as_f64()
                        .is_some_and(|n| n.fract() == 0.0 && (0.0..=120.0).contains(&n)),
                    "residence" => v.as_str().is_some_and(|s| {
                        RESIDENCE_OPTIONS.contains(&s) || BUSAN_DISTRICTS.contains(&s)
                    }),
                    "hasBusiness" => v.is_boolean(),
                    "occupation" => v.as_str().is_some_and(|s| OCCUPATIONS.contains(&s)),
                    _ => false,
                };
            if ok {
                next[field] = v.clone();
            } else {
                errors.push(json!({"field":field,"message":message}));
            }
        }
    }
    if !errors.is_empty() {
        let message = errors
            .iter()
            .filter_map(|e| e.get("message").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join(" ");
        return Err(HttpError::new(400, "validation", &message).with_fields(json!(errors)));
    }
    next["updatedAt"] = json!(iso(cx.now));
    Store::new(cx.kv, cx.now)
        .set_basic_profile(text(&u, "id"), next.clone())
        .map_err(internal)?;
    Resp::ok(json!({"profile":next}))
}
/// DELETE /api/me
pub async fn delete_me(cx: &mut Cx<'_>, _: &Req) -> HResult {
    let u = require_user(cx)?;
    Store::new(cx.kv, cx.now).delete_user(text(&u, "id"));
    Ok(Resp::json(200, &json!({"ok":true}))
        .with_header("set-cookie", &delete_cookie(SESSION_COOKIE)))
}
