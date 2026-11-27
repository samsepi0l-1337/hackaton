//! TS 원본: apps/api/src/explore/routes.ts (events, resources, likes)
use crate::api::app::common::{bad, conditions_from_profile, require_user, sha256_hex};
use crate::api::explore::sort::sort_cards;
use crate::api::store::Store;
use crate::app::Cx;
use crate::http::{HResult, HttpError, Req, Resp};
use crate::jsstr::js_trim;
use crate::shared::{explore, explore_rules, likes as shared_likes};
use serde_json::{json, Value};

fn actor(cx: &Cx<'_>) -> Option<String> {
    cx.user.as_ref()?.get("id")?.as_str().map(str::to_owned)
}
fn ids(cx: &mut Cx<'_>) -> Vec<Value> {
    let Some(id) = actor(cx) else { return vec![] };
    Store::new(cx.kv, cx.now)
        .likes(&id)
        .as_array()
        .cloned()
        .unwrap_or_default()
}
fn profile(ids: &[Value], resources: &[Value]) -> Option<shared_likes::LikeProfile> {
    if ids.is_empty() {
        return None;
    }
    let chosen: Vec<_> = resources
        .iter()
        .filter(|r| ids.contains(&r["id"]))
        .cloned()
        .collect();
    Some(shared_likes::like_profile(&chosen))
}
fn card(r: &Value, s: Option<&Value>, defaults: &Value, now: i64) -> Value {
    let start = s.map(|v| &v["start"]).unwrap_or(&Value::Null);
    let conditions = explore_rules::merge_conditions(&start["conditions"], defaults);
    let c = explore_rules::check_conditions(r, &conditions, now);
    let region = start["reviewRegion"].as_str().unwrap_or("");
    let region_match = !region.is_empty()
        && region != "미정"
        && r["regions"]
            .as_array()
            .is_some_and(|a| a.iter().any(|v| v == region || v == "부울경"));
    let content = r["content"].as_str().unwrap_or("");
    let reason = match r["target"].as_str().filter(|s| !s.is_empty()) {
        Some(t) => format!("{content} (대상: {t})"),
        None => content.to_owned(),
    };
    json!({"resource":r,"reason":reason,"reasonProvenance":"rule","condition":{"status":c["status"],"checks":c["checks"]},"regionMatch":region_match})
}
fn fit(c: &Value, prefs: Option<&shared_likes::LikeProfile>, readiness: Option<&str>) -> f64 {
    let checks = c["condition"]["checks"].as_array();
    let matching = checks
        .into_iter()
        .flatten()
        .filter(|x| x["key"] != "period" && x["status"] == "match")
        .count() as f64;
    let mismatch = checks
        .into_iter()
        .flatten()
        .any(|x| x["key"] != "period" && x["status"] == "mismatch");
    let stage = readiness.is_some_and(|r| {
        c["resource"]["stages"]
            .as_array()
            .is_some_and(|a| a.iter().any(|x| x == r))
    });
    ((3.0 * shared_likes::like_similarity(&c["resource"], prefs) + matching * 0.5
        - if mismatch { 3.0 } else { 0.0 }
        + if stage { 1.0 } else { 0.0 })
        * 1000.0)
        .round()
        / 1000.0
}
fn defaults(cx: &mut Cx<'_>, id: Option<&str>) -> Value {
    id.and_then(|id| conditions_from_profile(&Store::new(cx.kv, cx.now).basic_profile(id)))
        .unwrap_or(Value::Null)
}
fn likes_body(ids: &[Value], resources: &[Value]) -> Value {
    let p = profile(ids, resources);
    json!({"ids":ids,"topics":shared_likes::like_topics(p.as_ref())})
}
fn viewer(cx: &Cx<'_>, req: &Req) -> String {
    if let Some(id) = actor(cx) {
        return format!("u:{id}");
    }
    let ip = req
        .header("cf-connecting-ip")
        .map(js_trim)
        .filter(|s| !s.is_empty())
        .or_else(|| {
            req.header("x-forwarded-for")
                .and_then(|s| s.split(',').next())
                .map(js_trim)
                .filter(|s| !s.is_empty())
        })
        .unwrap_or("local");
    format!(
        "h:{}",
        sha256_hex(&format!(
            "view:{ip}|{}",
            req.header("user-agent").unwrap_or("")
        ))
    )
}
/// POST /api/explore/events
pub async fn post_events(cx: &mut Cx<'_>, req: &Req) -> HResult {
    use crate::api::explore::state::{actor_id, bump, open, save, text, touch};
    let id = actor_id(cx)?;
    let b = req.json_object()?;
    let event = b.get("type").and_then(Value::as_str).filter(|s| ["start", "chat_done", "result", "resource_link", "regional_expand", "feedback"].contains(s)).ok_or_else(|| bad("type 값이 올바르지 않아요"))?;
    let mut state = open(cx, &id)?;
    if event == "resource_link" {
        if let Some(resource_id) = b.get("resourceId").and_then(|v| text(v, 120)).filter(|id| crate::api::explore::state::resources_now(cx).iter().any(|r| r["id"] == *id)) {
            let who = viewer(cx, req);
            Store::new(cx.kv, cx.now).record_view(&resource_id, &who, cx.now).map_err(|_| bad("요청을 처리하지 못했어요"))?;
        }
    }
    bump(&mut state, event);
    touch(&mut state, cx.now);
    save(cx, &id, &state)?;
    Resp::ok(json!({"ok": true}))
}
/// GET /api/resources
pub async fn list(cx: &mut Cx<'_>, req: &Req) -> HResult {
    let typ = req.query("type").filter(|s| !s.is_empty());
    let stage = req.query("stage").filter(|s| !s.is_empty());
    let sort = req
        .query("sort")
        .filter(|s| !s.is_empty())
        .unwrap_or("deadline");
    if typ.is_some_and(|s| !explore::RESOURCE_TYPES.contains(&s)) {
        return Err(bad("type 값이 올바르지 않아요"));
    }
    if stage.is_some_and(|s| !explore::READINESS_STAGES.contains(&s)) {
        return Err(bad("stage 값이 올바르지 않아요"));
    }
    if !explore::RESOURCE_SORTS.contains(&sort) {
        return Err(bad("sort 값이 올바르지 않아요"));
    }
    let q = req.query("q").map(js_trim).unwrap_or("").to_lowercase();
    let user = actor(cx);
    let state = user
        .as_deref()
        .and_then(|id| Store::new(cx.kv, cx.now).explore(id));
    let default = defaults(cx, user.as_deref());
    let resources = crate::api::explore::state::resources_now(cx);
    let liked = ids(cx);
    let prefs = profile(&liked, &resources);
    let counts = Store::new(cx.kv, cx.now).view_counts();
    let mut cards = Vec::new();
    for r in &resources {
        if typ.is_some_and(|t| {
            r["type"] != t
                && !r["capabilityTags"]
                    .as_array()
                    .is_some_and(|a| a.iter().any(|x| x == t))
        }) {
            continue;
        }
        if stage.is_some_and(|t| {
            !r["stages"]
                .as_array()
                .is_some_and(|a| a.iter().any(|x| x == t))
        }) {
            continue;
        }
        if !q.is_empty()
            && ![&r["title"], &r["agency"], &r["content"]]
                .into_iter()
                .chain(r["capabilityTags"].as_array().into_iter().flatten())
                .filter_map(Value::as_str)
                .any(|s| s.to_lowercase().contains(&q))
        {
            continue;
        }
        let mut c = card(r, state.as_ref(), &default, cx.now);
        let score = fit(
            &c,
            prefs.as_ref(),
            state
                .as_ref()
                .and_then(|s| s["start"]["readiness"].as_str()),
        );
        if let Some(o) = c.as_object_mut() {
            o.insert(
                "views".into(),
                json!(counts
                    .get(r["id"].as_str().unwrap_or(""))
                    .copied()
                    .unwrap_or(0)),
            );
            o.insert("liked".into(), json!(liked.contains(&r["id"])));
            o.insert("fit".into(), json!(score));
        }
        cards.push(c);
    }
    sort_cards(&mut cards, sort, cx.now);
    Resp::ok(json!({"items":cards}))
}
/// GET /api/resources/:id
pub async fn detail(cx: &mut Cx<'_>, req: &Req, id: &str) -> HResult {
    let r = crate::api::explore::state::resources_now(cx)
        .into_iter()
        .find(|r| r["id"] == id)
        .ok_or_else(|| HttpError::not_found("경로를 찾을 수 없어요"))?;
    let who = viewer(cx, req);
    Store::new(cx.kv, cx.now)
        .record_view(id, &who, cx.now)
        .map_err(|_| bad("요청을 처리하지 못했어요"))?;
    let user = actor(cx);
    if let Some(uid) = user.as_deref() {
        Store::new(cx.kv, cx.now).record_recent_view(uid, id).map_err(|_| bad("요청을 처리하지 못했어요"))?;
    }
    let s = user
        .as_deref()
        .and_then(|u| Store::new(cx.kv, cx.now).explore(u));
    let default = defaults(cx, user.as_deref());
    let liked = ids(cx);
    let views = Store::new(cx.kv, cx.now).view_count(id);
    let mut c = card(&r, s.as_ref(), &default, cx.now);
    if let Some(o) = c.as_object_mut() {
        o.insert("views".into(), json!(views));
        o.insert("liked".into(), json!(liked.contains(&r["id"])));
    }
    Resp::ok(c)
}
/// GET /api/likes
pub async fn likes(cx: &mut Cx<'_>, _req: &Req) -> HResult {
    require_user(cx)?;
    Resp::ok(likes_body(&ids(cx), &crate::api::explore::state::resources_now(cx)))
}
/// PUT /api/likes/:id
pub async fn put_like(cx: &mut Cx<'_>, req: &Req, id: &str) -> HResult {
    let user = require_user(cx)?;
    let resources = crate::api::explore::state::resources_now(cx);
    if !resources.iter().any(|r| r["id"] == id) {
        return Err(HttpError::not_found("경로를 찾을 수 없어요"));
    }
    let b = req.json_or_empty();
    let liked = b
        .get("liked")
        .and_then(Value::as_bool)
        .ok_or_else(|| bad("liked 값이 올바르지 않아요"))?;
    let mut chosen = ids(cx);
    chosen.retain(|v| v != id);
    if liked {
        chosen.push(json!(id));
    }
    if chosen.len() > shared_likes::LIKES_MAX {
        chosen.drain(..chosen.len() - shared_likes::LIKES_MAX);
    }
    let uid = user["id"].as_str().unwrap_or("");
    Store::new(cx.kv, cx.now)
        .set_likes(uid, json!(chosen))
        .map_err(|_| bad("요청을 처리하지 못했어요"))?;
    Resp::ok(likes_body(&chosen, &resources))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{api::kstartup::store, app::Cx, testkit::{block_on, TestApp}};

    #[test]
    fn collected_resource_detail_and_like() {
        let mut app = TestApp::new();
        let mut resource = data_for_test();
        resource["id"] = json!("ks-owned-test");
        store::save(&mut app.kv, &[resource]);
        let mut cx = Cx { env: &app.env, kv: &mut app.kv, ports: &app.ports, opts: &app.opts, now: app.now, user: Some(json!({"id":"u-test"})) };
        let req = Req::default();
        let detail = block_on(super::detail(&mut cx, &req, "ks-owned-test"));
        assert_eq!(detail.ok().map(|r| r.status), Some(200));
        let req = Req { body: Some(json!({"liked":true}).to_string()), ..Req::default() };
        let liked = block_on(super::put_like(&mut cx, &req, "ks-owned-test"));
        assert_eq!(liked.ok().map(|r| r.status), Some(200));
    }
    fn data_for_test() -> Value {
        crate::shared::data::resources().into_iter().next().unwrap_or(Value::Null)
    }
}

