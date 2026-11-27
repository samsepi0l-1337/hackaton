//! TS 원본: apps/api/src/app.ts (/api/applications/*)
use crate::app::Cx;
use crate::http::{HResult, HttpError, Req};

/// GET /api/applications
pub async fn list(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("GET /api/applications"))
}

/// POST /api/applications
pub async fn create(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/applications"))
}

/// GET /api/applications/:id
pub async fn get(_cx: &mut Cx<'_>, _req: &Req, _id: &str) -> HResult {
    Err(HttpError::not_implemented("GET /api/applications/:id"))
}

/// PUT /api/applications/:id
pub async fn update(_cx: &mut Cx<'_>, _req: &Req, _id: &str) -> HResult {
    Err(HttpError::not_implemented("PUT /api/applications/:id"))
}

/// POST /api/applications/:id/approve
pub async fn approve(_cx: &mut Cx<'_>, _req: &Req, _id: &str) -> HResult {
    Err(HttpError::not_implemented(
        "POST /api/applications/:id/approve",
    ))
}

/// POST /api/applications/:id/retry
pub async fn retry(_cx: &mut Cx<'_>, _req: &Req, _id: &str) -> HResult {
    Err(HttpError::not_implemented(
        "POST /api/applications/:id/retry",
    ))
}
