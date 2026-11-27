//! TS 원본: apps/api/src/explore/routes.ts (options, problems, session, start, exploration)
use crate::app::Cx;
use crate::http::{HResult, HttpError, Req};

/// GET /api/explore/options
pub async fn options(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("GET /api/explore/options"))
}

/// GET /api/explore/problems
pub async fn problems(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("GET /api/explore/problems"))
}

/// GET /api/explore/session
pub async fn get_session(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("GET /api/explore/session"))
}

/// DELETE /api/explore/session
pub async fn delete_session(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("DELETE /api/explore/session"))
}

/// PUT /api/explore/start
pub async fn put_start(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("PUT /api/explore/start"))
}

/// PUT /api/explore/exploration
pub async fn put_exploration(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("PUT /api/explore/exploration"))
}
