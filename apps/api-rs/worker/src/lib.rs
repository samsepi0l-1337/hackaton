//! Cloudflare Workers 어댑터. TS apps/api/src/index.ts + gil-app.ts 와 같은 구조:
//! /api/* → GilApp Durable Object(이름 'main'), 나머지 → ASSETS, cron → K-Startup 수집.
//! DocWorker(컨테이너)는 JS 클래스로 남는다 (js/entry.ts).
use async_trait::async_trait;
use futures::lock::Mutex;
use gil_core::app::{handle, init_store, AppOpts, Cx};
use gil_core::http::Req;
use gil_core::kv::{Change, MemKv};
use gil_core::ports::{Env as CoreEnv, HttpReq, HttpResp, Mail, Ports};
use serde_json::Value;
use wasm_bindgen::{JsCast, JsValue};
use worker::*;

/// TS Bindings 중 문자열 변수·secret.
const VARS: &[&str] = &[
    "AI_MODE",
    "UPSTAGE_API_KEY",
    "UPSTAGE_BASE_URL",
    "CF_AIG_TOKEN",
    "AI_GATEWAY_ID",
    "DECIDE_ENABLED",
    "DOC_WORKER_INTERNET",
    "IP_HASH_SALT",
    "KSTARTUP_SERVICE_KEY",
    "MAIL_FROM",
    "APP_ORIGIN",
    "PASSWORD_PEPPER",
    "ADMIN_PASSWORD_HASH",
    "TEST_MODE",
    "TEST_NOW",
    "TEST_FIXTURES",
    "E2E_MAIL_LOG",
];

fn js_get(obj: &JsValue, key: &str) -> Option<JsValue> {
    js_sys::Reflect::get(obj, &JsValue::from_str(key))
        .ok()
        .filter(|v| !v.is_undefined() && !v.is_null())
}
fn to_json(v: &JsValue) -> Option<Value> {
    let s = js_sys::JSON::stringify(v).ok()?.as_string()?;
    serde_json::from_str(&s).ok()
}
fn from_json(v: &Value) -> Result<JsValue> {
    js_sys::JSON::parse(&v.to_string()).map_err(|e| Error::RustError(format!("{e:?}")))
}

fn core_env(env: &Env) -> CoreEnv {
    let raw: &JsValue = env.as_ref();
    let mut m = CoreEnv::new();
    for k in VARS {
        if let Some(s) = js_get(raw, k).and_then(|v| v.as_string()) {
            m.insert((*k).into(), s);
        }
    }
    // 바인딩이 있는지만 문자열로 알린다 (core 는 Ports 로 쓴다).
    for b in ["EMAIL", "DOC_WORKER", "AI"] {
        if js_get(raw, b).is_some() {
            m.insert(b.into(), "1".into());
        }
    }
    if let Some(id) = js_get(raw, "CF_VERSION_METADATA")
        .and_then(|m| js_get(&m, "id"))
        .and_then(|v| v.as_string())
    {
        m.insert("CF_VERSION_ID".into(), id);
    }
    m
}

struct WorkerPorts {
    env: Env,
    version: String,
}

async fn call_promise(
    target: &JsValue,
    method: &str,
    args: &[JsValue],
) -> std::result::Result<JsValue, String> {
    let f: js_sys::Function = js_get(target, method)
        .and_then(|f| f.dyn_into().ok())
        .ok_or(format!("{method} missing"))?;
    let arr = js_sys::Array::new();
    for a in args {
        arr.push(a);
    }
    // Reflect.apply: RPC 바인딩에서 f.call 은 원격 메서드 'call' 로 해석된다.
    let p = js_sys::Reflect::apply(&f, target, &arr).map_err(|e| format!("{e:?}"))?;
    wasm_bindgen_futures::JsFuture::from(js_sys::Promise::resolve(&p))
        .await
        .map_err(|e| {
            js_get(&e, "code")
                .and_then(|c| c.as_string())
                .or_else(|| js_get(&e, "message").and_then(|m| m.as_string()))
                .unwrap_or_else(|| format!("{e:?}"))
        })
}

#[async_trait(?Send)]
impl Ports for WorkerPorts {
    async fn fetch(&self, r: HttpReq) -> std::result::Result<HttpResp, String> {
        let headers = Headers::new();
        for (k, v) in &r.headers {
            headers.set(k, v).map_err(|e| e.to_string())?;
        }
        let mut init = RequestInit::new();
        init.with_method(Method::from(r.method.to_uppercase()))
            .with_headers(headers);
        if let Some(form) = &r.form {
            use worker::worker_sys::web_sys;
            let fd = web_sys::FormData::new().map_err(|e| format!("{e:?}"))?;
            for (name, bytes, file) in form {
                match file {
                    Some(fname) => {
                        let parts = js_sys::Array::of1(&js_sys::Uint8Array::from(bytes.as_slice()));
                        let blob = web_sys::Blob::new_with_u8_array_sequence(&parts)
                            .map_err(|e| format!("{e:?}"))?;
                        fd.append_with_blob_and_filename(name, &blob, fname)
                            .map_err(|e| format!("{e:?}"))?;
                    }
                    None => {
                        fd.append_with_str(name, &String::from_utf8_lossy(bytes))
                            .map_err(|e| format!("{e:?}"))?;
                    }
                }
            }
            init.with_body(Some(fd.into()));
        } else if let Some(b) = &r.body {
            init.with_body(Some(js_sys::Uint8Array::from(b.as_slice()).into()));
        }
        let req = Request::new_with_init(&r.url, &init).map_err(|e| e.to_string())?;
        let fetch = Fetch::Request(req);
        let fut = fetch.send();
        let mut resp = match r.timeout_ms {
            Some(ms) => {
                let delay = Delay::from(std::time::Duration::from_millis(ms));
                futures::pin_mut!(fut);
                futures::pin_mut!(delay);
                match futures::future::select(fut, delay).await {
                    futures::future::Either::Left((res, _)) => res.map_err(|e| e.to_string())?,
                    futures::future::Either::Right(_) => return Err("timeout".into()),
                }
            }
            None => fut.await.map_err(|e| e.to_string())?,
        };
        let headers = resp.headers().entries().collect();
        let body = resp.bytes().await.map_err(|e| e.to_string())?;
        Ok(HttpResp {
            status: resp.status_code(),
            headers,
            body,
        })
    }
    async fn doc_worker(
        &self,
        path: &str,
        body: &Value,
    ) -> Option<std::result::Result<HttpResp, String>> {
        let ns = self.env.durable_object("DOC_WORKER").ok()?;
        let run = async {
            let stub = ns
                .id_from_name(&format!("doc-worker-{}", self.version))?
                .get_stub()?;
            let headers = Headers::new();
            headers.set("content-type", "application/json")?;
            let mut init = RequestInit::new();
            init.with_method(Method::Post)
                .with_headers(headers)
                .with_body(Some(JsValue::from_str(&body.to_string())));
            let mut resp = stub
                .fetch_with_request(Request::new_with_init(
                    &format!("http://doc-worker{path}"),
                    &init,
                )?)
                .await?;
            let headers = resp.headers().entries().collect();
            Ok::<_, Error>(HttpResp {
                status: resp.status_code(),
                headers,
                body: resp.bytes().await?,
            })
        };
        Some(run.await.map_err(|e| e.to_string()))
    }
    async fn ai_run(
        &self,
        model: &str,
        input: &Value,
        options: &Value,
    ) -> Option<std::result::Result<Value, String>> {
        let ai = js_get(self.env.as_ref(), "AI")?;
        // core 는 시간 제한을 options.__timeout_ms 로 넘긴다 (바인딩에는 넘기지 않는다).
        let mut opts = options.clone();
        let timeout = opts
            .as_object_mut()
            .and_then(|o| o.remove("__timeout_ms"))
            .and_then(|v| v.as_u64());
        let args = [
            JsValue::from_str(model),
            from_json(input).ok()?,
            from_json(&opts).ok()?,
        ];
        let run = call_promise(&ai, "run", &args);
        let res = match timeout {
            Some(ms) => {
                let delay = Delay::from(std::time::Duration::from_millis(ms));
                futures::pin_mut!(run);
                futures::pin_mut!(delay);
                match futures::future::select(run, delay).await {
                    futures::future::Either::Left((r, _)) => r,
                    futures::future::Either::Right(_) => Err("timeout".to_string()),
                }
            }
            None => run.await,
        };
        Some(res.map(|v| to_json(&v).unwrap_or(Value::Null)))
    }
    async fn send_email(&self, from: &str, m: &Mail) -> Option<std::result::Result<(), String>> {
        let b = js_get(self.env.as_ref(), "EMAIL")?;
        let msg = js_sys::Object::new();
        for (k, v) in [
            ("to", m.to.as_str()),
            ("from", from),
            ("subject", m.subject.as_str()),
            ("text", m.text.as_str()),
            ("html", m.html.as_str()),
        ] {
            let _ = js_sys::Reflect::set(&msg, &JsValue::from_str(k), &JsValue::from_str(v));
        }
        Some(call_promise(&b, "send", &[msg.into()]).await.map(|_| ()))
    }
    async fn sleep(&self, ms: u64) {
        Delay::from(std::time::Duration::from_millis(ms)).await;
    }
    fn random_bytes(&self, n: usize) -> Vec<u8> {
        let mut b = vec![0u8; n];
        getrandom::getrandom(&mut b).expect("getrandom");
        b
    }
    fn log(&self, level: &str, msg: &str) {
        match level {
            "error" => console_error!("{}", msg),
            "warn" => console_warn!("{}", msg),
            _ => console_log!("{}", msg),
        }
    }
}

#[durable_object]
pub struct GilApp {
    state: State,
    env: Env,
    kv: Mutex<Option<MemKv>>,
}

impl GilApp {
    fn opts(&self, env: &CoreEnv) -> AppOpts {
        let test = env.get("TEST_MODE").map(|s| s == "1").unwrap_or(false);
        AppOpts {
            seed_users: test,
            purge_test_data: !test,
            ..Default::default()
        }
    }
    fn ports(&self) -> WorkerPorts {
        let env = core_env(&self.env);
        WorkerPorts {
            env: self.env.clone(),
            version: env
                .get("CF_VERSION_ID")
                .cloned()
                .unwrap_or_else(|| "local".into()),
        }
    }
    async fn load(&self, ports: &WorkerPorts, env: &CoreEnv, now: i64) -> Result<MemKv> {
        let map = self.state.storage().list().await?;
        let mut entries = vec![];
        for e in map.entries() {
            let pair: js_sys::Array = e?.into();
            if let (Some(k), Some(v)) = (pair.get(0).as_string(), to_json(&pair.get(1))) {
                entries.push((k, v));
            }
        }
        if env.get("TEST_FIXTURES").map(|s| s == "1").unwrap_or(false) {
            gil_core::shared::data::use_test_fixtures();
        }
        let mut kv = MemKv::from_entries(entries);
        init_store(&mut kv, now, &self.opts(env), ports);
        Ok(kv)
    }
    async fn persist(&self, kv: &mut MemKv) -> Result<()> {
        let st = self.state.storage();
        for c in kv.take_changes() {
            match c {
                Change::Put(k, v) => st.put_raw(&k, from_json(&v)?).await?,
                Change::Delete(k) => {
                    st.delete(&k).await?;
                }
            }
        }
        Ok(())
    }
}

fn now_ms(env: &CoreEnv) -> i64 {
    // 차등 시험용 고정 시각: TEST_MODE=1 일 때만 TEST_NOW 를 쓴다.
    if env.get("TEST_MODE").map(|s| s == "1").unwrap_or(false) {
        if let Some(t) = env
            .get("TEST_NOW")
            .and_then(|s| gil_core::jsstr::parse_ms(s))
        {
            return t;
        }
    }
    Date::now().as_millis() as i64
}

impl DurableObject for GilApp {
    fn new(state: State, env: Env) -> Self {
        GilApp {
            state,
            env,
            kv: Mutex::new(None),
        }
    }

    async fn fetch(&self, mut req: Request) -> Result<Response> {
        let env = core_env(&self.env);
        let ports = self.ports();
        let now = now_ms(&env);
        let mut guard = self.kv.lock().await;
        if guard.is_none() {
            *guard = Some(self.load(&ports, &env, now).await?);
        }
        let url = req.url()?;
        // 내부 경로: cron 이 보내는 K-Startup 수집 (main 이 /api/* 만 넘기므로 밖에서는 닿지 않는다).
        if url.path() == "/__internal/kstartup-sync" {
            let kv = guard.as_mut().unwrap();
            let r = gil_core::api::kstartup::sync::run_sync(kv, &env, &ports, now).await;
            self.persist(kv).await?;
            return Response::from_json(&r);
        }
        // 차등 시험용 초기화: TEST_MODE=1 에서만.
        if url.path() == "/api/__test/reset"
            && env.get("TEST_MODE").map(|s| s == "1").unwrap_or(false)
        {
            self.state.storage().delete_all().await?;
            *guard = Some(self.load(&ports, &env, now).await?);
            let kv = guard.as_mut().unwrap();
            self.persist(kv).await?;
            return Response::from_json(&serde_json::json!({ "ok": true }));
        }
        let body = match req.method() {
            Method::Get | Method::Head => None,
            _ => req.text().await.ok().filter(|s| !s.is_empty()),
        };
        let core_req = Req {
            method: req.method().to_string(),
            url: url.to_string(),
            path: url.path().to_string(),
            query: url.query_pairs().into_owned().collect(),
            headers: req.headers().entries().collect(),
            body,
        };
        let opts = self.opts(&env);
        let kv = guard.as_mut().unwrap();
        let resp = {
            let mut cx = Cx {
                env: &env,
                kv,
                ports: &ports,
                opts: &opts,
                now,
                user: None,
            };
            handle(&mut cx, &core_req).await
        };
        self.persist(kv).await?;
        let headers = Headers::new();
        for (k, v) in &resp.headers {
            headers.append(k, v)?;
        }
        Ok(Response::from_bytes(resp.body.into_bytes())?
            .with_status(resp.status)
            .with_headers(headers))
    }
}

#[event(fetch)]
async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let path = req.path();
    if path.starts_with("/api/") {
        let stub = env
            .durable_object("APP")?
            .id_from_name("main")?
            .get_stub()?;
        return stub.fetch_with_request(req).await;
    }
    if let Ok(assets) = env.assets("ASSETS") {
        return assets.fetch_request(req).await;
    }
    Response::error("Not found", 404)
}

#[event(scheduled)]
async fn scheduled(_e: ScheduledEvent, env: Env, _ctx: ScheduleContext) {
    let run = async {
        let stub = env
            .durable_object("APP")?
            .id_from_name("main")?
            .get_stub()?;
        let mut r = stub
            .fetch_with_str("http://internal/__internal/kstartup-sync")
            .await?;
        console_log!("[kstartup] {}", r.text().await?);
        Ok::<_, Error>(())
    };
    if let Err(e) = run.await {
        console_error!("[kstartup] {}", e);
    }
}
