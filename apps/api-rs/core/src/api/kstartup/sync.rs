//! TS 원본: apps/api/src/kstartup/sync.ts

use crate::kv::MemKv;
use crate::ports::{Env, Ports};
use serde_json::Value;

/// TS runSync: 매일 cron 이 부른다. KStartupSyncResponse JSON 을 돌려준다.
pub async fn run_sync(_kv: &mut MemKv, _env: &Env, _ports: &dyn Ports, _now: i64) -> Value {
    serde_json::json!({ "ok": false, "error": "not_implemented" })
}
