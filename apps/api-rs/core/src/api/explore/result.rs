//! TS 원본: apps/api/src/explore/routes.ts (summary, result, conditions, prep, feedback)
use crate::app::Cx;
use crate::http::{HResult, HttpError, Req};

/// POST /api/explore/summary
pub async fn post_summary(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/explore/summary"))
}

/// PUT /api/explore/summary
pub async fn put_summary(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("PUT /api/explore/summary"))
}

/// GET /api/explore/result
pub async fn get_result(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("GET /api/explore/result"))
}

/// PUT /api/explore/conditions
pub async fn put_conditions(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("PUT /api/explore/conditions"))
}

/// PUT /api/explore/prep
pub async fn put_prep(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("PUT /api/explore/prep"))
}

/// POST /api/explore/feedback
pub async fn post_feedback(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/explore/feedback"))
}
