//! TS 원본: apps/api/src/store.ts
use crate::{
    api::{password::hash_legacy_password, schema},
    app::AppOpts,
    jsstr,
    kv::MemKv,
    ports::Ports,
    shared::seed,
};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

/// TS: `export const VIEW_WINDOW_MS = 6 * 60 * 60 * 1000`.
pub const VIEW_WINDOW_MS: i64 = 6 * 60 * 60 * 1000;
/// TS: `export const SCHEMA_VERSION = 2`.
pub const SCHEMA_VERSION: i64 = 2;
/// 세션 수명(초). 쿠키 Max-Age 와 서버 만료가 같은 값을 쓴다.
pub const SESSION_MAX_AGE_SECONDS: i64 = 14 * 24 * 60 * 60;

/// TS: `export function urlHash(url: string): string`.
pub fn url_hash(url: &str) -> String {
    let (mut a, mut b) = (0x811c9dc5_u32, 0xcbf29ce4_u32);
    for c in url.encode_utf16() {
        a = (a ^ u32::from(c)).wrapping_mul(0x01000193);
        b = (b ^ u32::from(c)).wrapping_mul(0x01000197);
    }
    format!("{a:08x}{b:08x}")
}

/// TS: `export const emptyMentor = (profile: ConsultProfile = {}): MentorState`.
pub fn empty_mentor(profile: Value) -> Value {
    json!({"step":"form", "profile":profile, "messages":[], "questionIndex":0, "summary":null, "plan":null, "feedback":{}, "survey":null, "updatedAt":null})
}

fn checked(kind: &str, v: &Value, key: &str) -> Result<Value, String> {
    schema::check(kind, v).map_err(|e| format!("invalid record {key}: {e}"))
}
fn text<'a>(v: &'a Value, name: &str) -> Option<&'a str> {
    v.get(name)?.as_str()
}
fn field(v: &Value, name: &str) -> Result<String, String> {
    text(v, name)
        .map(str::to_owned)
        .ok_or_else(|| format!("invalid record: missing {name}"))
}

/// TS: `export interface Store`.
pub struct Store<'a> {
    pub kv: &'a mut MemKv,
    pub now: i64,
}
impl<'a> Store<'a> {
    /// TS: `createStore(now: Date, kv: KvLike, opts?: StoreOptions): Promise<Store>`.
    pub fn new(kv: &'a mut MemKv, now: i64) -> Self {
        Self { kv, now }
    }
    fn read(&self, kind: &str, key: &str) -> Option<Value> {
        schema::check(kind, self.kv.get(key)?).ok()
    }
    fn write(&mut self, kind: &str, key: &str, v: &Value) -> Result<(), String> {
        let parsed = checked(kind, v, key)?;
        self.kv.put(key, parsed);
        Ok(())
    }
    fn list(&self, kind: &str, prefix: &str) -> Vec<Value> {
        self.kv
            .list(prefix)
            .into_iter()
            .filter_map(|(_, v)| schema::check(kind, &v).ok())
            .collect()
    }
    fn delete_user_sessions(&mut self, id: &str, keep: Option<&str>) {
        for (k, v) in self.kv.list("session:") {
            if text(&v, "userId") == Some(id) && keep != Some(k.as_str()) {
                self.kv.delete(&k);
            }
        }
    }
    /// TS: `programs: Program[]`.
    pub fn programs(&self) -> Vec<Value> {
        seed::seed_programs(self.now)
    }
    /// TS: `agencies: Agency[]`.
    pub fn agencies(&self) -> Vec<Value> {
        seed::seed_agencies()
    }
    /// TS: `findUser(id: string): UserRecord | undefined`.
    pub fn find_user(&self, id: &str) -> Option<Value> {
        self.read("User", &format!("user:{id}"))
    }
    /// TS: `findUserByEmail(email: string): UserRecord | undefined`.
    pub fn find_user_by_email(&self, email: &str) -> Option<Value> {
        let id = self
            .kv
            .get(&format!("email:{}", email.to_lowercase()))?
            .as_str()?;
        self.find_user(id)
    }
    /// TS: `allUsers(): UserRecord[]`.
    pub fn all_users(&self) -> Vec<Value> {
        self.list("User", "user:")
    }
    /// TS: `addUser(u: UserRecord): void`.
    pub fn add_user(&mut self, u: Value) -> Result<(), String> {
        let id = field(&u, "id")?;
        let email = field(&u, "email")?;
        self.write("User", &format!("user:{id}"), &u)?;
        self.kv
            .put(&format!("email:{}", email.to_lowercase()), json!(id));
        Ok(())
    }
    /// TS: `deleteUser(id: string): void`.
    pub fn delete_user(&mut self, id: &str) {
        if let Some(u) = self.find_user(id) {
            if let Some(e) = text(&u, "email") {
                self.kv.delete(&format!("email:{}", e.to_lowercase()));
            }
        }
        self.delete_verification(id);
        for prefix in [
            "user:",
            "mentor:",
            "explore:",
            "explore_hist:",
            "recovery:",
            "profile:",
            "likes:",
            "recent_views:",
        ] {
            self.kv.delete(&format!("{prefix}{id}"));
        }
        self.kv.delete(&format!("quota:u:{id}"));
        self.delete_user_sessions(id, None);
        for (key, v) in self.kv.list("app:") {
            if let Ok(a) = schema::check("Application", &v) {
                if text(&a, "userId") == Some(id) {
                    self.kv.delete(&key);
                }
            }
        }
    }
    /// TS: `createSession(token: string, userId: string, mustChangePassword?: boolean): void`.
    pub fn create_session(
        &mut self,
        token: &str,
        user_id: &str,
        must_change_password: bool,
    ) -> Result<(), String> {
        self.write("Session", &format!("session:{token}"), &json!({"userId":user_id,"createdAt":jsstr::iso(self.now),"mustChangePassword":must_change_password}))
    }
    /// TS: `userIdOfSession(token: string): string | undefined`.
    pub fn user_id_of_session(&self, token: &str) -> Option<String> {
        self.read("Session", &format!("session:{token}"))
            .filter(|v| {
                text(v, "createdAt")
                    .and_then(jsstr::parse_ms)
                    .is_some_and(|t| self.now - t < SESSION_MAX_AGE_SECONDS * 1000)
            })
            .and_then(|v| text(&v, "userId").map(str::to_owned))
    }
    /// TS: `sessionMustChange(token: string): boolean`.
    pub fn session_must_change(&self, token: &str) -> bool {
        self.read("Session", &format!("session:{token}"))
            .and_then(|v| v.get("mustChangePassword").and_then(Value::as_bool))
            .unwrap_or(false)
    }
    /// TS: `clearSessionMustChange(token: string): void`.
    pub fn clear_session_must_change(&mut self, token: &str) -> Result<(), String> {
        let key = format!("session:{token}");
        if let Some(mut s) = self.read("Session", &key) {
            s["mustChangePassword"] = json!(false);
            self.write("Session", &key, &s)?;
        }
        Ok(())
    }
    /// TS: `deleteSession(token: string): void`.
    pub fn delete_session(&mut self, token: &str) {
        self.kv.delete(&format!("session:{token}"));
    }
    /// TS: `deleteOtherSessions(userId: string, keepToken: string): void`.
    /// 사용자의 모든 세션을 지운다.
    pub fn delete_all_sessions(&mut self, user_id: &str) {
        self.delete_user_sessions(user_id, None);
    }
    pub fn delete_other_sessions(&mut self, user_id: &str, keep: &str) {
        self.delete_user_sessions(user_id, Some(&format!("session:{keep}")));
    }
    /// TS: `verification(userId: string): VerifyRecord | undefined`.
    pub fn verification(&self, id: &str) -> Option<Value> {
        self.read("Verify", &format!("verify:{id}"))
    }
    /// TS: `userIdOfVerifyToken(tokenHash: string): string | undefined`.
    pub fn user_id_of_verify_token(&self, hash: &str) -> Option<String> {
        self.kv
            .get(&format!("vtoken:{hash}"))?
            .as_str()
            .map(str::to_owned)
    }
    /// TS: `setVerification(userId: string, v: VerifyRecord): void`.
    pub fn set_verification(&mut self, id: &str, v: Value) -> Result<(), String> {
        if let Some(old) = self.verification(id) {
            if let Some(h) = text(&old, "tokenHash") {
                self.kv.delete(&format!("vtoken:{h}"));
            }
        }
        let hash = field(&v, "tokenHash")?;
        self.write("Verify", &format!("verify:{id}"), &v)?;
        self.kv.put(&format!("vtoken:{hash}"), json!(id));
        Ok(())
    }
    /// TS: `deleteVerification(userId: string): void`.
    pub fn delete_verification(&mut self, id: &str) {
        if let Some(v) = self.verification(id) {
            if let Some(h) = text(&v, "tokenHash") {
                self.kv.delete(&format!("vtoken:{h}"));
            }
        }
        self.kv.delete(&format!("verify:{id}"));
    }
    /// TS: `recovery(userId: string): RecoveryRecord | undefined`.
    pub fn recovery(&self, id: &str) -> Option<Value> {
        self.read("Recovery", &format!("recovery:{id}"))
    }
    /// TS: `setRecovery(userId: string, r: RecoveryRecord): void`.
    pub fn set_recovery(&mut self, id: &str, r: Value) -> Result<(), String> {
        self.write("Recovery", &format!("recovery:{id}"), &r)
    }
    /// TS: `deleteRecovery(userId: string): void`.
    pub fn delete_recovery(&mut self, id: &str) {
        self.kv.delete(&format!("recovery:{id}"));
    }
    /// TS: `lastRequest(kind: 'verify' | 'forgot', emailHash: string): string | undefined`.
    pub fn last_request(&self, kind: &str, hash: &str) -> Option<String> {
        self.kv
            .get(&format!("rate:{kind}:{hash}"))?
            .as_str()
            .map(str::to_owned)
    }
    /// TS: `setLastRequest(kind: 'verify' | 'forgot', emailHash: string, at: string): void`.
    pub fn set_last_request(&mut self, kind: &str, hash: &str, at: &str) {
        self.kv.put(&format!("rate:{kind}:{hash}"), json!(at));
    }
    /// TS: `mentor(userId: string): MentorState`.
    pub fn mentor(&self, id: &str) -> Value {
        self.read("MentorState", &format!("mentor:{id}"))
            .unwrap_or_else(|| empty_mentor(json!({})))
    }
    /// TS: `allMentors(): MentorState[]`.
    pub fn all_mentors(&self) -> Vec<Value> {
        self.list("MentorState", "mentor:")
    }
    /// TS: `setMentor(userId: string, m: MentorState): void`.
    pub fn set_mentor(&mut self, id: &str, m: Value) -> Result<(), String> {
        self.write("MentorState", &format!("mentor:{id}"), &m)
    }
    /// TS: `applicationsOf(userId: string): Application[]`.
    pub fn applications_of(&self, id: &str) -> Vec<Value> {
        let mut out: Vec<_> = self
            .all_applications()
            .into_iter()
            .filter(|a| text(a, "userId") == Some(id))
            .collect();
        out.sort_by(|a, b| text(b, "createdAt").cmp(&text(a, "createdAt")));
        out
    }
    /// TS: `allApplications(): Application[]`.
    pub fn all_applications(&self) -> Vec<Value> {
        self.list("Application", "app:")
    }
    /// TS: `explore(actorId: string): ExploreState | undefined`.
    pub fn explore(&self, id: &str) -> Option<Value> {
        self.read("ExploreState", &format!("explore:{id}"))
    }
    /// TS: `allExplores(): [string, ExploreState][]`.
    pub fn all_explores(&self) -> Vec<(String, Value)> {
        self.kv
            .list("explore:")
            .into_iter()
            .filter_map(|(k, v)| {
                schema::check("ExploreState", &v)
                    .ok()
                    .map(|v| (k[8..].to_string(), v))
            })
            .collect()
    }
    /// TS: `setExplore(actorId: string, s: ExploreState): void`.
    pub fn set_explore(&mut self, id: &str, s: Value) -> Result<(), String> {
        self.write("ExploreState", &format!("explore:{id}"), &s)
    }
    /// TS: `deleteExplore(actorId: string): void`.
    pub fn delete_explore(&mut self, id: &str) {
        self.kv.delete(&format!("explore:{id}"));
    }
    /// TS: `quota(key: string): string[]`.
    pub fn quota(&self, key: &str) -> Value {
        self.read("Quota", &format!("quota:{key}"))
            .unwrap_or_else(|| json!([]))
    }
    /// TS: `setQuota(key: string, times: string[]): void`.
    pub fn set_quota(&mut self, key: &str, times: Value) -> Result<(), String> {
        self.write("Quota", &format!("quota:{key}"), &times)
    }
    /// TS: `limitHits(): number`.
    pub fn limit_hits(&self) -> i64 {
        self.kv
            .get("meta:limitHits")
            .and_then(Value::as_i64)
            .unwrap_or(0)
    }
    /// TS: `addLimitHit(): void`.
    pub fn add_limit_hit(&mut self) {
        self.kv.put("meta:limitHits", json!(self.limit_hits() + 1));
    }
    /// TS: `basicProfile(userId: string): BasicProfile`.
    pub fn basic_profile(&self, id: &str) -> Value {
        self.read("BasicProfile", &format!("profile:{id}")).unwrap_or_else(|| json!({"age":null,"residence":null,"hasBusiness":null,"occupation":null,"updatedAt":null}))
    }
    /// TS: `setBasicProfile(userId: string, p: BasicProfile): void`.
    pub fn set_basic_profile(&mut self, id: &str, p: Value) -> Result<(), String> {
        self.write("BasicProfile", &format!("profile:{id}"), &p)
    }
    /// TS: `addFeedback(r: FeedbackRecord): void`.
    pub fn add_feedback(&mut self, r: Value) -> Result<(), String> {
        let id = field(&r, "id")?;
        self.write("FeedbackRecord", &format!("feedback:{id}"), &r)
    }
    /// TS: `allFeedback(): FeedbackRecord[]`.
    pub fn all_feedback(&self) -> Vec<Value> {
        self.list("FeedbackRecord", "feedback:")
    }
    /// TS: `bufsLock(ipHash: string): { fails: number; lockedUntil: string | null }`.
    pub fn bufs_lock(&self, hash: &str) -> Value {
        self.read("BufsLock", &format!("bufslock:{hash}"))
            .unwrap_or_else(|| json!({"fails":0,"lockedUntil":null}))
    }
    /// TS: `setBufsLock(ipHash: string, v: { fails: number; lockedUntil: string | null }): void`.
    pub fn set_bufs_lock(&mut self, hash: &str, v: Value) -> Result<(), String> {
        self.write("BufsLock", &format!("bufslock:{hash}"), &v)
    }
    /// TS: `clearBufsLock(ipHash: string): void`.
    pub fn clear_bufs_lock(&mut self, hash: &str) {
        self.kv.delete(&format!("bufslock:{hash}"));
    }
    /// TS: `createBufsSession(token: string, expiresAt: string): void`.
    pub fn create_bufs_session(&mut self, token: &str, expires: &str) -> Result<(), String> {
        self.write(
            "BufsSession",
            &format!("bufs:{token}"),
            &json!({"expiresAt":expires}),
        )
    }
    /// TS: `bufsSessionValid(token: string, now: Date): boolean`.
    pub fn bufs_session_valid(&self, token: &str, now: i64) -> bool {
        self.read("BufsSession", &format!("bufs:{token}"))
            .and_then(|v| text(&v, "expiresAt").and_then(jsstr::parse_ms))
            .is_some_and(|t| t > now)
    }
    /// TS: `deleteBufsSession(token: string): void`.
    pub fn delete_bufs_session(&mut self, token: &str) {
        self.kv.delete(&format!("bufs:{token}"));
    }
    /// TS: `getApplication(id: string): Application | undefined`.
    pub fn get_application(&self, id: &str) -> Option<Value> {
        self.read("Application", &format!("app:{id}"))
    }
    /// TS: `saveApplication(a: Application): void`.
    pub fn save_application(&mut self, a: Value) -> Result<(), String> {
        let id = field(&a, "id")?;
        self.write("Application", &format!("app:{id}"), &a)
    }
    /// TS: `viewCount(resourceId: string): number`.
    pub fn view_count(&self, id: &str) -> u64 {
        self.read("Views", &format!("views:{id}"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0)
    }
    pub fn recent_views(&self, id: &str) -> Value {
        self.read("Likes", &format!("recent_views:{id}")).unwrap_or_else(|| json!([]))
    }
    pub fn record_recent_view(&mut self, user: &str, resource: &str) -> Result<(), String> {
        let mut ids = self.recent_views(user).as_array().cloned().unwrap_or_default();
        ids.retain(|v| v != resource);
        ids.insert(0, json!(resource));
        ids.truncate(10);
        self.write("Likes", &format!("recent_views:{user}"), &json!(ids))
    }
    /// TS: `likes(userId: string): string[]`.
    pub fn likes(&self, id: &str) -> Value {
        self.read("Likes", &format!("likes:{id}"))
            .unwrap_or_else(|| json!([]))
    }
    /// TS: `setLikes(userId: string, ids: string[]): void`.
    pub fn set_likes(&mut self, id: &str, ids: Value) -> Result<(), String> {
        let key = format!("likes:{id}");
        if ids.as_array().is_some_and(Vec::is_empty) {
            self.kv.delete(&key);
            Ok(())
        } else {
            self.write("Likes", &key, &ids)
        }
    }
    /// TS: `viewCounts(): Map<string, number>`.
    pub fn view_counts(&self) -> BTreeMap<String, u64> {
        self.kv
            .list("views:")
            .into_iter()
            .filter_map(|(k, v)| {
                schema::check("Views", &v)
                    .ok()?
                    .as_u64()
                    .map(|n| (k[6..].to_string(), n))
            })
            .collect()
    }
    /// TS: `parsedDoc(url: string): ParsedDocRecord | undefined`.
    pub fn parsed_doc(&self, url: &str) -> Option<Value> {
        let v = self.read("ParsedDocRecord", &format!("doc:{}", url_hash(url)))?;
        (text(&v, "url") == Some(url)).then_some(v)
    }
    /// TS: `saveParsedDoc(r: ParsedDocRecord): void`.
    pub fn save_parsed_doc(&mut self, r: Value) -> Result<(), String> {
        let url = field(&r, "url")?;
        self.write("ParsedDocRecord", &format!("doc:{}", url_hash(&url)), &r)
    }
    /// TS: `recordView(resourceId: string, viewer: string, now: Date): boolean`.
    pub fn record_view(&mut self, id: &str, viewer: &str, now: i64) -> Result<bool, String> {
        let key = format!("seen:{id}|{viewer}");
        if self
            .kv
            .scratch
            .get(&key)
            .and_then(Value::as_i64)
            .unwrap_or(0)
            > now
        {
            return Ok(false);
        }
        if self.kv.scratch.len() > 20_000 {
            self.kv.scratch.retain(|k, v| {
                !k.starts_with("seen:") || v.as_i64().is_none_or(|until| until > now)
            });
        }
        self.kv.scratch.insert(key, json!(now + VIEW_WINDOW_MS));
        self.write(
            "Views",
            &format!("views:{id}"),
            &json!(self.view_count(id) + 1),
        )?;
        Ok(true)
    }
    /// TS: `flush(): void` (모든 변경은 즉시 저장한다).
    pub fn flush(&self) {}
}

/// TS: `createStore(now: Date, kv: KvLike, opts: StoreOptions): Promise<Store>`.
pub fn init(kv: &mut MemKv, now: i64, opts: &AppOpts, ports: &dyn Ports) {
    if opts.seed_users && kv.get("meta:seeded").is_none() {
        for s in seed::seed_users() {
            let key = format!("user:{}", s.id);
            if kv.get(&key).is_some() {
                continue;
            }
            let u = json!({"id":s.id,"email":s.email,"isTeam":s.is_team,"createdAt":jsstr::iso(now),"passwordHash":hash_legacy_password(s.password, ports),"emailVerified":true,"mustChangePassword":false});
            if let Ok(u) = checked("User", &u, &key) {
                kv.put(&key, u);
                kv.put(&format!("email:{}", s.email.to_lowercase()), json!(s.id));
                if let Some(profile) = s.profile {
                    let key = format!("mentor:{}", s.id);
                    if let Ok(m) = checked("MentorState", &empty_mentor(profile), &key) {
                        kv.put(&key, m);
                    }
                }
            }
        }
        kv.put("meta:seeded", json!(jsstr::iso(now)));
    }
    if kv.get("meta:schema") != Some(&json!(SCHEMA_VERSION)) {
        kv.put("meta:schema", json!(SCHEMA_VERSION));
    }
    if opts.seed_users {
        for s in seed::seed_users() {
            let mut store = Store::new(kv, now);
            if let Some(mut u) = store.find_user(s.id) {
                if u.get("emailVerified").and_then(Value::as_bool) != Some(true) {
                    u["emailVerified"] = json!(true);
                    let _ = store.add_user(u);
                }
            }
        }
    }
    if opts.purge_test_data && kv.get("meta:purged-test-v1").is_none() {
        let mut store = Store::new(kv, now);
        for u in store.all_users() {
            if text(&u, "email").is_some_and(|e| e.to_lowercase().ends_with("@test.local")) {
                if let Some(id) = text(&u, "id") {
                    store.delete_user(id);
                }
            }
        }
        let live: BTreeSet<String> = store
            .all_users()
            .iter()
            .filter_map(|u| text(u, "id").map(str::to_owned))
            .collect();
        for prefix in ["explore:g-", "quota:c:", "quota:ip:"] {
            for key in store.kv.keys(prefix) {
                store.kv.delete(&key);
            }
        }
        for prefix in ["mentor:", "explore:", "explore_hist:", "profile:", "likes:", "recent_views:"] {
            for key in store.kv.keys(prefix) {
                if !live.contains(&key[prefix.len()..]) {
                    store.kv.delete(&key);
                }
            }
        }
        store.kv.delete("meta:seeded");
        store.kv.put("meta:purged-test-v1", json!(jsstr::iso(now)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testkit::{FakePorts, NOW};
    #[test]
    fn views_are_deduplicated_in_scratch() {
        let mut kv = MemKv::default();
        let mut s = Store::new(&mut kv, 1);
        assert_eq!(s.record_view("a", "viewer", 1), Ok(true));
        assert_eq!(s.record_view("a", "viewer", 2), Ok(false));
        assert_eq!(s.record_view("a", "viewer", VIEW_WINDOW_MS + 1), Ok(true));
        assert_eq!(s.view_count("a"), 2);
        assert!(s.kv.keys("seen:").is_empty());
    }
    #[test]
    fn records_survive_reopening_and_delete_cascades() {
        let mut kv = MemKv::default();
        let user = json!({"id":"u1","email":"person@example.com","isTeam":false,"createdAt":jsstr::iso(NOW),"passwordHash":"0123456789"});
        {
            let mut store = Store::new(&mut kv, NOW);
            assert!(store.add_user(user).is_ok());
            assert!(store.create_session("token", "u1", false).is_ok());
            assert!(store
                .set_mentor("u1", empty_mentor(json!({"age":22})))
                .is_ok());
            let app = json!({"id":"a1","userId":"u1","programId":"p1","status":"preparing","channel":"web","formFileName":"","fields":[],"approval":null,"receiptNo":null,"receiptImageUrl":null,"failReason":null,"retries":0,"history":[],"createdAt":jsstr::iso(NOW),"updatedAt":jsstr::iso(NOW)});
            assert!(store.save_application(app).is_ok());
        }
        let mut store = Store::new(&mut kv, NOW);
        assert_eq!(store.user_id_of_session("token").as_deref(), Some("u1"));
        assert_eq!(store.mentor("u1")["profile"]["age"], 22);
        assert_eq!(store.applications_of("u1").len(), 1);
        store.delete_user("u1");
        assert!(store.find_user_by_email("person@example.com").is_none());
        assert!(store.get_application("a1").is_none());
        assert!(store.user_id_of_session("token").is_none());
        assert!(store.kv.get("mentor:u1").is_none());
    }
    #[test]
    fn invalid_records_are_rejected_and_broken_records_skipped() {
        let mut kv = MemKv::default();
        let mut store = Store::new(&mut kv, NOW);
        let bad = json!({"id":"x","email":"not-an-email","isTeam":false,"createdAt":jsstr::iso(NOW),"passwordHash":"0123456789"});
        assert!(store.add_user(bad).is_err());
        assert!(store.set_mentor("x", json!({"step":"nope"})).is_err());
        store.kv.put("user:broken", json!({"id":"broken"}));
        assert!(store.all_users().is_empty());
    }
    #[test]
    fn seed_once_and_purge() {
        let mut kv = MemKv::default();
        let ports = FakePorts::default();
        let seeded = AppOpts {
            seed_users: true,
            ..Default::default()
        };
        init(&mut kv, NOW, &seeded, &ports);
        let n = kv.len();
        init(&mut kv, NOW, &seeded, &ports);
        assert_eq!(kv.len(), n);
        kv.put("quota:ip:old", json!([]));
        kv.put("explore:g-old", json!({"bad":true}));
        let purge = AppOpts {
            purge_test_data: true,
            ..Default::default()
        };
        init(&mut kv, NOW, &purge, &ports);
        assert!(kv.keys("quota:ip:").is_empty());
        assert!(kv.keys("explore:g-").is_empty());
        assert!(kv.get("meta:purged-test-v1").is_some());
        assert!(Store::new(&mut kv, NOW)
            .all_users()
            .iter()
            .all(|u| !text(u, "email").is_some_and(|e| e.ends_with("@test.local"))));
    }
}
