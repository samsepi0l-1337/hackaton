//! TS 원본: apps/api/src/app.ts (home, programs, type-test)
use crate::app::Cx;
use crate::http::{HResult, HttpError, Req};

/// GET /api/home
pub async fn home(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("GET /api/home"))
}

/// GET /api/programs/categories
pub async fn categories(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("GET /api/programs/categories"))
}

/// GET /api/programs
pub async fn list(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("GET /api/programs"))
}

/// GET /api/programs/:id
pub async fn detail(_cx: &mut Cx<'_>, _req: &Req, _id: &str) -> HResult {
    Err(HttpError::not_implemented("GET /api/programs/:id"))
}

/// POST /api/type-test
pub async fn type_test(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/type-test"))
}
