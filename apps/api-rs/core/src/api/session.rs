//! TS 원본: apps/api/src/app.ts 미들웨어 (세션 쿠키 → 사용자, 복구 비밀번호 세션 제한)

use crate::api::store::Store;
use crate::app::Cx;
use crate::http::{HttpError, Req};
use crate::shared::api_types::SESSION_COOKIE;
use serde_json::json;

/// 세션 쿠키로 cx.user 를 채운다. mustChangePassword 세션은 허용 경로 밖에서 403 password_change_required.
pub fn resolve(cx: &mut Cx<'_>, req: &Req) -> Result<(), HttpError> {
    let store = Store::new(cx.kv, cx.now);
    cx.user = req
        .cookie(SESSION_COOKIE)
        .filter(|t| !t.is_empty())
        .and_then(|token| {
            let id = store.user_id_of_session(&token)?;
            let mut user = store.find_user(&id)?;
            user["mustChangePassword"] = json!(store.session_must_change(&token));
            Some(user)
        });
    if cx
        .user
        .as_ref()
        .and_then(|u| u.get("mustChangePassword"))
        .and_then(|v| v.as_bool())
        == Some(true)
        && !["/api/auth/me", "/api/auth/password", "/api/auth/logout"].contains(&req.path.as_str())
    {
        return Err(HttpError::new(
            403,
            "password_change_required",
            "복구 비밀번호로 로그인했어요. 먼저 새 비밀번호를 정해 주세요",
        ));
    }
    Ok(())
}
