//! TS 원본: apps/api/src/explore/routes.ts (POST /api/explore/chat)
use crate::app::Cx;
use crate::http::{HResult, HttpError, Req};

/// POST /api/explore/chat
pub async fn chat(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/explore/chat"))
}
