//! POST /api/admin/kstartup/sync
use crate::app::Cx;
use crate::http::{HResult, HttpError, Req, Resp};

pub async fn sync(cx: &mut Cx<'_>, req: &Req) -> HResult {
    if !crate::api::bufs::is_admin(cx, req) {
        let (status, code) = if cx.user.is_some() {
            (403, "forbidden")
        } else {
            (401, "unauthorized")
        };
        return Err(HttpError::new(
            status,
            code,
            "관리자만 쓸 수 있어요 (/bufs 로그인)",
        ));
    }
    Ok(Resp::json(
        200,
        &super::sync::run_sync(cx.kv, cx.env, cx.ports, cx.now).await,
    ))
}
