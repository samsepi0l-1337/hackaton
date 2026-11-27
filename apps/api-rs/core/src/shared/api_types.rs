//! TS 원본: packages/shared/src/api.ts
/// TS: `SESSION_COOKIE = 'sid'`.
pub const SESSION_COOKIE: &str = "sid";
/// TS: `ROUTES` (동적 경로는 메서드).
pub struct Routes {
    pub health: &'static str,
    pub home: &'static str,
    pub programs: &'static str,
    pub categories: &'static str,
    pub signup: &'static str,
    pub login: &'static str,
    pub logout: &'static str,
    pub me: &'static str,
    pub account: &'static str,
    pub verify_email: &'static str,
    pub resend_verification: &'static str,
    pub forgot_password: &'static str,
    pub change_password: &'static str,
    pub my_profile: &'static str,
    pub bufs_login: &'static str,
    pub bufs_logout: &'static str,
    pub bufs_me: &'static str,
    pub bufs_feedback: &'static str,
    pub kstartup_sync: &'static str,
    pub session: &'static str,
    pub profile: &'static str,
    pub chat: &'static str,
    pub summary: &'static str,
    pub result: &'static str,
    pub plan: &'static str,
    pub feedback: &'static str,
    pub survey: &'static str,
    pub type_test: &'static str,
    pub applications: &'static str,
    pub stats: &'static str,
    pub explore_options: &'static str,
    pub problems: &'static str,
    pub explore: &'static str,
    pub start: &'static str,
    pub exploration: &'static str,
    pub explore_chat: &'static str,
    pub explore_summary: &'static str,
    pub explore_result: &'static str,
    pub conditions: &'static str,
    pub prep_done: &'static str,
    pub explore_feedback: &'static str,
    pub events: &'static str,
    pub resources: &'static str,
    pub likes: &'static str,
}
fn encode(id: &str) -> String {
    let mut out = String::new();
    for b in id.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) {
            out.push(char::from(b));
        } else {
            use std::fmt::Write;
            let _ = write!(out, "%{b:02X}");
        }
    }
    out
}
impl Routes {
    /// TS: `program(id: string): string`.
    pub fn program(&self, id: &str) -> String {
        format!("/api/programs/{}", encode(id))
    }
    /// TS: `application(id: string): string`.
    pub fn application(&self, id: &str) -> String {
        format!("/api/applications/{}", encode(id))
    }
    /// TS: `approve(id: string): string`.
    pub fn approve(&self, id: &str) -> String {
        format!("{}/approve", self.application(id))
    }
    /// TS: `retry(id: string): string`.
    pub fn retry(&self, id: &str) -> String {
        format!("{}/retry", self.application(id))
    }
    /// TS: `resource(id: string): string`.
    pub fn resource(&self, id: &str) -> String {
        format!("/api/resources/{}", encode(id))
    }
    /// TS: `like(id: string): string`.
    pub fn like(&self, id: &str) -> String {
        format!("/api/likes/{}", encode(id))
    }
}
/// TS: `ROUTES`.
pub const ROUTES: Routes = Routes {
    health: "/api/health",
    home: "/api/home",
    programs: "/api/programs",
    categories: "/api/programs/categories",
    signup: "/api/auth/signup",
    login: "/api/auth/login",
    logout: "/api/auth/logout",
    me: "/api/auth/me",
    account: "/api/me",
    verify_email: "/api/auth/verify",
    resend_verification: "/api/auth/verify/resend",
    forgot_password: "/api/auth/forgot",
    change_password: "/api/auth/password",
    my_profile: "/api/me/profile",
    bufs_login: "/api/bufs/login",
    bufs_logout: "/api/bufs/logout",
    bufs_me: "/api/bufs/me",
    bufs_feedback: "/api/bufs/feedback",
    kstartup_sync: "/api/admin/kstartup/sync",
    session: "/api/mentor/session",
    profile: "/api/mentor/profile",
    chat: "/api/mentor/chat",
    summary: "/api/mentor/summary",
    result: "/api/mentor/result",
    plan: "/api/mentor/plan",
    feedback: "/api/mentor/feedback",
    survey: "/api/mentor/survey",
    type_test: "/api/type-test",
    applications: "/api/applications",
    stats: "/api/admin/stats",
    explore_options: "/api/explore/options",
    problems: "/api/explore/problems",
    explore: "/api/explore/session",
    start: "/api/explore/start",
    exploration: "/api/explore/exploration",
    explore_chat: "/api/explore/chat",
    explore_summary: "/api/explore/summary",
    explore_result: "/api/explore/result",
    conditions: "/api/explore/conditions",
    prep_done: "/api/explore/prep",
    explore_feedback: "/api/explore/feedback",
    events: "/api/explore/events",
    resources: "/api/resources",
    likes: "/api/likes",
};
