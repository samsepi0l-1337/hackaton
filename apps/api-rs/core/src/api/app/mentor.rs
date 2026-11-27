//! TS 원본: apps/api/src/app.ts (/api/mentor/*)
use crate::app::Cx;
use crate::http::{HResult, HttpError, Req};

/// GET /api/mentor/session
pub async fn get_session(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("GET /api/mentor/session"))
}

/// DELETE /api/mentor/session
pub async fn delete_session(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("DELETE /api/mentor/session"))
}

/// PUT /api/mentor/profile
pub async fn put_profile(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("PUT /api/mentor/profile"))
}

/// POST /api/mentor/chat
pub async fn chat(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/mentor/chat"))
}

/// POST /api/mentor/summary
pub async fn post_summary(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/mentor/summary"))
}

/// PUT /api/mentor/summary
pub async fn put_summary(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("PUT /api/mentor/summary"))
}

/// GET /api/mentor/result
pub async fn get_result(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("GET /api/mentor/result"))
}

/// PUT /api/mentor/plan
pub async fn put_plan(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("PUT /api/mentor/plan"))
}

/// POST /api/mentor/feedback
pub async fn post_feedback(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/mentor/feedback"))
}

/// POST /api/mentor/survey
pub async fn post_survey(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/mentor/survey"))
}
