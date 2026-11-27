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
        &set_cookie(SESSION_COOKIE, &token, crate::api::store::SESSION_MAX_AGE_SECONDS, true, "Lax", req.is_https()),
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
/// `pending`: 인증을 마쳐야 적용되는 새 비밀번호 해시 (이미 있는 미인증 계정에 다시 가입할 때).
async fn send_verification(cx: &mut Cx<'_>, req: &Req, user: &Value, pending: Option<&str>) -> Result<bool, HttpError> {
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
    let mut rec = json!({"tokenHash":sha256_hex(&token),"codeHash":sha256_hex(&format!("{id}:{code}")),"expiresAt":iso(cx.now+i64::from(VERIFY_TTL_HOURS)*3_600_000),"sentAt":iso(cx.now),"attempts":0});
    if let Some(h) = pending {
        rec["pendingHash"] = json!(h);
    }
    Store::new(cx.kv,cx.now).set_verification(id,rec).map_err(internal)?;
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
    // 이미 있는 미인증 계정: 비밀번호를 바로 바꾸지 않는다. 메일 소유자가 인증해야 새 비밀번호가 적용된다.
    // 그 전에 그 계정으로 열린 세션은 모두 닫는다 (다른 사람이 먼저 가입한 경우).
    let pending = existing.is_some();
    let user = match existing {
        Some(u) => {
            Store::new(cx.kv, cx.now).delete_all_sessions(text(&u, "id"));
            u
        }
        None => {
            let u = json!({"id":uuid(cx),"email":e,"isTeam":false,"createdAt":iso(cx.now),"passwordHash":hash,"emailVerified":false,"mustChangePassword":false});
            Store::new(cx.kv, cx.now).add_user(u.clone()).map_err(internal)?;
            u
        }
    };
    let sent = if limited(cx, "verify", &e, i64::from(VERIFY_RESEND_SECONDS)) {
        if pending {
            let mut store = Store::new(cx.kv, cx.now);
            if let Some(mut r) = store.verification(text(&user, "id")) {
                r["pendingHash"] = json!(hash);
                store.set_verification(text(&user, "id"), r).map_err(internal)?;
            }
        }
        false
    } else {
        send_verification(cx, req, &user, pending.then_some(hash.as_str())).await?
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
    // 인증 전에 같은 이메일로 다시 가입한 적이 있으면(다툼), 누가 정한 비밀번호인지 알 수 없다.
    // 어느 쪽도 적용하지 않고 쓸 수 없는 비밀번호로 바꾼 뒤, 메일 주인에게 임시 비밀번호를 보낸다.
    let contested = !text(&rec, "pendingHash").is_empty();
    if contested {
        let pw = create_passwords(cx.env.get("PASSWORD_PEPPER").map(String::as_str), cx.ports);
        user["passwordHash"] = json!(pw.hash(&random_token(cx.ports)).map_err(internal)?);
    }
    user["emailVerified"] = json!(true);
    let id = text(&user, "id").to_string();
    store.add_user(user.clone()).map_err(internal)?;
    store.delete_verification(&id);
    // 인증 전에 열린 세션은 메일 소유자의 것이라고 볼 수 없다.
    store.delete_all_sessions(&id);
    if contested {
        let e = text(&user, "email").to_string();
        issue_recovery(cx, &e, &id).await?;
    }
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
            let pending = Store::new(cx.kv, cx.now)
                .verification(text(&u, "id"))
                .map(|r| text(&r, "pendingHash").to_owned())
                .filter(|h| !h.is_empty());
            let _ = send_verification(cx, req, &u, pending.as_deref()).await?;
        }
    }
    Resp::ok(json!({"ok":true}))
}
const LOGIN_FAIL_LIMIT: usize = 10;
const LOGIN_FAIL_WINDOW_MS: i64 = 15 * 60_000;
fn login_fail_key(req: &Req, email: &str) -> String {
    let ip = req
        .header("cf-connecting-ip")
        .map(js_trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("local");
    format!("login:{}", sha256_hex(&format!("{email}|{ip}")))
}
fn recent_login_failures(cx: &mut Cx<'_>, key: &str) -> Vec<Value> {
    let now = cx.now;
    Store::new(cx.kv, cx.now)
        .quota(key)
        .as_array()
        .into_iter()
        .flatten()
        .filter(|t| {
            t.as_str()
                .and_then(parse_ms)
                .is_some_and(|at| now - at < LOGIN_FAIL_WINDOW_MS)
        })
        .cloned()
        .collect()
}
/// POST /api/auth/login
/// 같은 이메일·IP 로 15분에 10번 틀리면 잠시 막는다.
pub async fn login(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let b = body(req)?;
    let key = login_fail_key(req, &email(&b));
    let mut fails = recent_login_failures(cx, &key);
    if fails.len() >= LOGIN_FAIL_LIMIT {
        return Err(HttpError::new(
            429,
            "too_many",
            "로그인을 너무 많이 시도했어요. 15분 뒤에 다시 해 주세요",
        ));
    }
    let res = login_checked(cx, req, &b).await;
    match &res {
        Err(e) if e.status == 401 => {
            fails.push(json!(iso(cx.now)));
            Store::new(cx.kv, cx.now)
                .set_quota(&key, json!(fails))
                .map_err(internal)?;
        }
        Ok(_) if !fails.is_empty() => {
            Store::new(cx.kv, cx.now)
                .set_quota(&key, json!([]))
                .map_err(internal)?;
        }
        _ => {}
    }
    res
}
async fn login_checked(cx: &mut Cx<'_>, req: &Req, b: &Value) -> HResult {
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
/// 임시 비밀번호를 만들어 메일로 보낸다 (비밀번호 찾기, 다툼이 있던 가입의 인증).
async fn issue_recovery(cx: &mut Cx<'_>, e: &str, id: &str) -> Result<(), HttpError> {
    let pw = create_passwords(cx.env("PASSWORD_PEPPER"), cx.ports);
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
    Store::new(cx.kv,cx.now).set_recovery(id,json!({"hash":hash,"used":false,"createdAt":iso(cx.now),"expiresAt":iso(cx.now+i64::from(RECOVERY_TTL_MINUTES)*60_000)})).map_err(internal)?;
    let _ = mail::send(cx.env, cx.ports, &mail::recovery_mail(e, &password)).await;
    Ok(())
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
    issue_recovery(cx, &e, text(&u, "id")).await?;
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
fn valid_residence(s: &str) -> bool {
    RESIDENCE_OPTIONS.contains(&s)
        || BUSAN_DISTRICTS.contains(&s)
        || s.strip_prefix("울산 ").is_some_and(|d| ULSAN_DISTRICTS.contains(&d))
        || s.strip_prefix("경남 ").is_some_and(|d| GYEONGNAM_DISTRICTS.contains(&d))
}

#[cfg(test)]
mod tests {
    use super::valid_residence;

    #[test]
    fn residence_districts_match_their_region() {
        assert!(valid_residence("울산 남구"));
        assert!(valid_residence("경남 김해시"));
        assert!(!valid_residence("울산 해운대구"));
        assert!(!valid_residence("경남 x"));
    }

    use crate::testkit::{Client, TestApp};
    use serde_json::{json, Value};

    const EMAIL: &str = "victim@example.com";
    fn signup(app: &mut TestApp, c: &mut Client, pw: &str) -> u16 {
        let b = json!({"email":EMAIL,"password":pw,"passwordConfirm":pw,"consent":true});
        app.call(c, "POST", "/api/auth/signup", Some(b)).0
    }
    fn login(app: &mut TestApp, c: &mut Client, pw: &str) -> u16 {
        app.call(c, "POST", "/api/auth/login", Some(json!({"email":EMAIL,"password":pw}))).0
    }
    fn me(app: &mut TestApp, c: &mut Client) -> Value {
        app.call(c, "GET", "/api/auth/me", None).1["user"].clone()
    }
    fn last_token(app: &TestApp) -> String {
        let mails = app.ports.mails.borrow();
        let text = &mails.iter().rev().find(|m| m.text.contains("token=")).expect("verify mail").text;
        let at = text.find("token=").expect("token") + 6;
        text[at..].split_whitespace().next().unwrap().to_string()
    }
    fn last_recovery(app: &TestApp) -> Option<String> {
        let mails = app.ports.mails.borrow();
        let text = &mails.iter().rev().find(|m| m.text.contains("복구 비밀번호:"))?.text;
        let at = text.find("복구 비밀번호:")? + "복구 비밀번호:".len();
        Some(text[at..].split_whitespace().next()?.to_string())
    }

    /// 같은 이메일로 두 사람이 인증 전에 가입하면, 순서·재전송 대기와 관계없이
    /// 인증 뒤에는 어느 쪽 비밀번호도 쓸 수 없고, 메일 주인만 받은 임시 비밀번호로 로그인한다.
    fn contested(victim_first: bool, wait_ms: i64) {
        let mut app = TestApp::new();
        let (mut attacker, mut victim) = (app.client(), app.client());
        let (first, second) = if victim_first { ("Victim123!x", "Attacker123!") } else { ("Attacker123!", "Victim123!x") };
        let mut c1 = app.client();
        assert_eq!(signup(&mut app, &mut c1, first), 201);
        app.now += wait_ms;
        let mut c2 = app.client();
        assert_eq!(signup(&mut app, &mut c2, second), 201);
        // 인증 전에는 계정에 먼저 가입한 쪽 비밀번호가 남아 있다. 그 세션은 인증 때 닫혀야 한다.
        assert_eq!(login(&mut app, &mut attacker, first), 200, "unverified login with the first password");
        let token = last_token(&app);
        let (s, _, _) = app.call(&mut victim, "POST", "/api/auth/verify", Some(json!({"token":token})));
        assert_eq!(s, 200);
        assert!(me(&mut app, &mut attacker).is_null(), "attacker session closed");
        let mut fresh = app.client();
        assert_eq!(login(&mut app, &mut fresh, "Attacker123!"), 401, "attacker password not applied");
        assert_eq!(login(&mut app, &mut fresh, "Victim123!x"), 401, "no signup password applied");
        let recovery = last_recovery(&app).expect("recovery mail sent to the owner");
        assert_eq!(login(&mut app, &mut fresh, &recovery), 200);
        assert_eq!(me(&mut app, &mut fresh)["mustChangePassword"], true);
    }
    #[test]
    fn contested_signup_attacker_first() { contested(false, 0); }
    #[test]
    fn contested_signup_attacker_first_after_cooldown() { contested(false, 61_000); }
    #[test]
    fn contested_signup_victim_first_within_cooldown() { contested(true, 0); }
    #[test]
    fn contested_signup_victim_first_after_cooldown() { contested(true, 61_000); }

    #[test]
    fn single_signup_keeps_its_password() {
        let mut app = TestApp::new();
        let mut c = app.client();
        signup(&mut app, &mut c, "Victim123!x");
        let token = last_token(&app);
        assert_eq!(app.call(&mut c, "POST", "/api/auth/verify", Some(json!({"token":token}))).0, 200);
        let mut fresh = app.client();
        assert_eq!(login(&mut app, &mut fresh, "Victim123!x"), 200);
        assert!(last_recovery(&app).is_none());
    }

    #[test]
    fn login_locks_after_ten_failures() {
        let mut app = TestApp::new();
        let mut c = app.client();
        signup(&mut app, &mut c, "Victim123!x");
        for _ in 0..10 {
            assert_eq!(login(&mut app, &mut c, "wrong-password1!"), 401);
        }
        assert_eq!(login(&mut app, &mut c, "Victim123!x"), 429);
        app.now += 15 * 60_000;
        assert_eq!(login(&mut app, &mut c, "Victim123!x"), 200);
    }

    #[test]
    fn sessions_expire_after_fourteen_days() {
        let mut app = TestApp::new();
        let mut c = app.client();
        signup(&mut app, &mut c, "Victim123!x");
        assert_eq!(login(&mut app, &mut c, "Victim123!x"), 200);
        app.now += 13 * 86_400_000;
        assert!(!me(&mut app, &mut c).is_null());
        app.now += 2 * 86_400_000;
        assert!(me(&mut app, &mut c).is_null());
    }
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
                    "residence" => v.as_str().is_some_and(valid_residence),
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
