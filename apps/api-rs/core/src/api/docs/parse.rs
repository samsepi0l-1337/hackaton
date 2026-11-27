//! TS 원본: apps/api/src/docs/parse.ts
use super::fields::extract_fields;
use crate::{
    api::ai::upstage::{upstage_headers, upstage_ready},
    jsstr,
    ports::{Env, HttpReq, Ports},
    shared::cloudflare::{DOCUMENT_PARSE_MAX_BYTES, DOCUMENT_PARSE_MODEL, UPSTAGE_BASE_URL},
};
use serde_json::{json, Value};

/// TS: export const MAX_TEXT_CHARS = 50_000;
pub const MAX_TEXT_CHARS: usize = 50_000;
/// TS: export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
pub use crate::ports::Ports as FetchFn;
/// TS: export interface DocFile { bytes: Uint8Array; fileName: string; }
pub struct DocFile {
    pub bytes: Vec<u8>,
    pub file_name: String,
}
/// TS: export function kindOf(fileName: string, bytes?: Uint8Array): DocKind
pub fn kind_of(file_name: &str, bytes: Option<&[u8]>) -> &'static str {
    let lower = file_name.to_lowercase();
    let ext = lower
        .trim_end()
        .rsplit_once('.')
        .map(|(_, e)| e)
        .unwrap_or("");
    match ext {
        "hwpx" => return "hwpx",
        "docx" => return "docx",
        "pdf" => return "pdf",
        "hwp" => return "hwp",
        _ => {}
    }
    let b = bytes.unwrap_or_default();
    if b.len() < 4 {
        return "unknown";
    }
    if b.starts_with(b"%PDF") {
        return "pdf";
    }
    if b.starts_with(&[0xd0, 0xcf, 0x11, 0xe0]) {
        return "hwp";
    }
    if b.starts_with(b"PK\x03\x04") {
        let head = String::from_utf8_lossy(&b[..b.len().min(2048)]);
        if head.contains("hwpml") || head.contains("mimetype") {
            return "hwpx";
        }
        if head.contains("[Content_Types]") || head.contains("word/") {
            return "docx";
        }
    }
    "unknown"
}
/// TS: export async function parseDocument(env: Bindings, file: DocFile, opts?: { fetch?: FetchFn }): Promise<ParsedDocument | null>
pub async fn parse_document(env: &Env, ports: &dyn Ports, file: &DocFile) -> Option<Value> {
    if file.bytes.len() > DOCUMENT_PARSE_MAX_BYTES as usize {
        ports.log(
            "warn",
            &format!(
                "[docs] 파일이 너무 큼: {} ({} bytes)",
                file.file_name,
                file.bytes.len()
            ),
        );
        return None;
    }
    let base = env
        .get("UPSTAGE_BASE_URL")
        .filter(|s| !s.is_empty())
        .map(String::as_str)
        .unwrap_or(UPSTAGE_BASE_URL);
    if !upstage_ready(env) {
        ports.log(
            "warn",
            "[docs] Upstage 설정 없음 (키 또는 게이트웨이), 문서 파싱 생략",
        );
        return None;
    }
    let headers = upstage_headers(env, &Default::default())
        .into_iter()
        .collect();
    let form = vec![
        (
            "model".into(),
            DOCUMENT_PARSE_MODEL.as_bytes().to_vec(),
            None,
        ),
        ("mode".into(), b"standard".to_vec(), None),
        ("ocr".into(), b"auto".to_vec(), None),
        (
            "output_formats".into(),
            b"['markdown','text']".to_vec(),
            None,
        ),
        ("coordinates".into(), b"false".to_vec(), None),
        (
            "document".into(),
            file.bytes.clone(),
            Some(file.file_name.clone()),
        ),
    ];
    let response = match ports
        .fetch(HttpReq {
            method: "POST".into(),
            url: format!("{}/document-digitization", base.trim_end_matches('/')),
            headers,
            form: Some(form),
            // 응답이 멈추면 끝없이 기다리지 않는다 (지원서 작성 전체 제한 30초 안).
            timeout_ms: Some(25_000),
            ..Default::default()
        })
        .await
    {
        Ok(response) => response,
        Err(e) => {
            ports.log("warn", &format!("[docs] Document Parse 실패: {e}"));
            return None;
        }
    };
    if !response.ok() {
        ports.log(
            "warn",
            &format!("[docs] Document Parse {}", response.status),
        );
        return None;
    }
    let data: Value = match serde_json::from_slice(&response.body) {
        Ok(data) => data,
        Err(e) => {
            ports.log("warn", &format!("[docs] Document Parse 실패: {e}"));
            return None;
        }
    };
    let content = &data["content"];
    let mut text = ["markdown", "text"]
        .iter()
        .filter_map(|k| content[*k].as_str())
        .map(str::trim)
        .find(|s| !s.is_empty())
        .unwrap_or("")
        .to_string();
    if text.is_empty() {
        if let Some(elements) = data["elements"].as_array() {
            text = elements
                .iter()
                .filter_map(|e| {
                    let c = &e["content"];
                    c["markdown"]
                        .as_str()
                        .filter(|s| !s.is_empty())
                        .or_else(|| c["text"].as_str().filter(|s| !s.is_empty()))
                })
                .collect::<Vec<_>>()
                .join("\n");
        }
    }
    if text.is_empty() {
        ports.log("warn", "[docs] Document Parse 응답에 본문 없음");
        return None;
    }
    let mut warnings = vec![];
    if jsstr::len16(&text) > MAX_TEXT_CHARS {
        text = jsstr::take16(&text, MAX_TEXT_CHARS);
        warnings.push(format!("본문이 {MAX_TEXT_CHARS}자를 넘어 잘랐습니다"));
    }
    Some(
        json!({"fileName":file.file_name,"kind":kind_of(&file.file_name,Some(&file.bytes)),"text":text,"fields":extract_fields(&text),"warnings":warnings}),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        ports::HttpResp,
        testkit::{block_on, FakePorts},
    };
    #[test]
    fn kinds() {
        assert_eq!(kind_of("a.HWPX", None), "hwpx");
        assert_eq!(kind_of("x", Some(b"%PDF")), "pdf");
        assert_eq!(kind_of("x", Some(&[0xd0, 0xcf, 0x11, 0xe0])), "hwp");
        assert_eq!(kind_of("x", Some(b"abcd")), "unknown");
    }
    #[test]
    fn logs_failures() {
        let ports = FakePorts::default();
        let file = DocFile {
            bytes: vec![1],
            file_name: "a.pdf".into(),
        };
        assert!(block_on(parse_document(&Env::new(), &ports, &file)).is_none());
        assert_eq!(
            ports
                .logs
                .borrow()
                .last()
                .map(|x| x.1.as_str())
                .unwrap_or(""),
            "[docs] Upstage 설정 없음 (키 또는 게이트웨이), 문서 파싱 생략"
        );
        let mut env = Env::new();
        env.insert("UPSTAGE_API_KEY".into(), "k".into());
        *ports.fetch.borrow_mut() = Some(Box::new(|_| Err("boom".into())));
        assert!(block_on(parse_document(&env, &ports, &file)).is_none());
        assert_eq!(
            ports
                .logs
                .borrow()
                .last()
                .map(|x| x.1.as_str())
                .unwrap_or(""),
            "[docs] Document Parse 실패: boom"
        );
        *ports.fetch.borrow_mut() = Some(Box::new(|_| {
            Ok(HttpResp {
                status: 500,
                headers: vec![],
                body: vec![],
            })
        }));
        assert!(block_on(parse_document(&env, &ports, &file)).is_none());
        assert_eq!(
            ports
                .logs
                .borrow()
                .last()
                .map(|x| x.1.as_str())
                .unwrap_or(""),
            "[docs] Document Parse 500"
        );
        *ports.fetch.borrow_mut() = Some(Box::new(|_| {
            Ok(HttpResp {
                status: 200,
                headers: vec![],
                body: b"{}".to_vec(),
            })
        }));
        assert!(block_on(parse_document(&env, &ports, &file)).is_none());
        assert_eq!(
            ports
                .logs
                .borrow()
                .last()
                .map(|x| x.1.as_str())
                .unwrap_or(""),
            "[docs] Document Parse 응답에 본문 없음"
        );
    }
    #[test]
    fn request_and_parse() {
        let ports = FakePorts::default();
        *ports.fetch.borrow_mut() = Some(Box::new(|_| {
            Ok(HttpResp {
                status: 200,
                headers: vec![],
                body: br#"{"content":{"markdown":"test"}}"#.to_vec(),
            })
        }));
        let mut env = Env::new();
        env.insert("UPSTAGE_API_KEY".into(), "k".into());
        let result = block_on(parse_document(
            &env,
            &ports,
            &DocFile {
                bytes: vec![1],
                file_name: "a.pdf".into(),
            },
        ));
        assert_eq!(result.unwrap_or_default()["text"], "test");
        assert_eq!(
            ports.fetched.borrow()[0]
                .form
                .as_ref()
                .and_then(|f| f.last())
                .and_then(|f| f.2.as_deref()),
            Some("a.pdf")
        );
    }
}
