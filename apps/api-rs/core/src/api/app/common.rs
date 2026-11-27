//! 라우트들이 같이 쓰는 작은 도우미. TS 원본: apps/api/src/app.ts (bad, notFound, json, jsonOrEmpty, requireUser),
//! apps/api/src/auth.ts (sha256Hex, conditionsFromProfile), apps/api/src/bufs.ts (maskEmail).
//! 슬라이스끼리 서로 기다리지 않도록 계약을 먼저 고정한다. 이름·시그니처를 바꾸지 않는다.
use crate::app::Cx;
use crate::http::{HttpError, Req};
use crate::jsstr::take16;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

/// TS `bad(m)`: 400 bad_request.
pub fn bad(m: &str) -> HttpError {
    HttpError::bad(m)
}

/// TS explore `bad(m, fields)`: fields 가 있으면 400 validation.
pub fn bad_fields(m: &str, fields: Value) -> HttpError {
    HttpError::new(400, "validation", m).with_fields(fields)
}

/// TS `notFound(m = '찾을 수 없어요')`.
pub fn not_found(m: Option<&str>) -> HttpError {
    HttpError::not_found(m.unwrap_or("찾을 수 없어요"))
}

/// TS `json(c)` / explore `body(c)`: JSON 객체 본문. 아니면 400 'JSON 본문이 필요해요'.
pub fn json(req: &Req) -> Result<Map<String, Value>, HttpError> {
    req.json_object()
}

/// TS `jsonOrEmpty(c)` / explore `body(c, false)`.
pub fn json_or_empty(req: &Req) -> Map<String, Value> {
    req.json_or_empty()
}

/// TS `requireUser(c)`: 로그인 사용자 레코드. 없으면 401 unauthorized '로그인이 필요해요'.
pub fn require_user(cx: &Cx<'_>) -> Result<Value, HttpError> {
    cx.user
        .clone()
        .ok_or_else(|| HttpError::new(401, "unauthorized", "로그인이 필요해요"))
}

/// TS `sha256Hex(text)`: UTF-8 SHA-256, 소문자 hex.
pub fn sha256_hex(text: &str) -> String {
    hex::encode(Sha256::digest(text.as_bytes()))
}

/// TS `maskEmail(email)`: 앞 두 글자(UTF-16) + `***@` + 도메인.
pub fn mask_email(email: &str) -> String {
    let mut parts = email.split('@');
    let local = parts.next().unwrap_or("");
    let domain = parts.next().unwrap_or("");
    format!("{}***@{}", take16(local, 2), domain)
}

/// TS `conditionsFromProfile(p: BasicProfile): UserConditions | undefined`.
/// TS 는 `!== null` 로 검사하므로 키가 없으면(undefined) 키 수에는 들지만 JSON 에는 나오지 않는다.
pub fn conditions_from_profile(p: &Value) -> Option<Value> {
    let mut out = Map::new();
    let mut keys = 0;
    for (from, to) in [
        ("age", "age"),
        ("residence", "residence"),
        ("hasBusiness", "hasBusiness"),
        ("occupation", "affiliation"),
    ] {
        match p.get(from) {
            Some(Value::Null) => {}
            None => keys += 1,
            Some(v) => {
                keys += 1;
                out.insert(to.into(), v.clone());
            }
        }
    }
    (keys > 0).then_some(Value::Object(out))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn helpers_match_ts() {
        assert_eq!(
            sha256_hex("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(mask_email("demo@test.local"), "de***@test.local");
        assert_eq!(mask_email("a"), "a***@");
        assert_eq!(
            conditions_from_profile(
                &json!({"age":24,"residence":null,"hasBusiness":false,"occupation":"대학생"})
            ),
            Some(json!({"age":24,"hasBusiness":false,"affiliation":"대학생"}))
        );
        assert_eq!(
            conditions_from_profile(
                &json!({"age":null,"residence":null,"hasBusiness":null,"occupation":null})
            ),
            None
        );
    }
}
