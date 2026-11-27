//! TS 원본: apps/api/src/kstartup/routes.ts
use crate::app::Cx;
use crate::http::{HResult, HttpError, Req};

/// POST /api/admin/kstartup/sync
pub async fn sync(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/admin/kstartup/sync"))
}
