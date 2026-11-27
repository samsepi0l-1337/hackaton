//! 상담 횟수 제한 (계정별 7일 3회).
use crate::api::store::Store;
use crate::jsstr::{iso, parse_ms};
use crate::shared::explore::CONSULT_LIMIT;
use chrono::{DateTime, Datelike, Utc};
use serde_json::{json, Value};

const DAY_MS: i64 = 86_400_000;
#[derive(Clone, Copy)]
pub struct QuotaConfig { pub count: u32, pub window_days: u32 }
pub fn quota_config(overrides: Option<(u32, u32)>) -> QuotaConfig {
    let (count, window_days) = overrides.unwrap_or((CONSULT_LIMIT.count, CONSULT_LIMIT.window_days));
    QuotaConfig { count, window_days }
}
pub fn quota_keys(actor: Option<&Value>) -> Vec<String> {
    actor.and_then(|a| a.get("id")).and_then(Value::as_str).map(|id| vec![format!("u:{id}")]).unwrap_or_default()
}
fn live(times: &Value, now: i64, cfg: QuotaConfig) -> Vec<String> {
    let mut out: Vec<_> = times.as_array().into_iter().flatten().filter_map(Value::as_str)
        .filter(|t| parse_ms(t).is_some_and(|at| now - at < i64::from(cfg.window_days) * DAY_MS))
        .map(str::to_owned).collect();
    out.sort(); out
}
pub fn quota_status(store: &Store<'_>, keys: &[String], now: i64, cfg: QuotaConfig) -> Value {
    let per: Vec<_> = keys.iter().map(|k| live(&store.quota(k), now, cfg)).collect();
    let used = per.iter().map(Vec::len).max().unwrap_or(0);
    let blocked = used >= cfg.count as usize;
    let ms = i64::from(cfg.window_days) * DAY_MS;
    let reset = if blocked && cfg.count > 0 {
        per.iter().filter(|a| a.len() >= cfg.count as usize).filter_map(|a| parse_ms(&a[a.len() - cfg.count as usize])).max().map(|n| n + ms)
    } else if used > 0 {
        per.iter().filter(|a| a.len() == used).filter_map(|a| a.first().and_then(|s| parse_ms(s))).min().map(|n| n + ms)
    } else { None };
    json!({"used":used,"limit":cfg.count,"remaining":(cfg.count as usize).saturating_sub(used),"resetAt":reset.map(iso),"blocked":blocked})
}
pub fn record_consult(store: &mut Store<'_>, keys: &[String], now: i64, cfg: QuotaConfig) -> Result<(), String> {
    for key in keys { let mut times = live(&store.quota(key), now, cfg); times.push(iso(now)); store.set_quota(key, json!(times))?; }
    Ok(())
}
pub fn exempt_quota(cfg: QuotaConfig) -> Value { json!({"used":0,"limit":cfg.count,"remaining":cfg.count,"resetAt":null}) }
pub fn limit_message(q: &Value, cfg: QuotaConfig) -> String {
    let date = q["resetAt"].as_str().and_then(parse_ms).and_then(|ms| DateTime::<Utc>::from_timestamp_millis(ms + 9 * 3_600_000)).map(|d| format!("{}월 {}일",d.month(),d.day())).unwrap_or_else(|| "며칠 뒤".into());
    format!("이번 주 상담 {}회를 모두 사용했어요. {}부터 다시 할 수 있어요.",cfg.count,date)
}
