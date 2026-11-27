//! 문장 생성 어댑터. 실패하면 규칙 결과를 쓴다.
use super::upstage::{upstage_headers, upstage_ready};
use crate::ports::{Env, HttpReq, Ports};
use crate::shared::cloudflare::*;
use serde_json::{json, Value};
use std::collections::BTreeMap;

/// `resolveMode(env: Partial<Bindings>): AiMode`
pub fn resolve_mode(env: &Env) -> &'static str {
    match env
        .get("AI_MODE")
        .map(|s| s.trim().to_lowercase())
        .as_deref()
    {
        Some("upstage") if upstage_ready(env) => "upstage",
        Some("route") if env.get("AI").is_some_and(|s| s == "1") => "route",
        _ => "off",
    }
}

fn content_of(v: &Value) -> Option<String> {
    let value = v
        .pointer("/choices/0/message/content")
        .filter(|v| !v.is_null())
        .or_else(|| v.get("response").filter(|v| !v.is_null()))
        .or_else(|| v.pointer("/result/response"))?;
    value
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

pub struct TextAi<'a> {
    pub mode: &'static str,
    env: &'a Env,
    ports: &'a dyn Ports,
}
/// `createTextAi(env: Partial<Bindings> = {}, deps: AiDeps = {}): TextAi`
pub fn create_text_ai<'a>(env: &'a Env, ports: &'a dyn Ports) -> TextAi<'a> {
    TextAi {
        mode: resolve_mode(env),
        env,
        ports,
    }
}
impl TextAi<'_> {
    /// `generate(task: AiTask, messages: ChatMsg[], meta?: { userId?: string }): Promise<string | null>`
    pub async fn generate(
        &self,
        task: &str,
        messages: &[Value],
        user_id: Option<&str>,
    ) -> Option<String> {
        if self.mode == "off" {
            return None;
        }
        let metadata = json!({"app":"gil", "task":task, "user_id":user_id.unwrap_or("anon")});
        let timeout = AI_TIMEOUT_BY_TASK
            .iter()
            .find(|(k, _)| *k == task)
            .map(|(_, n)| *n)
            .unwrap_or(AI_TIMEOUT_MS);
        let result = if self.mode == "route" {
            let gateway = self
                .env
                .get("AI_GATEWAY_ID")
                .filter(|s| !s.is_empty())
                .map(String::as_str)
                .unwrap_or(AI_GATEWAY_ID_DEFAULT);
            self.ports
                .ai_run(
                    AI_ROUTE,
                    &json!({"messages":messages}),
                    &json!({"gateway":{"id":gateway,"metadata":metadata},"__timeout_ms":timeout}),
                )
                .await
                .unwrap_or_else(|| Err("AI binding unavailable".into()))
        } else {
            let base = self
                .env
                .get("UPSTAGE_BASE_URL")
                .filter(|s| !s.is_empty())
                .map(String::as_str)
                .unwrap_or(UPSTAGE_BASE_URL)
                .trim_end_matches('/');
            let mut extra = BTreeMap::new();
            extra.insert("content-type".into(), "application/json".into());
            extra.insert("cf-aig-metadata".into(), metadata.to_string());
            let model = SOLAR_MODELS
                .iter()
                .find(|(k, _)| *k == task)
                .map(|(_, v)| *v)
                .unwrap_or("");
            let req = HttpReq {
                method: "POST".into(),
                url: format!("{base}/chat/completions"),
                headers: upstage_headers(self.env, &extra).into_iter().collect(),
                body: Some(
                    json!({"model":model,"messages":messages})
                        .to_string()
                        .into_bytes(),
                ),
                timeout_ms: Some(u64::from(timeout)),
                ..Default::default()
            };
            match self.ports.fetch(req).await {
                Ok(r) if !r.ok() => Err(format!("http {}", r.status)),
                Ok(r) => serde_json::from_slice(&r.body).map_err(|e| e.to_string()),
                Err(e) => Err(e),
            }
        };
        match result {
            Ok(v) => content_of(&v),
            Err(e) => {
                self.ports.log(
                    "warn",
                    &format!("[ai] {task} 실패, 규칙 결과를 씁니다: {e}"),
                );
                None
            }
        }
    }
}
