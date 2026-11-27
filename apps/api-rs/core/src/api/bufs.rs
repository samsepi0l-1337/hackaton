//! TS 원본: apps/api/src/bufs.ts
use crate::app::Cx;
use crate::http::{HResult, HttpError, Req};

/// POST /api/bufs/login
pub async fn login(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/bufs/login"))
}

/// POST /api/bufs/logout
pub async fn logout(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/bufs/logout"))
}

/// GET /api/bufs/me
pub async fn me(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("GET /api/bufs/me"))
}

/// GET /api/bufs/feedback
pub async fn feedback(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("GET /api/bufs/feedback"))
}
