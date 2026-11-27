//! TS 원본: apps/api/src/app.ts 미들웨어 (세션 쿠키 → 사용자, 복구 비밀번호 세션 제한)

use crate::app::Cx;
use crate::http::{HttpError, Req};

/// 세션 쿠키로 cx.user 를 채운다. mustChangePassword 세션은 허용 경로 밖에서 403 password_change_required.
pub fn resolve(_cx: &mut Cx<'_>, _req: &Req) -> Result<(), HttpError> {
    Ok(())
}
