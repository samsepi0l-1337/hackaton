//! TS 원본: apps/api/src/app.ts (/api/admin/form-probe, /api/admin/stats)
use crate::app::Cx;
use crate::http::{HResult, HttpError, Req};

/// POST /api/admin/form-probe
pub async fn form_probe(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/admin/form-probe"))
}

/// GET /api/admin/stats
pub async fn stats(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("GET /api/admin/stats"))
}
