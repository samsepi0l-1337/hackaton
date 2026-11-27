//! 바깥 세계와 닿는 곳. Workers 구현은 `gil-worker`, 테스트 구현은 `testkit`.
use async_trait::async_trait;
use std::collections::BTreeMap;

/// 바인딩·변수 (TS `Bindings` 의 문자열 값). 없으면 키가 없다.
pub type Env = BTreeMap<String, String>;

#[derive(Clone, Debug, Default)]
pub struct HttpReq {
    pub method: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<Vec<u8>>,
    /// multipart 등 바이트 본문 대신 쓰는 form 필드 (이름, 값, 파일 이름). Document Parse 용.
    pub form: Option<Vec<(String, Vec<u8>, Option<String>)>>,
    /// 이 시간(ms)이 지나면 실패로 본다. None 이면 플랫폼 기본.
    pub timeout_ms: Option<u64>,
}

#[derive(Clone, Debug)]
pub struct HttpResp {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl HttpResp {
    pub fn ok(&self) -> bool {
        (200..300).contains(&self.status)
    }
    pub fn text(&self) -> String {
        String::from_utf8_lossy(&self.body).into_owned()
    }
    pub fn json(&self) -> Option<serde_json::Value> {
        serde_json::from_slice(&self.body).ok()
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Mail {
    pub to: String,
    pub subject: String,
    pub text: String,
    pub html: String,
}

#[async_trait(?Send)]
pub trait Ports {
    /// 바깥 HTTP (Upstage, K-Startup 등). 네트워크 오류는 Err(메시지).
    async fn fetch(&self, req: HttpReq) -> Result<HttpResp, String>;
    /// doc-worker 컨테이너 (DOC_WORKER Durable Object). 바인딩이 없으면 None.
    async fn doc_worker(
        &self,
        path: &str,
        body: &serde_json::Value,
    ) -> Option<Result<HttpResp, String>>;
    /// Workers AI 바인딩 (route 모드, `env.AI.run(model, input, options)`). 바인딩이 없으면 None.
    /// options 의 "__timeout_ms" 는 어댑터가 꺼내 시간 제한으로 쓴다 (지나면 Err("timeout")). 바인딩이 있으면 env["AI"] = "1".
    async fn ai_run(
        &self,
        model: &str,
        input: &serde_json::Value,
        options: &serde_json::Value,
    ) -> Option<Result<serde_json::Value, String>>;
    /// EMAIL 바인딩 (`binding.send({to, from, subject, text, html})`). 바인딩이 없으면 None.
    async fn send_email(&self, from: &str, mail: &Mail) -> Option<Result<(), String>>;
    /// 암호학적 난수.
    fn random_bytes(&self, n: usize) -> Vec<u8>;
    /// console.log / warn / error. level: "log" | "warn" | "error".
    fn log(&self, level: &str, msg: &str);
}
