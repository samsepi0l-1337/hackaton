use async_trait::async_trait;
use gil_core::ports::{HttpReq, HttpResp, Mail, Ports};
use serde_json::Value;
use std::io::Read;

pub struct SystemPorts;
#[async_trait(?Send)]
impl Ports for SystemPorts {
    async fn fetch(&self, _: HttpReq) -> Result<HttpResp, String> { Err("unused".into()) }
    async fn doc_worker(&self, _: &str, _: &Value) -> Option<Result<HttpResp, String>> { None }
    async fn ai_run(&self, _: &str, _: &Value, _: &Value) -> Option<Result<Value, String>> { None }
    async fn send_email(&self, _: &str, _: &Mail) -> Option<Result<(), String>> { None }
    async fn sleep(&self, _: u64) {}
    fn random_bytes(&self, n: usize) -> Vec<u8> {
        let mut bytes = vec![0; n];
        std::fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut bytes)).expect("failed to read random bytes");
        bytes
    }
    fn log(&self, _: &str, _: &str) {}
}

pub fn password() -> String {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).expect("failed to read password");
    if input.ends_with('\n') {
        input.pop();
        if input.ends_with('\r') { input.pop(); }
    }
    if input.is_empty() {
        eprintln!("표준 입력으로 비밀번호를 넣어 주세요.");
        std::process::exit(1);
    }
    input
}
