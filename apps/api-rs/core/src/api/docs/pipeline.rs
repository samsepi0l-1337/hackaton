//! TS 원본: apps/api/src/docs/pipeline.ts
use super::parse::{parse_document, DocFile};
use crate::{
    jsstr,
    ports::{Env, Ports},
    time,
};
use base64::{
    alphabet,
    engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig},
    engine::DecodePaddingMode,
    Engine,
};
use serde_json::{json, Value};
use std::{future::Future, pin::Pin};

/// TS: export const SUMMARY_TIMEOUT_MS = 10_000;
pub const SUMMARY_TIMEOUT_MS: u64 = 10_000;
/// TS: export const MAX_SUMMARY_ATTEMPTS = 3;
pub const MAX_SUMMARY_ATTEMPTS: i64 = 3;
/// TS: export interface DocWorkerClient { fetch(path: string, body: unknown): Promise<Response>; }
pub use crate::ports::Ports as DocWorkerClient;
/// TS: export type FormResult = { attachment: Attachment; parsed: ParsedDocument; fields: ExtractedField[]; summary: string | null; cached: boolean } | { error: string };
pub type FormResult = Value;
/// TS: export interface ParsedDocCache { get(url: string): ParsedDocRecord | undefined; put(r: ParsedDocRecord): void; }
pub trait ParsedDocCache {
    fn get(&self, url: &str) -> Option<Value>;
    fn put(&mut self, record: Value);
}
/// TS: summarize?: (doc: ParsedDocument) => Promise<string | null>
pub type Summarizer<'a> = dyn Fn(Value) -> Pin<Box<dyn Future<Output = Option<String>> + 'a>> + 'a;
/// TS: export interface PipelineDeps
pub struct PipelineDeps<'a> {
    pub ports: &'a dyn Ports,
    pub docs: Option<&'a mut dyn ParsedDocCache>,
    pub summarize: Option<&'a Summarizer<'a>>,
    pub summary_timeout_ms: Option<u64>,
    pub now: i64,
}
/// TS: export function pickAttachment(list: Attachment[]): Attachment | null
pub fn pick_attachment(list: &[Value]) -> Option<Value> {
    list.iter()
        .filter(|a| a["kind"].as_str() != Some("unknown"))
        .min_by_key(|a| {
            let name = a["name"].as_str().unwrap_or("");
            let hint = if ["신청서", "사업계획서", "양식", "서식"]
                .iter()
                .any(|h| name.contains(h))
            {
                0
            } else {
                100
            };
            hint + match a["kind"].as_str() {
                Some("hwpx") => 0,
                Some("docx") => 1,
                Some("hwp") => 2,
                Some("pdf") => 3,
                _ => 9,
            }
        })
        .cloned()
}
/// TS: export function base64ToBytes(b64: string): Uint8Array
pub fn base64_to_bytes(b64: &str) -> Result<Vec<u8>, String> {
    let clean: String = b64
        .chars()
        .filter(|c| !matches!(c, '\t' | '\n' | '\r' | '\u{000c}' | ' '))
        .collect();
    GeneralPurpose::new(
        &alphabet::STANDARD,
        GeneralPurposeConfig::new().with_decode_padding_mode(DecodePaddingMode::Indifferent),
    )
    .decode(clean)
    .map_err(|e| e.to_string())
}
async fn summary(deps: &PipelineDeps<'_>, doc: Value) -> Option<String> {
    let f = deps.summarize?;
    time::timeout(
        deps.ports,
        deps.summary_timeout_ms.unwrap_or(SUMMARY_TIMEOUT_MS),
        f(doc),
    )
    .await
    .flatten()
}
fn save(deps: &mut PipelineDeps<'_>, record: Value) {
    if let Some(cache) = deps.docs.as_deref_mut() {
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| cache.put(record)));
    }
}
async fn call(ports: &dyn Ports, path: &str, body: Value) -> Result<Value, String> {
    let response = match ports.doc_worker(path, &body).await {
        Some(Ok(r)) => r,
        Some(Err(e)) => return Err(format!("{path} 호출 실패: {e}")),
        None => return Err(format!("{path} 호출 실패: doc-worker unavailable")),
    };
    if !response.ok() {
        let mut msg = format!("{path} {}", response.status);
        if let Some(message) = response
            .json()
            .and_then(|v| v["error"]["message"].as_str().map(str::to_string))
            .filter(|s| !s.is_empty())
        {
            msg.push_str(&format!(": {message}"));
        }
        return Err(msg);
    }
    response
        .json()
        .ok_or_else(|| format!("{path} 호출 실패: invalid JSON"))
}
fn parsed_from_hit(hit: &Value) -> Value {
    json!({"fileName":hit["fileName"],"kind":hit["kind"],"text":hit["text"],"fields":hit["fields"],"warnings":hit["warnings"]})
}
fn cut_array(v: &Value, count: usize, field: Option<&str>) -> Vec<Value> {
    v.as_array()
        .map(|a| {
            a.iter()
                .take(count)
                .map(|v| {
                    let mut result = v.clone();
                    if let Some(key) = field {
                        if let Some(s) = v[key].as_str() {
                            result[key] = json!(jsstr::take16(s, 300));
                        }
                    } else if let Some(s) = v.as_str() {
                        result = json!(jsstr::take16(s, 300));
                    }
                    result
                })
                .collect()
        })
        .unwrap_or_default()
}
/// TS: export async function readAnnouncementForm(env: Bindings, deps: PipelineDeps, pageUrl: string): Promise<FormResult>
pub async fn read_announcement_form(
    env: &Env,
    deps: &mut PipelineDeps<'_>,
    page_url: &str,
) -> Value {
    let found = match call(deps.ports, "/discover", json!({"pageUrl":page_url})).await {
        Ok(v) => v,
        Err(e) => return json!({"error":e}),
    };
    let attachment = match pick_attachment(
        found["attachments"]
            .as_array()
            .map(Vec::as_slice)
            .unwrap_or(&[]),
    ) {
        Some(a) => a,
        None => return json!({"error":"공고 페이지에서 읽을 수 있는 첨부파일을 찾지 못했습니다"}),
    };
    let url = attachment["url"].as_str().unwrap_or("");
    if let Some(mut hit) = deps.docs.as_deref().and_then(|d| d.get(url)) {
        let parsed = parsed_from_hit(&hit);
        let mut sum = hit.get("summary").cloned().unwrap_or(Value::Null);
        let attempts = hit["summaryAttempts"].as_i64().unwrap_or(0);
        if sum.is_null() && deps.summarize.is_some() && attempts < MAX_SUMMARY_ATTEMPTS {
            sum = json!(summary(deps, parsed.clone()).await);
            if sum.is_null() {
                hit["summaryAttempts"] = json!(attempts + 1);
            } else {
                hit["summary"] = sum.clone();
            }
            save(deps, hit);
        }
        return json!({"attachment":attachment,"parsed":parsed,"fields":parsed["fields"],"summary":sum,"cached":true});
    }
    let dl = match call(
        deps.ports,
        "/download",
        json!({"url":url,"referer":page_url}),
    )
    .await
    {
        Ok(v) => v,
        Err(e) => return json!({"error":e}),
    };
    let bytes = match dl["fileBase64"]
        .as_str()
        .and_then(|s| base64_to_bytes(s).ok())
    {
        Some(b) => b,
        None => return json!({"error":"내려받은 파일을 해석하지 못했습니다"}),
    };
    let file_name = dl["fileName"]
        .as_str()
        .filter(|s| !s.is_empty())
        .or_else(|| attachment["name"].as_str())
        .unwrap_or("")
        .to_string();
    let parsed = match parse_document(env, deps.ports, &DocFile { bytes, file_name }).await {
        Some(p) => p,
        None => return json!({"error":"문서 읽기에 실패했습니다"}),
    };
    let sum = summary(deps, parsed.clone()).await;
    let record = json!({"url":url,"fileName":jsstr::take16(parsed["fileName"].as_str().unwrap_or(""),300),"kind":parsed["kind"],"text":parsed["text"],"fields":cut_array(&parsed["fields"],200,Some("label")),"warnings":cut_array(&parsed["warnings"],20,None),"summary":sum,"summaryAttempts":if sum.is_none(){1}else{0},"parsedAt":jsstr::iso(deps.now)});
    save(deps, record);
    json!({"attachment":attachment,"parsed":parsed,"fields":parsed["fields"],"summary":sum,"cached":false})
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        ports::HttpResp,
        testkit::{block_on, FakePorts},
    };
    #[test]
    fn ranking() {
        let a = vec![
            json!({"name":"공고문.hwpx","kind":"hwpx"}),
            json!({"name":"사업계획서.pdf","kind":"pdf"}),
        ];
        assert_eq!(pick_attachment(&a).unwrap_or_default()["kind"], "pdf");
        assert!(pick_attachment(&[json!({"kind":"unknown"})]).is_none());
    }
    struct Cache(Option<Value>);
    impl ParsedDocCache for Cache {
        fn get(&self, _: &str) -> Option<Value> {
            self.0.clone()
        }
        fn put(&mut self, v: Value) {
            self.0 = Some(v)
        }
    }
    #[test]
    fn missing_base64_is_an_error() {
        let ports = FakePorts::default();
        *ports.doc_worker.borrow_mut() = Some(Box::new(|path, _| {
            Ok(HttpResp {
                status: 200,
                headers: vec![],
                body: if path == "/discover" {
                    br#"{"attachments":[{"name":"a.pdf","url":"u","kind":"pdf"}]}"#.to_vec()
                } else {
                    b"{}".to_vec()
                },
            })
        }));
        let mut deps = PipelineDeps {
            ports: &ports,
            docs: None,
            summarize: None,
            summary_timeout_ms: None,
            now: 0,
        };
        assert_eq!(
            block_on(read_announcement_form(&Env::new(), &mut deps, "page")),
            json!({"error":"내려받은 파일을 해석하지 못했습니다"})
        );
        assert!(ports.fetched.borrow().is_empty());
    }
    #[test]
    fn full_flow_and_cache() {
        let ports = FakePorts::default();
        *ports.doc_worker.borrow_mut() = Some(Box::new(|path, _| {
            Ok(HttpResp {
                status: 200,
                headers: vec![],
                body: if path == "/discover" {
                    br#"{"attachments":[{"name":"a.pdf","url":"u","kind":"pdf"}]}"#.to_vec()
                } else {
                    br#"{"fileName":"a.pdf","fileBase64":"JVBERg=="}"#.to_vec()
                },
            })
        }));
        *ports.fetch.borrow_mut() = Some(Box::new(|_| {
            Ok(HttpResp {
                status: 200,
                headers: vec![],
                body: r#"{"content":{"markdown":"1. Example (500자 이내)"}}"#
                    .as_bytes()
                    .to_vec(),
            })
        }));
        let mut env = Env::new();
        env.insert("UPSTAGE_API_KEY".into(), "k".into());
        let mut cache = Cache(None);
        let summarizer = |_: Value| -> Pin<Box<dyn Future<Output = Option<String>>>> {
            Box::pin(async { Some("summary".into()) })
        };
        let mut deps = PipelineDeps {
            ports: &ports,
            docs: Some(&mut cache),
            summarize: Some(&summarizer),
            summary_timeout_ms: None,
            now: 1_795_741_200_000,
        };
        let first = block_on(read_announcement_form(&env, &mut deps, "page"));
        assert_eq!(first["cached"], false);
        assert_eq!(
            first
                .as_object()
                .map(|o| o.keys().map(String::as_str).collect::<Vec<_>>())
                .unwrap_or_default(),
            vec!["attachment", "parsed", "fields", "summary", "cached"]
        );
        assert_eq!(
            first["parsed"]
                .as_object()
                .map(|o| o.keys().map(String::as_str).collect::<Vec<_>>())
                .unwrap_or_default(),
            vec!["fileName", "kind", "text", "fields", "warnings"]
        );
        assert_eq!(first["summary"], "summary");
        assert_eq!(first["fields"][0]["maxLength"], 500);
        let second = block_on(read_announcement_form(&env, &mut deps, "page"));
        assert_eq!(second["cached"], true);
        assert_eq!(ports.fetched.borrow().len(), 1);
        assert_eq!(
            cache.0.unwrap_or_default()["parsedAt"],
            "2026-11-27T01:00:00.000Z"
        );
    }
    #[test]
    fn summary_timeout() {
        let ports = FakePorts::default();
        let slow = |_: Value| -> Pin<Box<dyn Future<Output = Option<String>> + '_>> {
            Box::pin(async {
                ports.sleep(200).await;
                Some("late".into())
            })
        };
        let deps = PipelineDeps {
            ports: &ports,
            docs: None,
            summarize: Some(&slow),
            summary_timeout_ms: Some(10),
            now: 0,
        };
        assert_eq!(block_on(summary(&deps, json!({}))), None);
    }
    #[test]
    fn cached_retries_are_bounded() {
        let ports = FakePorts::default();
        *ports.doc_worker.borrow_mut() = Some(Box::new(|_, _| {
            Ok(HttpResp {
                status: 200,
                headers: vec![],
                body: br#"{"attachments":[{"name":"a.pdf","url":"u","kind":"pdf"}]}"#.to_vec(),
            })
        }));
        let mut cache = Cache(Some(
            json!({"url":"u","fileName":"a.pdf","kind":"pdf","text":"x","fields":[],"warnings":[],"summary":null}),
        ));
        let summarizer = |_: Value| -> Pin<Box<dyn Future<Output = Option<String>>>> {
            Box::pin(async { None })
        };
        let mut deps = PipelineDeps {
            ports: &ports,
            docs: Some(&mut cache),
            summarize: Some(&summarizer),
            summary_timeout_ms: None,
            now: 0,
        };
        for _ in 0..5 {
            assert_eq!(
                block_on(read_announcement_form(&Env::new(), &mut deps, "page"))["cached"],
                true
            );
        }
        assert_eq!(cache.0.unwrap_or_default()["summaryAttempts"], 3);
    }
}
