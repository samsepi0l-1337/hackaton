//! 요청 한 건 처리: 세션 → 라우트 → 오류 본문. TS `createApp` 의 미들웨어·onError·notFound·cors 와 같다.
use crate::http::{HResult, HttpError, Req, Resp};
use crate::kv::MemKv;
use crate::ports::{Env, Ports};
use serde_json::{json, Value};

/// TS `AppOptions` 중 동작을 바꾸는 값 (테스트 덮어쓰기 포함).
#[derive(Clone, Debug, Default)]
pub struct AppOpts {
    /// 상담 횟수 제한 덮어쓰기 (count, windowDays). 기본 CONSULT_LIMIT.
    pub consult_limit: Option<(u32, u32)>,
    /// 탐색 AI 호출 한도 (행위자당 시간당). 기본 40.
    pub explore_ai_limit: Option<u32>,
    /// 테스트·데모용: 첫 제출 시도를 실패시킨다.
    pub fail_submit: bool,
    /// 시드 사용자(@test.local)를 넣는다. 로컬·테스트 true, 운영(GilApp) false.
    pub seed_users: bool,
    /// 운영 KV 에 남은 테스트 기록을 한 번 지운다.
    pub purge_test_data: bool,
}

/// 요청 하나의 문맥. TS 의 c.get('store'|'user'|'now'|'ai') + env.
pub struct Cx<'a> {
    pub env: &'a Env,
    pub kv: &'a mut MemKv,
    pub ports: &'a dyn Ports,
    pub opts: &'a AppOpts,
    /// 이 요청의 시각 (ms). TS `c.get('now')`.
    pub now: i64,
    /// 로그인 사용자 레코드 (UserRecord JSON + mustChangePassword). 없으면 None.
    pub user: Option<Value>,
}

impl Cx<'_> {
    pub fn env(&self, k: &str) -> Option<&str> {
        self.env
            .get(k)
            .map(|s| s.as_str())
            .filter(|s| !s.is_empty())
    }
}

/// 저장소 시작 (DO 생성 때 한 번, 테스트는 앱마다). TS `createStore(now, kv, opts)` 의 시드·정리.
pub fn init_store(kv: &mut MemKv, now: i64, opts: &AppOpts, ports: &dyn Ports) {
    crate::api::store::init(kv, now, opts, ports);
}

const CORS_ORIGIN: &str = "http://localhost:5173";

pub async fn handle(cx: &mut Cx<'_>, req: &Req) -> Resp {
    if !req.path.starts_with("/api/") {
        return HttpError::new(404, "not_found", "없는 경로예요").to_resp();
    }
    let origin = req.header("origin").map(|s| s.to_string());
    if req.method == "OPTIONS" {
        let mut r = Resp {
            status: 204,
            headers: vec![],
            body: String::new(),
        };
        if origin.as_deref() == Some(CORS_ORIGIN) {
            r.headers
                .push(("access-control-allow-origin".into(), CORS_ORIGIN.into()));
            r.headers
                .push(("access-control-allow-credentials".into(), "true".into()));
            r.headers.push((
                "access-control-allow-methods".into(),
                "GET,HEAD,PUT,POST,DELETE,PATCH".into(),
            ));
            if let Some(h) = req.header("access-control-request-headers") {
                r.headers
                    .push(("access-control-allow-headers".into(), h.into()));
            }
        }
        return r;
    }
    let out: HResult = async {
        crate::api::session::resolve(cx, req)?;
        crate::router::dispatch(cx, req).await
    }
    .await;
    let mut resp = match out {
        Ok(r) => r,
        Err(e) => e.to_resp(),
    };
    if origin.as_deref() == Some(CORS_ORIGIN) {
        resp.headers
            .push(("access-control-allow-origin".into(), CORS_ORIGIN.into()));
        resp.headers
            .push(("access-control-allow-credentials".into(), "true".into()));
    }
    resp
}

/// 예상 못 한 오류 (TS onError 의 비-HttpError 분기).
pub fn internal(cx: &Cx<'_>, what: &str) -> HttpError {
    cx.ports.log("error", what);
    HttpError::bad("요청을 처리하지 못했어요")
}

pub fn not_found_route() -> HResult {
    Err(HttpError::new(404, "not_found", "없는 경로예요"))
}
pub fn health() -> HResult {
    Resp::ok(json!({ "ok": true }))
}
