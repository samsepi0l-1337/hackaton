//! TS 원본: apps/api/src/auth.ts
use crate::app::Cx;
use crate::http::{HResult, HttpError, Req};

/// POST /api/auth/signup
pub async fn signup(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/auth/signup"))
}

/// POST /api/auth/verify
pub async fn verify(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/auth/verify"))
}

/// POST /api/auth/verify/resend
pub async fn verify_resend(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/auth/verify/resend"))
}

/// POST /api/auth/login
pub async fn login(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/auth/login"))
}

/// POST /api/auth/logout
pub async fn logout(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/auth/logout"))
}

/// GET /api/auth/me
pub async fn me(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("GET /api/auth/me"))
}

/// POST /api/auth/forgot
pub async fn forgot(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/auth/forgot"))
}

/// POST /api/auth/password
pub async fn password(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("POST /api/auth/password"))
}

/// GET /api/me/profile
pub async fn get_profile(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("GET /api/me/profile"))
}

/// PUT /api/me/profile
pub async fn put_profile(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("PUT /api/me/profile"))
}

/// DELETE /api/me
pub async fn delete_me(_cx: &mut Cx<'_>, _req: &Req) -> HResult {
    Err(HttpError::not_implemented("DELETE /api/me"))
}
