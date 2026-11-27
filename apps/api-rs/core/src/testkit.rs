//! 테스트 도구. TS `apps/api/test/helpers.ts` 의 setup()/client() 와 같은 역할.
//! 고정 시각(NOW), 메모리 KV, 가짜 fetch, 메일 보관, 쿠키를 들고 다니는 클라이언트.
use crate::app::{handle, init_store, AppOpts, Cx};
use crate::http::Req;
use crate::kv::MemKv;
use crate::ports::{Env, HttpReq, HttpResp, Mail, Ports};
use async_trait::async_trait;
use serde_json::Value;
use std::cell::{Cell, RefCell};

/// helpers.ts 의 NOW (2026-11-27T01:00:00Z).
pub const NOW: i64 = 1_795_741_200_000;
/// helpers.ts 의 TEST_PEPPER.
pub const TEST_PEPPER: &str = "test-pepper-not-a-secret";

pub type FetchFn = Box<dyn Fn(&HttpReq) -> Result<HttpResp, String>>;

pub struct FakePorts {
    pub fetch: RefCell<Option<FetchFn>>,
    pub fetched: RefCell<Vec<HttpReq>>,
    pub doc_worker: RefCell<Option<Box<dyn Fn(&str, &Value) -> Result<HttpResp, String>>>>,
    /// 보낸 메일 (EMAIL 바인딩이 없을 때 개발용 메일러가 쓰는 곳도 여기). 테스트가 인증 코드·링크를 읽는다.
    pub mails: RefCell<Vec<Mail>>,
    pub logs: RefCell<Vec<(String, String)>>,
    seq: Cell<u64>,
}

impl Default for FakePorts {
    fn default() -> Self {
        FakePorts {
            fetch: RefCell::new(None),
            fetched: RefCell::new(vec![]),
            doc_worker: RefCell::new(None),
            mails: RefCell::new(vec![]),
            logs: RefCell::new(vec![]),
            seq: Cell::new(1),
        }
    }
}

#[async_trait(?Send)]
impl Ports for FakePorts {
    async fn fetch(&self, req: HttpReq) -> Result<HttpResp, String> {
        self.fetched.borrow_mut().push(req.clone());
        match self.fetch.borrow().as_ref() {
            Some(f) => f(&req),
            None => Err("fetch not stubbed".into()),
        }
    }
    async fn doc_worker(&self, path: &str, body: &Value) -> Option<Result<HttpResp, String>> {
        self.doc_worker.borrow().as_ref().map(|f| f(path, body))
    }
    async fn ai_run(
        &self,
        _model: &str,
        _input: &Value,
        _options: &Value,
    ) -> Option<Result<Value, String>> {
        None
    }
    async fn send_email(&self, _from: &str, mail: &Mail) -> Option<Result<(), String>> {
        self.mails.borrow_mut().push(mail.clone());
        None
    }
    /// 가상 시간: ms 번 poll 될 때까지 Pending. 짧은 대기가 먼저 끝나므로 시간 제한 경쟁이 결정적이다.
    async fn sleep(&self, ms: u64) {
        let mut left = ms;
        std::future::poll_fn(|cx| {
            if left == 0 {
                return std::task::Poll::Ready(());
            }
            left -= 1;
            cx.waker().wake_by_ref();
            std::task::Poll::Pending
        })
        .await
    }
    /// 결정적 난수 (테스트마다 같은 순서).
    fn random_bytes(&self, n: usize) -> Vec<u8> {
        (0..n)
            .map(|_| {
                let s = self.seq.get();
                self.seq.set(
                    s.wrapping_mul(6364136223846793005)
                        .wrapping_add(1442695040888963407),
                );
                (s >> 33) as u8
            })
            .collect()
    }
    fn log(&self, level: &str, msg: &str) {
        self.logs.borrow_mut().push((level.into(), msg.into()));
    }
}

pub struct TestApp {
    pub kv: MemKv,
    pub env: Env,
    pub opts: AppOpts,
    pub now: i64,
    pub ports: FakePorts,
}

impl TestApp {
    /// helpers.ts setup(): 시드 사용자 포함, PASSWORD_PEPPER=TEST_PEPPER, NOW 고정.
    pub fn new() -> Self {
        Self::with(
            Env::new(),
            AppOpts {
                seed_users: true,
                ..Default::default()
            },
        )
    }
    pub fn with(mut env: Env, opts: AppOpts) -> Self {
        env.entry("PASSWORD_PEPPER".into())
            .or_insert_with(|| TEST_PEPPER.into());
        crate::shared::data::use_test_fixtures();
        let ports = FakePorts::default();
        let mut kv = MemKv::default();
        init_store(&mut kv, NOW, &opts, &ports);
        TestApp {
            kv,
            env,
            opts,
            now: NOW,
            ports,
        }
    }
    pub fn client(&self) -> Client {
        Client {
            cookie: String::new(),
        }
    }
    /// 요청 하나. (status, JSON 본문, set-cookie 목록)
    pub fn call(
        &mut self,
        client: &mut Client,
        method: &str,
        path: &str,
        body: Option<Value>,
    ) -> (u16, Value, Vec<String>) {
        let (p, q) = path.split_once('?').unwrap_or((path, ""));
        let query = url::form_urlencoded::parse(q.as_bytes())
            .into_owned()
            .collect();
        let mut headers = vec![];
        if body.is_some() {
            headers.push(("content-type".to_string(), "application/json".to_string()));
        }
        if !client.cookie.is_empty() {
            headers.push(("cookie".to_string(), client.cookie.clone()));
        }
        let req = Req {
            method: method.into(),
            url: format!("http://localhost{path}"),
            path: p.into(),
            query,
            headers,
            body: body.map(|b| b.to_string()),
        };
        let resp = {
            let mut cx = Cx {
                env: &self.env,
                kv: &mut self.kv,
                ports: &self.ports,
                opts: &self.opts,
                now: self.now,
                user: None,
            };
            block_on(handle(&mut cx, &req))
        };
        let cookies: Vec<String> = resp
            .headers
            .iter()
            .filter(|(k, _)| k.eq_ignore_ascii_case("set-cookie"))
            .map(|(_, v)| v.clone())
            .collect();
        if let Some(first) = cookies.first() {
            let kv = first.split(';').next().unwrap_or("");
            client.cookie = if kv.ends_with('=') {
                String::new()
            } else {
                kv.to_string()
            };
        }
        let v = serde_json::from_str(&resp.body).unwrap_or(Value::Null);
        (resp.status, v, cookies)
    }
}

impl Default for TestApp {
    fn default() -> Self {
        Self::new()
    }
}

pub struct Client {
    pub cookie: String,
}

/// 단일 스레드 실행기 (core 는 tokio 없이 시험한다).
pub fn block_on<F: std::future::Future>(f: F) -> F::Output {
    use std::task::{Context, Poll, RawWaker, RawWakerVTable, Waker};
    fn noop(_: *const ()) {}
    fn clone(p: *const ()) -> RawWaker {
        RawWaker::new(p, &VTABLE)
    }
    static VTABLE: RawWakerVTable = RawWakerVTable::new(clone, noop, noop, noop);
    let waker = unsafe { Waker::from_raw(RawWaker::new(std::ptr::null(), &VTABLE)) };
    let mut cx = Context::from_waker(&waker);
    let mut f = std::pin::pin!(f);
    loop {
        if let Poll::Ready(v) = f.as_mut().poll(&mut cx) {
            return v;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn timeout_shorter_wins() {
        let p = FakePorts::default();
        let fast = block_on(crate::time::timeout(&p, 10, async {
            p.sleep(3).await;
            1
        }));
        let slow = block_on(crate::time::timeout(&p, 10, async {
            p.sleep(200).await;
            1
        }));
        assert_eq!((fast, slow), (Some(1), None));
    }
    #[test]
    fn health_and_unknown_route() {
        let mut app = TestApp::new();
        let mut c = app.client();
        let (s, v, _) = app.call(&mut c, "GET", "/api/health", None);
        assert_eq!((s, v), (200, serde_json::json!({ "ok": true })));
        let (s, v, _) = app.call(&mut c, "GET", "/api/nope", None);
        assert_eq!(s, 404);
        assert_eq!(v["error"]["message"], "없는 경로예요");
    }
}
