use crate::api::explore::{result, state};
use crate::api::store::Store;
use crate::app::Cx;
use crate::http::{HResult, HttpError, Req, Resp};
use crate::jsstr::{iso, js_trim, len16, take16};
use serde_json::{json, Value};

fn load(cx: &Cx<'_>, id: &str) -> Vec<Value> {
    cx.kv.get(&format!("explore_hist:{id}"))
        .and_then(Value::as_array).cloned().unwrap_or_default()
}

fn items(entries: &[Value]) -> Vec<Value> {
    entries.iter().map(|e| json!({"id":e["id"],"archivedAt":e["archivedAt"],"title":e["title"],"problemTitle":e["problemTitle"]})).collect()
}

fn missing() -> HttpError {
    HttpError::not_found("지난 상담을 찾지 못했어요")
}

pub async fn new_session(cx: &mut Cx<'_>, _req: &Req) -> HResult {
    let id = state::actor_id(cx)?;
    let old = Store::new(cx.kv, cx.now).explore(&id);
    let mut entries = load(cx, &id);
    if let Some(s) = old.as_ref().filter(|s| !s["summary"].is_null()) {
        let raw = js_trim(s["summary"]["interest"]["text"].as_str().unwrap_or(""));
        let title = if raw.is_empty() { "제목 없는 상담".to_owned() } else if len16(raw) > 40 { format!("{}…", take16(raw, 40)) } else { raw.to_owned() };
        let mut snapshot = result::result(cx, &id, s);
        if s["fieldQ"]["items"].is_array() { snapshot["fieldQuestions"] = s["fieldQ"]["items"].clone(); }
        entries.insert(0, json!({"id":format!("h-{}", cx.now),"archivedAt":iso(cx.now),"title":title,"problemTitle":s["summary"]["exploration"]["problem"]["title"],"result":snapshot}));
        entries.truncate(5);
        cx.kv.put(&format!("explore_hist:{id}"), json!(entries));
    }
    let mut fresh = state::empty_state(cx.now, "user");
    if let Some(s) = old {
        for key in ["conditions", "reviewRegion", "district"] {
            if let Some(value) = s["start"].get(key) { fresh["start"][key] = value.clone(); }
        }
    }
    state::save(cx, &id, &fresh)?;
    Resp::ok(json!({"ok":true,"session":state::view(cx, &fresh),"history":items(&entries)}))
}

pub async fn list(cx: &mut Cx<'_>, _req: &Req) -> HResult {
    let id = state::actor_id(cx)?;
    Resp::ok(json!({"items":items(&load(cx, &id))}))
}

pub async fn get(cx: &mut Cx<'_>, _req: &Req, entry_id: &str) -> HResult {
    let id = state::actor_id(cx)?;
    let entry = load(cx, &id).into_iter().find(|e| e["id"] == entry_id).ok_or_else(missing)?;
    Resp::ok(entry)
}

pub async fn delete(cx: &mut Cx<'_>, _req: &Req, entry_id: &str) -> HResult {
    let id = state::actor_id(cx)?;
    let mut entries = load(cx, &id);
    let index = entries.iter().position(|e| e["id"] == entry_id).ok_or_else(missing)?;
    entries.remove(index);
    cx.kv.put(&format!("explore_hist:{id}"), json!(entries));
    Resp::ok(json!({"items":items(&entries)}))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testkit::{Client, TestApp};

    fn setup() -> (TestApp, Client, String) {
        let mut app = TestApp::new();
        let mut client = app.client();
        let email = "history@example.com";
        let (status, body, _) = app.call(&mut client, "POST", "/api/auth/signup", Some(json!({"email":email,"password":"Password123!","passwordConfirm":"Password123!","consent":true})));
        assert_eq!(status, 201, "{body}");
        let mut store = Store::new(&mut app.kv, app.now);
        let mut user = store.find_user_by_email(email).unwrap();
        let id = user["id"].as_str().unwrap().to_owned();
        user["emailVerified"] = json!(true);
        store.add_user(user).unwrap();
        store.create_session("history-test", &id, false).unwrap();
        client.cookie = "sid=history-test".into();
        (app, client, id)
    }

    fn call(app: &mut TestApp, client: &mut Client, method: &str, path: &str, body: Option<Value>) -> Value {
        let (status, value, _) = app.call(client, method, path, body);
        assert_eq!(status, 200, "{method} {path}: {value}");
        value
    }

    fn summarize(app: &mut TestApp, client: &mut Client) -> Value {
        call(app, client, "PUT", "/api/explore/start", Some(json!({"start":{"readiness":"has_idea","idea":"바다 서비스","reviewRegion":"부산","district":"해운대구","conditions":{"age":30}}})));
        call(app, client, "POST", "/api/explore/chat", Some(json!({})));
        call(app, client, "POST", "/api/explore/chat", Some(json!({"message":"고객을 돕고 싶어요"})));
        call(app, client, "POST", "/api/explore/summary", None)["summary"].clone()
    }

    #[test]
    fn new_archives_and_resets_preserving_conditions() {
        let (mut app, mut client, id) = setup();
        let summary = summarize(&mut app, &mut client);
        let response = call(&mut app, &mut client, "POST", "/api/explore/new", None);
        assert_eq!(response["session"]["step"], "start");
        assert!(response["session"]["summary"].is_null());
        assert_eq!(response["session"]["start"]["conditions"]["age"], 30);
        assert_eq!(response["session"]["start"]["reviewRegion"], "부산");
        assert_eq!(response["session"]["start"]["district"], "해운대구");
        assert_eq!(response["history"].as_array().unwrap().len(), 1);
        assert_eq!(response["history"][0]["title"], summary["interest"]["text"]);
        assert_eq!(Store::new(&mut app.kv, app.now).explore(&id).unwrap()["answers"], json!([]));
    }

    #[test]
    fn archived_result_contains_summary() {
        let (mut app, mut client, _) = setup();
        let summary = summarize(&mut app, &mut client);
        let new = call(&mut app, &mut client, "POST", "/api/explore/new", None);
        let path = format!("/api/explore/history/{}", new["history"][0]["id"].as_str().unwrap());
        let entry = call(&mut app, &mut client, "GET", &path, None);
        assert_eq!(entry["result"]["summary"], summary);
        let list = call(&mut app, &mut client, "GET", "/api/explore/history", None);
        assert!(list["items"][0].get("result").is_none());
    }

    #[test]
    fn new_keeps_chat_quota() {
        let (mut app, mut client, _) = setup();
        summarize(&mut app, &mut client);
        let before = call(&mut app, &mut client, "GET", "/api/explore/session", None);
        call(&mut app, &mut client, "POST", "/api/explore/new", None);
        let after = call(&mut app, &mut client, "GET", "/api/explore/session", None);
        assert_eq!(before["quota"]["used"], after["quota"]["used"]);
        assert!(before["quota"]["used"].as_u64().unwrap() > 0);
    }

    #[test]
    fn sixth_archive_drops_oldest() {
        let (mut app, mut client, _) = setup();
        let mut ids = Vec::new();
        for _ in 0..6 {
            summarize(&mut app, &mut client);
            app.now += 1;
            let new = call(&mut app, &mut client, "POST", "/api/explore/new", None);
            ids.push(new["history"][0]["id"].clone());
        }
        let list = call(&mut app, &mut client, "GET", "/api/explore/history", None);
        let found: Vec<_> = list["items"].as_array().unwrap().iter().map(|v| v["id"].clone()).collect();
        assert_eq!(found, ids[1..].iter().rev().cloned().collect::<Vec<_>>());
    }

    #[test]
    fn delete_removes_entry_and_unknown_returns_not_found() {
        let (mut app, mut client, _) = setup();
        summarize(&mut app, &mut client);
        let new = call(&mut app, &mut client, "POST", "/api/explore/new", None);
        let path = format!("/api/explore/history/{}", new["history"][0]["id"].as_str().unwrap());
        let deleted = call(&mut app, &mut client, "DELETE", &path, None);
        assert_eq!(deleted["items"], json!([]));
        for method in ["GET", "DELETE"] {
            let (status, body, _) = app.call(&mut client, method, &path, None);
            assert_eq!(status, 404);
            assert_eq!(body["error"]["code"], "not_found");
            assert_eq!(body["error"]["message"], "지난 상담을 찾지 못했어요");
        }
    }

    #[test]
    fn new_without_summary_does_not_archive() {
        let (mut app, mut client, _) = setup();
        call(&mut app, &mut client, "PUT", "/api/explore/start", Some(json!({"start":{"reviewRegion":"부산"}})));
        let new = call(&mut app, &mut client, "POST", "/api/explore/new", None);
        assert_eq!(new["history"], json!([]));
        assert_eq!(new["session"]["step"], "start");
        assert_eq!(new["session"]["start"]["reviewRegion"], "부산");
    }

    #[test]
    fn account_deletion_removes_history_key() {
        let (mut app, mut client, id) = setup();
        summarize(&mut app, &mut client);
        call(&mut app, &mut client, "POST", "/api/explore/new", None);
        let key = format!("explore_hist:{id}");
        assert!(app.kv.get(&key).is_some());
        call(&mut app, &mut client, "DELETE", "/api/me", None);
        assert!(app.kv.get(&key).is_none());
    }
}
