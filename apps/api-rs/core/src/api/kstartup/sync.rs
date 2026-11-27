//! 실제 공고 수집. 실패하거나 불완전한 조회에서는 기존 자료를 보존한다.
use super::{client, store};
use crate::jsstr::iso;
use crate::kv::MemKv;
use crate::ports::{Env, Ports};
use crate::shared::{date::kst_date, kstartup_resource::kstartup_to_resource};
use serde_json::{json, Value};
use std::collections::HashSet;

fn is_open(v: &Value, today: &str) -> bool {
    v.get("recruitStatus").and_then(Value::as_str) != Some("closed")
        && !v
            .get("endDate")
            .and_then(Value::as_str)
            .is_some_and(|d| d < today)
}
fn counts(list: &[Value], today: &str) -> (usize, usize) {
    (
        list.len(),
        list.iter().filter(|v| is_open(v, today)).count(),
    )
}
fn same(a: &Value, b: &Value) -> bool {
    let mut a = a.clone();
    let mut b = b.clone();
    if let Some(o) = a.as_object_mut() {
        o.insert("checkedAt".into(), Value::Null);
    }
    if let Some(o) = b.as_object_mut() {
        o.insert("checkedAt".into(), Value::Null);
    }
    serde_json::to_string(&a).ok() == serde_json::to_string(&b).ok()
}
fn fail(
    kv: &mut MemKv,
    prev: Option<Value>,
    had: &[Value],
    today: &str,
    now: i64,
    error: &str,
) -> Value {
    let (total, open) = counts(had, today);
    let time = iso(now);
    store::save_meta(
        kv,
        json!({"fetchedAt": prev.and_then(|v| v.get("fetchedAt").cloned()).unwrap_or(Value::Null), "attemptedAt": time, "lastError": error, "total": total, "open": open, "closed": total-open, "added": 0, "updated": 0, "closedNow": 0}),
    );
    json!({"ok": false, "fetchedAt": time, "added": 0, "updated": 0, "closed": 0, "total": total, "error": error})
}

/// TS runSync: 매일 cron 이 부른다.
pub async fn run_sync(kv: &mut MemKv, env: &Env, ports: &dyn Ports, now: i64) -> Value {
    let today = kst_date(now);
    let prev = store::meta(kv);
    let had = store::resources(kv);
    let (items, complete) = match client::fetch_announcements(
        env.get("KSTARTUP_SERVICE_KEY").map(String::as_str),
        ports,
    )
    .await
    {
        Ok(v) => v,
        Err(e) => return fail(kv, prev, &had, &today, now, &e),
    };
    let mapped: Vec<Value> = items
        .iter()
        .map(|v| kstartup_to_resource(v, now))
        .filter(|v| !v.is_null())
        .collect();
    if mapped.is_empty() && had.iter().any(|v| is_open(v, &today)) {
        return fail(
            kv,
            prev,
            &had,
            &today,
            now,
            "K-Startup 응답에 공고가 없어요 (기존 자료 유지)",
        );
    }
    let mut all = had.clone();
    let mut writes = Vec::new();
    let mut seen = HashSet::new();
    let (mut added, mut updated, mut closed) = (0, 0, 0);
    for r in mapped {
        let Some(id) = r.get("id").and_then(Value::as_str).map(str::to_owned) else {
            continue;
        };
        seen.insert(id.clone());
        let pos = all
            .iter()
            .position(|v| v.get("id").and_then(Value::as_str) == Some(&id));
        let old = pos.map(|i| &all[i]);
        if old.is_none() {
            added += 1;
        } else if old.is_some_and(|v| !same(v, &r)) {
            updated += 1;
        }
        if r.get("recruitStatus").and_then(Value::as_str) == Some("closed")
            && old.is_none_or(|v| v.get("recruitStatus").and_then(Value::as_str) != Some("closed"))
        {
            closed += 1;
        }
        if let Some(i) = pos {
            all[i] = r.clone();
        } else {
            all.push(r.clone());
        }
        writes.push(r);
    }
    if complete {
        for old in &had {
            let Some(id) = old.get("id").and_then(Value::as_str) else {
                continue;
            };
            if seen.contains(id)
                || old.get("recruitStatus").and_then(Value::as_str) == Some("closed")
            {
                continue;
            }
            let mut r = old.clone();
            if let Some(o) = r.as_object_mut() {
                o.insert("recruitStatus".into(), json!("closed"));
                o.insert("checkedAt".into(), json!(today));
            }
            if let Some(i) = all
                .iter()
                .position(|v| v.get("id").and_then(Value::as_str) == Some(id))
            {
                all[i] = r.clone();
            }
            writes.push(r);
            closed += 1;
        }
    }
    store::save(kv, &writes);
    let (total, open) = counts(&all, &today);
    let time = iso(now);
    store::save_meta(
        kv,
        json!({"fetchedAt": time, "attemptedAt": time, "lastError": null, "total": total, "open": open, "closed": total-open, "added": added, "updated": updated, "closedNow": closed}),
    );
    json!({"ok": true, "fetchedAt": time, "added": added, "updated": updated, "closed": closed, "total": total, "error": null})
}
