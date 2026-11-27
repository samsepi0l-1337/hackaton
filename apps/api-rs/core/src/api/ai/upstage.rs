//! Upstage 호출 공통 인증 헤더.
use crate::ports::Env;
use std::collections::BTreeMap;

/// `viaGateway(env: Partial<Bindings>): boolean`
pub fn via_gateway(env: &Env) -> bool {
    env.get("CF_AIG_TOKEN").is_some_and(|s| !s.is_empty())
        && env
            .get("UPSTAGE_BASE_URL")
            .is_some_and(|s| s.contains("gateway.ai.cloudflare.com"))
}

/// `upstageReady(env: Partial<Bindings>): boolean`
pub fn upstage_ready(env: &Env) -> bool {
    via_gateway(env) || env.get("UPSTAGE_API_KEY").is_some_and(|s| !s.is_empty())
}

/// `upstageHeaders(env: Partial<Bindings>, extra: Record<string, string> = {}): Record<string, string>`
pub fn upstage_headers(env: &Env, extra: &BTreeMap<String, String>) -> BTreeMap<String, String> {
    let mut headers = extra.clone();
    if via_gateway(env) {
        if let Some(token) = env.get("CF_AIG_TOKEN") {
            headers.insert("cf-aig-authorization".into(), format!("Bearer {token}"));
        }
    } else if let Some(key) = env.get("UPSTAGE_API_KEY").filter(|s| !s.is_empty()) {
        headers.insert("authorization".into(), format!("Bearer {key}"));
    }
    headers
}
