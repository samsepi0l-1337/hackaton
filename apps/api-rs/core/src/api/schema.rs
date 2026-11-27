//! Validation of persisted API records, matching the Zod schemas.
use crate::shared::{account, constants as c, explore as e};
use serde_json::{json, Map, Value};

#[derive(Clone)]
enum Spec {
    Str(usize, usize),
    Email,
    Date,
    TypeCode,
    Bool,
    Num(bool, f64, f64),
    Enum(Vec<&'static str>),
    Array(Box<Spec>, usize),
    Record(Box<Spec>),
    Object(Vec<Field>),
    Nullable(Box<Spec>),
    Union(Box<Spec>, Box<Spec>),
}
#[derive(Clone)]
struct Field(&'static str, Spec, Option<Option<Value>>);
fn req(k: &'static str, s: Spec) -> Field {
    Field(k, s, None)
}
fn opt(k: &'static str, s: Spec) -> Field {
    Field(k, s, Some(None))
}
fn def(k: &'static str, s: Spec, v: Value) -> Field {
    Field(k, s, Some(Some(v)))
}
fn obj(v: Vec<Field>) -> Spec {
    Spec::Object(v)
}
fn s() -> Spec {
    st(0, usize::MAX)
}
fn st(min: usize, max: usize) -> Spec {
    Spec::Str(min, max)
}
fn num(int: bool, min: f64, max: f64) -> Spec {
    Spec::Num(int, min, max)
}
fn int() -> Spec {
    num(true, -9007199254740991.0, 9007199254740991.0)
}
fn nonneg() -> Spec {
    num(true, 0.0, 9007199254740991.0)
}
fn en(v: &[&'static str]) -> Spec {
    Spec::Enum(v.to_vec())
}
fn arr(v: Spec, max: usize) -> Spec {
    Spec::Array(Box::new(v), max)
}
fn rec(v: Spec) -> Spec {
    Spec::Record(Box::new(v))
}
fn nullable(v: Spec) -> Spec {
    Spec::Nullable(Box::new(v))
}
fn union(a: Spec, b: Spec) -> Spec {
    Spec::Union(Box::new(a), Box::new(b))
}
fn time() -> Spec {
    st(10, usize::MAX)
}
fn score() -> Spec {
    obj(vec![
        opt("before", num(false, 1.0, 5.0)),
        opt("after", num(false, 1.0, 5.0)),
    ])
}
fn chat() -> Spec {
    obj(vec![
        req("role", en(&["mentor", "user"])),
        req("text", st(0, 5000)),
        req("at", time()),
        opt("questionIndex", nonneg()),
        opt("skipped", Spec::Bool),
    ])
}
fn summary_item() -> Spec {
    obj(vec![
        req("text", st(0, 2000)),
        req("provenance", en(&e::PROVENANCES)),
    ])
}
fn status() -> Spec {
    en(&c::APPLICATION_STATUS_LABEL
        .iter()
        .map(|x| x.0)
        .collect::<Vec<_>>())
}
fn consult() -> Spec {
    obj(vec![
        opt("age", int()),
        opt(
            "stage",
            en(&c::STAGES.iter().map(|x| x.0).collect::<Vec<_>>()),
        ),
        opt("openedAt", Spec::Date),
        opt("district", st(0, 20)),
        opt("affiliation", en(c::AFFILIATIONS)),
        opt("teamSize", en(c::TEAM_SIZES)),
        opt("typeCode", Spec::TypeCode),
        opt("idea", st(0, 1000)),
        opt("industry", en(c::INDUSTRIES)),
        opt("bizForm", en(c::BIZ_FORMS)),
        opt("problem", st(0, 1000)),
        opt("readiness", en(c::READINESS)),
        opt("revenue", arr(en(c::REVENUE_MODELS), usize::MAX)),
        opt("customerType", en(c::CUSTOMER_TYPES)),
        opt("customerAges", arr(en(c::CUSTOMER_AGES), usize::MAX)),
        opt("customerRegion", en(c::CUSTOMER_REGIONS)),
        opt("customerDesc", st(0, 1000)),
        opt("alternative", st(0, 1000)),
        opt("needs", arr(en(c::SUPPORT_NEEDS), usize::MAX)),
    ])
}
fn mentor() -> Spec {
    obj(vec![
        req("step", en(&["form", "chat", "summary", "result"])),
        req("profile", consult()),
        req("messages", arr(chat(), 200)),
        req("questionIndex", nonneg()),
        req(
            "summary",
            nullable(obj(vec![
                req("problem", s()),
                req("customer", s()),
                req("solution", s()),
                req("revenue", s()),
                req("busan", s()),
            ])),
        ),
        req(
            "plan",
            nullable(arr(
                obj(vec![
                    req("day", num(true, 1.0, 7.0)),
                    req("task", s()),
                    opt("programId", s()),
                    req("done", Spec::Bool),
                ]),
                usize::MAX,
            )),
        ),
        req("feedback", rec(Spec::Bool)),
        req("survey", nullable(Spec::Bool)),
        req("updatedAt", nullable(time())),
    ])
}
fn application() -> Spec {
    obj(vec![
        req("id", st(1, usize::MAX)),
        req("userId", st(1, usize::MAX)),
        req("programId", st(1, usize::MAX)),
        req("status", status()),
        req("channel", en(&["web", "email", "mock"])),
        req("formFileName", s()),
        req(
            "fields",
            arr(
                obj(vec![
                    req("key", s()),
                    req("label", s()),
                    req("maxLength", nullable(int())),
                    req("required", Spec::Bool),
                    opt("identity", Spec::Bool),
                    req("value", s()),
                ]),
                60,
            ),
        ),
        req(
            "approval",
            nullable(obj(vec![req("at", time()), req("values", rec(s()))])),
        ),
        req("receiptNo", nullable(s())),
        req("receiptImageUrl", nullable(s())),
        req("failReason", nullable(s())),
        req("retries", nonneg()),
        req(
            "history",
            arr(
                obj(vec![req("status", status()), req("at", time())]),
                usize::MAX,
            ),
        ),
        req("createdAt", time()),
        req("updatedAt", time()),
    ])
}
fn explore() -> Spec {
    let conditions = obj(vec![
        opt("age", union(num(true, 0.0, 120.0), en(&["unknown"]))),
        opt("residence", st(0, 40)),
        opt("affiliation", st(0, 40)),
        opt("hasBusiness", union(Spec::Bool, en(&["unknown"]))),
    ]);
    let start = obj(vec![
        opt("readiness", en(&e::READINESS_STAGES)),
        opt("idea", st(0, 200)),
        opt("interests", arr(st(0, 40), 20)),
        opt("interestNote", st(0, 200)),
        opt("district", st(0, 20)),
        opt("reviewRegion", en(&e::REVIEW_REGIONS)),
        opt("focusResourceId", st(1, 120)),
        opt("conditions", conditions),
    ]);
    let exploration = obj(vec![
        req("problemId", nullable(s())),
        req("origin", en(&e::EXPLORATION_ORIGINS)),
        req("customProblem", nullable(st(0, 300))),
        req("selectionReason", nullable(st(0, 300))),
        req("direction", nullable(st(0, 300))),
        req("directionStatus", en(&e::DIRECTION_STATUSES)),
        req("dataVersion", s()),
        req("suggestions", arr(st(0, 300), 2)),
    ]);
    let summary = obj(vec![
        req("interest", summary_item()),
        req("target", summary_item()),
        req("value", summary_item()),
        req("unknowns", summary_item()),
        req(
            "exploration",
            obj(vec![
                req(
                    "problem",
                    nullable(obj(vec![
                        req("title", s()),
                        req("source", nullable(s())),
                        req("evidenceLevel", nullable(s())),
                    ])),
                ),
                req("reason", summary_item()),
                req(
                    "direction",
                    obj(vec![
                        req("text", s()),
                        req("provenance", en(&e::PROVENANCES)),
                        req("status", en(&e::DIRECTION_STATUSES)),
                    ]),
                ),
                req("hypotheses", summary_item()),
            ]),
        ),
    ]);
    let regional = obj(vec![
        req("region", en(&e::REVIEW_REGIONS)),
        req("basis", s()),
        req("sourceIds", arr(s(), usize::MAX)),
        req("customerHypothesis", summary_item()),
        req("resourceIds", arr(s(), usize::MAX)),
        req("status", en(&e::REGIONAL_STATUSES)),
    ]);
    let feedback = obj(vec![
        opt("helpful", Spec::Bool),
        opt("reason", st(0, 500)),
        opt("directionClear", Spec::Bool),
        opt("wantToExplore", st(0, 500)),
        opt("foundRegionalPath", Spec::Bool),
        opt("pathName", st(0, 200)),
        opt("knowWhatToPrepare", score()),
        opt("regionIntent", score()),
        req("at", time()),
    ]);
    obj(vec![
        req("kind", en(&["guest", "user"])),
        req("createdAt", time()),
        def("updatedAt", nullable(time()), Value::Null),
        def(
            "step",
            en(&["start", "chat", "summary", "result"]),
            json!("start"),
        ),
        def("start", start, json!({})),
        def("exploration", nullable(exploration), Value::Null),
        def("messages", arr(chat(), 200), json!([])),
        def("questionIndex", num(true, 0.0, 3.0), json!(0)),
        def("plan", arr(s(), 3), json!([])),
        def(
            "answers",
            arr(
                obj(vec![
                    req("key", s()),
                    req("text", nullable(st(0, 1000))),
                    req("how", en(&["answered", "unknown", "skipped"])),
                ]),
                10,
            ),
            json!([]),
        ),
        def("finished", Spec::Bool, json!(false)),
        def("summary", nullable(summary), Value::Null),
        def("regional", nullable(regional), Value::Null),
        def("prepDone", rec(Spec::Bool), json!({})),
        def(
            "ai",
            nullable(obj(vec![
                req("sig", s()),
                req("reasons", rec(s())),
                def("rank", nullable(rec(num(false, 0.0, 1.0))), Value::Null),
            ])),
            Value::Null,
        ),
        def("rejected", arr(st(0, 300), 20), json!([])),
        def(
            "lastBody",
            nullable(obj(vec![req("sig", s()), req("at", s())])),
            Value::Null,
        ),
        def("feedback", nullable(feedback), Value::Null),
        def("counted", Spec::Bool, json!(false)),
        def(
            "fieldQ",
            nullable(obj(vec![
                req("sig", s()),
                req(
                    "items",
                    arr(
                        obj(vec![
                            req("id", s()),
                            req("question", st(0, 300)),
                            req("purpose", st(0, 400)),
                            req("source", en(&["rule", "ai"])),
                        ]),
                        3,
                    ),
                ),
            ])),
            Value::Null,
        ),
        def("events", rec(nonneg()), json!({})),
    ])
}
fn schema(kind: &str) -> Option<Spec> {
    Some(match kind {
        "ConsultProfile" => consult(),
        "User" => obj(vec![
            req("id", st(1, usize::MAX)),
            req("email", Spec::Email),
            req("isTeam", Spec::Bool),
            req("createdAt", time()),
            req("passwordHash", st(10, usize::MAX)),
            def("emailVerified", Spec::Bool, json!(false)),
            def("mustChangePassword", Spec::Bool, json!(false)),
        ]),
        "Session" => obj(vec![
            req("userId", st(1, usize::MAX)),
            req("createdAt", time()),
            def("mustChangePassword", Spec::Bool, json!(false)),
        ]),
        "Verify" => obj(vec![
            req("tokenHash", st(64, 64)),
            req("codeHash", st(64, 64)),
            req("expiresAt", time()),
            req("sentAt", time()),
            req("attempts", nonneg()),
            opt("pendingHash", st(10, usize::MAX)),
        ]),
        "Recovery" => obj(vec![
            req("hash", st(10, usize::MAX)),
            req("expiresAt", time()),
            req("createdAt", time()),
            req("used", Spec::Bool),
        ]),
        "MentorState" => mentor(),
        "Application" => application(),
        "ExploreState" => explore(),
        "Views" => nonneg(),
        "Likes" => arr(st(1, 120), 200),
        "Quota" => arr(time(), 100),
        "BasicProfile" => {
            let mut residences = account::RESIDENCE_OPTIONS.to_vec();
            residences.extend_from_slice(c::BUSAN_DISTRICTS);
            obj(vec![
                req("age", nullable(num(true, 0.0, 120.0))),
                req("residence", nullable(en(&residences))),
                req("hasBusiness", nullable(Spec::Bool)),
                req("occupation", nullable(en(&account::OCCUPATIONS))),
                req("updatedAt", nullable(time())),
            ])
        }
        "FeedbackRecord" => obj(vec![
            req("id", st(1, usize::MAX)),
            req("createdAt", time()),
            req("user", s()),
            req("readiness", nullable(s())),
            req("problemId", nullable(s())),
            req("reviewRegion", nullable(s())),
            req("helpful", nullable(Spec::Bool)),
            req("reason", nullable(st(0, 500))),
            req("directionClear", nullable(Spec::Bool)),
            req("wantToExplore", nullable(st(0, 500))),
            req("knowWhatToPrepare", nullable(score())),
            req("regionIntent", nullable(score())),
            req("foundRegionalPath", nullable(Spec::Bool)),
            req("pathName", nullable(st(0, 200))),
        ]),
        "ParsedDocRecord" => obj(vec![
            req("url", st(1, 2000)),
            req("fileName", st(0, 300)),
            req("kind", en(&["pdf", "hwp", "hwpx", "docx", "unknown"])),
            req("text", st(0, 50000)),
            req(
                "fields",
                arr(
                    obj(vec![
                        req("label", st(0, 300)),
                        req("maxLength", nullable(int())),
                        req("required", Spec::Bool),
                    ]),
                    200,
                ),
            ),
            req("warnings", arr(st(0, 300), 20)),
            req("summary", nullable(st(0, 2000))),
            def("summaryAttempts", nonneg(), json!(0)),
            req("parsedAt", time()),
        ]),
        "BufsLock" => obj(vec![
            req("fails", nonneg()),
            req("lockedUntil", nullable(time())),
        ]),
        "BufsSession" => obj(vec![req("expiresAt", time())]),
        _ => return None,
    })
}

fn validate(spec: &Spec, v: &Value) -> Result<Value, String> {
    let invalid = || "invalid value".to_string();
    match spec {
        Spec::Str(min, max) => {
            let text = v.as_str().ok_or_else(invalid)?;
            let n = crate::jsstr::len16(text);
            if n < *min || n > *max {
                return Err(invalid());
            }
        }
        Spec::Email => {
            let text = v.as_str().ok_or_else(invalid)?;
            let re = regex::Regex::new(r"^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+\-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$").map_err(|_| invalid())?;
            if !re.is_match(text) {
                return Err(invalid());
            }
        }
        Spec::Date => {
            let text = v.as_str().ok_or_else(invalid)?;
            let b = text.as_bytes();
            if b.len() != 10
                || b.iter().enumerate().any(|(i, x)| {
                    if i == 4 || i == 7 {
                        *x != b'-'
                    } else {
                        !x.is_ascii_digit()
                    }
                })
            {
                return Err(invalid());
            }
        }
        Spec::TypeCode => {
            let text = v.as_str().ok_or_else(invalid)?;
            let b = text.as_bytes();
            if b.len() != 4
                || !b"AP".contains(&b[0])
                || !b"ST".contains(&b[1])
                || !b"DH".contains(&b[2])
                || !b"CK".contains(&b[3])
            {
                return Err(invalid());
            }
        }
        Spec::Bool => {
            if !v.is_boolean() {
                return Err(invalid());
            }
        }
        Spec::Num(integer, min, max) => {
            let n = v.as_f64().ok_or_else(invalid)?;
            if !n.is_finite() || n < *min || n > *max || (*integer && n.fract() != 0.0) {
                return Err(invalid());
            }
        }
        Spec::Enum(values) => {
            if !v.as_str().is_some_and(|x| values.contains(&x)) {
                return Err(invalid());
            }
        }
        Spec::Array(item, max) => {
            let a = v.as_array().ok_or_else(invalid)?;
            if a.len() > *max {
                return Err(invalid());
            }
            return a
                .iter()
                .map(|x| validate(item, x))
                .collect::<Result<Vec<_>, _>>()
                .map(Value::Array);
        }
        Spec::Record(item) => {
            let o = v.as_object().ok_or_else(invalid)?;
            let mut out = Map::new();
            for (k, x) in o {
                out.insert(k.clone(), validate(item, x)?);
            }
            return Ok(Value::Object(out));
        }
        Spec::Object(fields) => {
            let o = v.as_object().ok_or_else(invalid)?;
            let mut out = Map::new();
            for Field(k, s, missing) in fields {
                if let Some(x) = o.get(*k) {
                    out.insert((*k).to_string(), validate(s, x)?);
                } else {
                    match missing {
                        Some(Some(x)) => {
                            out.insert((*k).to_string(), x.clone());
                        }
                        Some(None) => {}
                        None => return Err(format!("missing {k}")),
                    }
                }
            }
            return Ok(Value::Object(out));
        }
        Spec::Nullable(inner) => {
            if !v.is_null() {
                return validate(inner, v);
            }
        }
        Spec::Union(a, b) => return validate(a, v).or_else(|_| validate(b, v)),
    }
    Ok(v.clone())
}
/// Parse a JSON value as the named exported Zod schema.
pub fn check(kind: &str, v: &Value) -> Result<Value, String> {
    validate(
        &schema(kind).ok_or_else(|| "unknown schema".to_string())?,
        v,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn user_defaults_and_stripping() {
        let v = json!({"id":"u","email":"a@example.com","isTeam":false,"createdAt":"1234567890","passwordHash":"1234567890","extra":1});
        let out = check("User", &v).unwrap();
        assert_eq!(out["emailVerified"], false);
        assert_eq!(out["mustChangePassword"], false);
        assert!(out.get("extra").is_none());
        assert!(check("User", &json!({})).is_err());
    }
    #[test]
    fn explore_defaults_unions_and_limits() {
        let v = json!({"kind":"guest","createdAt":"1234567890","start":{"conditions":{"age":"unknown","hasBusiness":null}}});
        assert!(check("ExploreState", &v).is_err());
        let mut v = v;
        v["start"]["conditions"]["hasBusiness"] = json!("unknown");
        v["start"]["idea"] = json!("한".repeat(200));
        let out = check("ExploreState", &v).unwrap();
        assert_eq!(out["updatedAt"], Value::Null);
        assert_eq!(out["step"], "start");
        v["start"]["idea"] = json!("한".repeat(201));
        assert!(check("ExploreState", &v).is_err());
    }
    #[test]
    fn parsed_defaults_and_nullable() {
        let mut v = json!({"url":"u","fileName":"f","kind":"unknown","text":"","fields":[],"warnings":[],"summary":null,"parsedAt":"1234567890","extra":1});
        let out = check("ParsedDocRecord", &v).unwrap();
        assert_eq!(out["summaryAttempts"], 0);
        assert!(out.get("extra").is_none());
        v["kind"] = json!("bad");
        assert!(check("ParsedDocRecord", &v).is_err());
    }
    #[test]
    fn application_enums() {
        let v = json!({"id":"a","userId":"u","programId":"p","status":"completed","channel":"web","formFileName":"","fields":[],"approval":null,"receiptNo":null,"receiptImageUrl":null,"failReason":null,"retries":0,"history":[],"createdAt":"1234567890","updatedAt":"1234567890"});
        assert!(check("Application", &v).is_ok());
        let mut bad = v;
        bad["status"] = json!("invalid");
        assert!(check("Application", &bad).is_err());
    }
}
