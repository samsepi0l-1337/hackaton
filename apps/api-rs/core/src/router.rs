//! 경로 → 처리 함수. TS 라우트 등록 순서와 같다 (고정 경로가 :id 보다 먼저).
use crate::app::Cx;
use crate::http::{HResult, Req};

pub async fn dispatch(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let segs: Vec<&str> = req.path.split('/').filter(|s| !s.is_empty()).collect();
    match (req.method.as_str(), segs.as_slice()) {
        ("GET", ["api", "health"]) => crate::app::health(),
        ("POST", ["api", "bufs", "login"]) => crate::api::bufs::login(cx, req).await,
        ("POST", ["api", "bufs", "logout"]) => crate::api::bufs::logout(cx, req).await,
        ("GET", ["api", "bufs", "me"]) => crate::api::bufs::me(cx, req).await,
        ("GET", ["api", "bufs", "feedback"]) => crate::api::bufs::feedback(cx, req).await,
        ("POST", ["api", "auth", "signup"]) => crate::api::auth::signup(cx, req).await,
        ("POST", ["api", "auth", "verify"]) => crate::api::auth::verify(cx, req).await,
        ("POST", ["api", "auth", "verify", "resend"]) => {
            crate::api::auth::verify_resend(cx, req).await
        }
        ("POST", ["api", "auth", "login"]) => crate::api::auth::login(cx, req).await,
        ("POST", ["api", "auth", "logout"]) => crate::api::auth::logout(cx, req).await,
        ("GET", ["api", "auth", "me"]) => crate::api::auth::me(cx, req).await,
        ("POST", ["api", "auth", "forgot"]) => crate::api::auth::forgot(cx, req).await,
        ("POST", ["api", "auth", "password"]) => crate::api::auth::password(cx, req).await,
        ("GET", ["api", "me", "profile"]) => crate::api::auth::get_profile(cx, req).await,
        ("PUT", ["api", "me", "profile"]) => crate::api::auth::put_profile(cx, req).await,
        ("DELETE", ["api", "me"]) => crate::api::auth::delete_me(cx, req).await,
        ("GET", ["api", "explore", "options"]) => {
            crate::api::explore::start::options(cx, req).await
        }
        ("GET", ["api", "explore", "problems"]) => {
            crate::api::explore::start::problems(cx, req).await
        }
        ("GET", ["api", "explore", "session"]) => {
            crate::api::explore::start::get_session(cx, req).await
        }
        ("DELETE", ["api", "explore", "session"]) => {
            crate::api::explore::start::delete_session(cx, req).await
        }
        ("PUT", ["api", "explore", "start"]) => {
            crate::api::explore::start::put_start(cx, req).await
        }
        ("PUT", ["api", "explore", "exploration"]) => {
            crate::api::explore::start::put_exploration(cx, req).await
        }
        ("POST", ["api", "explore", "chat"]) => {
            crate::api::explore::chat_route::chat(cx, req).await
        }
        ("POST", ["api", "explore", "summary"]) => {
            crate::api::explore::result::post_summary(cx, req).await
        }
        ("PUT", ["api", "explore", "summary"]) => {
            crate::api::explore::result::put_summary(cx, req).await
        }
        ("GET", ["api", "explore", "result"]) => {
            crate::api::explore::result::get_result(cx, req).await
        }
        ("PUT", ["api", "explore", "conditions"]) => {
            crate::api::explore::result::put_conditions(cx, req).await
        }
        ("PUT", ["api", "explore", "prep"]) => crate::api::explore::result::put_prep(cx, req).await,
        ("POST", ["api", "explore", "feedback"]) => {
            crate::api::explore::result::post_feedback(cx, req).await
        }
        ("POST", ["api", "explore", "events"]) => {
            crate::api::explore::resources::post_events(cx, req).await
        }
        ("GET", ["api", "resources"]) => crate::api::explore::resources::list(cx, req).await,
        ("GET", ["api", "resources", id]) => {
            crate::api::explore::resources::detail(cx, req, id).await
        }
        ("GET", ["api", "likes"]) => crate::api::explore::resources::likes(cx, req).await,
        ("PUT", ["api", "likes", id]) => {
            crate::api::explore::resources::put_like(cx, req, id).await
        }
        ("GET", ["api", "home"]) => crate::api::app::programs::home(cx, req).await,
        ("GET", ["api", "programs", "categories"]) => {
            crate::api::app::programs::categories(cx, req).await
        }
        ("GET", ["api", "programs"]) => crate::api::app::programs::list(cx, req).await,
        ("GET", ["api", "programs", id]) => crate::api::app::programs::detail(cx, req, id).await,
        ("POST", ["api", "type-test"]) => crate::api::app::programs::type_test(cx, req).await,
        ("GET", ["api", "mentor", "session"]) => {
            crate::api::app::mentor::get_session(cx, req).await
        }
        ("DELETE", ["api", "mentor", "session"]) => {
            crate::api::app::mentor::delete_session(cx, req).await
        }
        ("PUT", ["api", "mentor", "profile"]) => {
            crate::api::app::mentor::put_profile(cx, req).await
        }
        ("POST", ["api", "mentor", "chat"]) => crate::api::app::mentor::chat(cx, req).await,
        ("POST", ["api", "mentor", "summary"]) => {
            crate::api::app::mentor::post_summary(cx, req).await
        }
        ("PUT", ["api", "mentor", "summary"]) => {
            crate::api::app::mentor::put_summary(cx, req).await
        }
        ("GET", ["api", "mentor", "result"]) => crate::api::app::mentor::get_result(cx, req).await,
        ("PUT", ["api", "mentor", "plan"]) => crate::api::app::mentor::put_plan(cx, req).await,
        ("POST", ["api", "mentor", "feedback"]) => {
            crate::api::app::mentor::post_feedback(cx, req).await
        }
        ("POST", ["api", "mentor", "survey"]) => {
            crate::api::app::mentor::post_survey(cx, req).await
        }
        ("GET", ["api", "applications"]) => crate::api::app::applications::list(cx, req).await,
        ("POST", ["api", "applications"]) => crate::api::app::applications::create(cx, req).await,
        ("GET", ["api", "applications", id]) => {
            crate::api::app::applications::get(cx, req, id).await
        }
        ("PUT", ["api", "applications", id]) => {
            crate::api::app::applications::update(cx, req, id).await
        }
        ("POST", ["api", "applications", id, "approve"]) => {
            crate::api::app::applications::approve(cx, req, id).await
        }
        ("POST", ["api", "applications", id, "retry"]) => {
            crate::api::app::applications::retry(cx, req, id).await
        }
        ("POST", ["api", "admin", "form-probe"]) => {
            crate::api::app::admin::form_probe(cx, req).await
        }
        ("GET", ["api", "admin", "stats"]) => crate::api::app::admin::stats(cx, req).await,
        ("POST", ["api", "admin", "kstartup", "sync"]) => {
            crate::api::kstartup::routes::sync(cx, req).await
        }
        _ => crate::app::not_found_route(),
    }
}
