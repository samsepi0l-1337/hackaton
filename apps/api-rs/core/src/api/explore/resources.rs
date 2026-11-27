//! TS 원본: apps/api/src/explore/routes.ts (events, resources, likes)
use crate::app::Cx;
use crate::http::{HResult, HttpError, Req};

/// POST /api/explore/events
pub async fn post_events(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/explore/events"))
}

/// GET /api/resources
pub async fn list(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("GET /api/resources"))
}

/// GET /api/resources/:id
pub async fn detail(_cx: &mut Cx<'_>, _req: &Req, _id: &str) -> HResult {
    Err(HttpError::not_implemented("GET /api/resources/:id"))
}

/// GET /api/likes
pub async fn likes(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("GET /api/likes"))
}

/// PUT /api/likes/:id
pub async fn put_like(_cx: &mut Cx<'_>, _req: &Req, _id: &str) -> HResult {
    Err(HttpError::not_implemented("PUT /api/likes/:id"))
}
