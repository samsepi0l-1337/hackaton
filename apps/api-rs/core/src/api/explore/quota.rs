//! 상담 채팅 횟수 제한 (계정별 한 주 12개 메시지, 일요일 0시 KST에 다시 채움). 지원서 작성은 최근 7일로 센다.
use crate::api::store::Store;
use crate::jsstr::{iso, parse_ms};
use crate::shared::explore::CONSULT_LIMIT;
use chrono::{DateTime, Datelike, Utc};
use serde_json::{json, Value};

const DAY_MS: i64 = 86_400_000;
#[derive(Clone, Copy)]
pub struct QuotaConfig { pub count: u32, pub window_days: u32, pub calendar_week: bool }
pub fn quota_config(overrides: Option<(u32, u32)>) -> QuotaConfig {
    let (count, window_days) = overrides.unwrap_or((CONSULT_LIMIT.count, CONSULT_LIMIT.window_days));
    QuotaConfig { count, window_days, calendar_week: false }
}
/// 상담 채팅: 최근 7일이 아니라 달력 주(일요일 0시 ~ 토요일, 한국 시간)로 센다.
pub fn chat_quota_config(overrides: Option<(u32, u32)>) -> QuotaConfig {
    QuotaConfig { calendar_week: true, ..quota_config(overrides) }
}
const KST_MS: i64 = 9 * 3_600_000;
/// 이번 주 일요일 0시(KST)의 UTC ms. 1970-01-01은 목요일이다.
pub fn week_start(now: i64) -> i64 {
    let day = (now + KST_MS).div_euclid(DAY_MS);
    (day - (day + 4).rem_euclid(7)) * DAY_MS - KST_MS
}
pub fn quota_keys(actor: Option<&Value>) -> Vec<String> {
    actor.and_then(|a| a.get("id")).and_then(Value::as_str).map(|id| vec![format!("chat:{id}")]).unwrap_or_default()
}
fn live(times: &Value, now: i64, cfg: QuotaConfig) -> Vec<String> {
    let mut out: Vec<_> = times.as_array().into_iter().flatten().filter_map(Value::as_str)
        .filter(|t| parse_ms(t).is_some_and(|at| if cfg.calendar_week { at >= week_start(now) } else { now - at < i64::from(cfg.window_days) * DAY_MS }))
        .map(str::to_owned).collect();
    out.sort(); out
}
pub fn quota_status(store: &Store<'_>, keys: &[String], now: i64, cfg: QuotaConfig) -> Value {
    let per: Vec<_> = keys.iter().map(|k| live(&store.quota(k), now, cfg)).collect();
    let used = per.iter().map(Vec::len).max().unwrap_or(0);
    let blocked = used >= cfg.count as usize;
    let ms = i64::from(cfg.window_days) * DAY_MS;
    let reset = if cfg.calendar_week {
        (used > 0).then(|| week_start(now) + 7 * DAY_MS)
    } else if blocked && cfg.count > 0 {
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
    format!("이번 주 AI 상담 채팅 {}회를 모두 보냈어요. {}(일) 0시부터 다시 보낼 수 있어요.",cfg.count,date)
}

#[cfg(test)]
mod week_tests {
    use super::*;
    #[test]
    fn week_starts_sunday_midnight_kst() {
        // 2026-11-28 (토) 08:00 KST → 2026-11-22 (일) 00:00 KST = 2026-11-21T15:00Z
        let now = parse_ms("2026-11-27T23:00:00.000Z").unwrap();
        assert_eq!(iso(week_start(now)), "2026-11-21T15:00:00.000Z");
        // 일요일 0시 정각은 새 주의 시작이다.
        let sun = parse_ms("2026-11-28T15:00:00.000Z").unwrap();
        assert_eq!(week_start(sun), sun);
        assert_eq!(week_start(sun - 1), parse_ms("2026-11-21T15:00:00.000Z").unwrap());
    }
}
