//! 수집한 공고와 수집 상태를 KV 에 저장한다.
use crate::kv::MemKv;
use serde_json::{Map, Value};

const FIELDS: &[&str] = &[
    "id",
    "type",
    "title",
    "agency",
    "url",
    "target",
    "stages",
    "content",
    "procedure",
    "prep",
    "regions",
    "affiliationLimit",
    "costPeriod",
    "recruitStatus",
    "endDate",
    "startDate",
    "checkedAt",
    "sourceExcerpt",
    "industryTags",
    "capabilityTags",
    "contextIds",
    "conditions",
    "test",
];
const META: &[&str] = &[
    "fetchedAt",
    "attemptedAt",
    "lastError",
    "total",
    "open",
    "closed",
    "added",
    "updated",
    "closedNow",
];
fn one(v: &Value, choices: &[&str]) -> bool {
    v.as_str().is_some_and(|s| choices.contains(&s))
}
fn strings(v: &Value, choices: Option<&[&str]>) -> bool {
    v.as_array().is_some_and(|a| {
        a.iter().all(|v| {
            v.as_str()
                .is_some_and(|s| choices.is_none_or(|c| c.contains(&s)))
        })
    })
}
fn resource(v: &Value) -> Option<Value> {
    let o = v.as_object()?;
    for k in ["id", "title", "agency", "content"] {
        if !o.get(k)?.is_string() {
            return None;
        }
    }
    for k in [
        "url",
        "target",
        "procedure",
        "prep",
        "affiliationLimit",
        "costPeriod",
        "endDate",
        "checkedAt",
        "sourceExcerpt",
    ] {
        let v = o.get(k)?;
        if !v.is_null() && !v.is_string() {
            return None;
        }
    }
    if let Some(v) = o.get("startDate") {
        if !v.is_null() && !v.is_string() {
            return None;
        }
    }
    if !one(o.get("type")?, &["교육", "상담", "공간", "지원사업"])
        || !one(
            o.get("recruitStatus")?,
            &["open", "closed", "always", "unknown"],
        )
    {
        return None;
    }
    if !strings(
        o.get("stages")?,
        Some(&["no_idea", "has_idea", "preparing"]),
    ) || !strings(
        o.get("regions")?,
        Some(&["부산", "울산", "경남", "미정", "부울경", "전국"]),
    ) || !strings(
        o.get("industryTags")?,
        Some(&[
            "조선·해양",
            "자동차",
            "항공",
            "방산",
            "수소·에너지",
            "데이터센터",
            "AI",
            "2차전지",
        ]),
    ) || !strings(o.get("capabilityTags")?, None)
        || !strings(o.get("contextIds")?, None)
        || !o.get("test")?.is_boolean()
    {
        return None;
    }
    let c = o.get("conditions")?;
    let conditions = if c.is_null() {
        Value::Null
    } else {
        let c = c.as_object()?;
        let mut out = Map::new();
        for k in ["ageMin", "ageMax", "ageAny", "residence", "business"] {
            if let Some(v) = c.get(k) {
                let valid = match k {
                    "ageMin" | "ageMax" => v.is_number(),
                    "ageAny" => v.is_boolean(),
                    "residence" => v.is_string(),
                    _ => one(v, &["pre", "any", "registered"]),
                };
                if !valid {
                    return None;
                }
                out.insert(k.into(), v.clone());
            }
        }
        Value::Object(out)
    };
    let mut out = Map::new();
    for k in FIELDS {
        if let Some(v) = o.get(*k) {
            out.insert(
                (*k).into(),
                if *k == "conditions" {
                    conditions.clone()
                } else {
                    v.clone()
                },
            );
        }
    }
    Some(Value::Object(out))
}
pub fn resources(kv: &MemKv) -> Vec<Value> {
    kv.list("ks:resource:")
        .iter()
        .filter_map(|(_, v)| resource(v))
        .collect()
}
pub fn meta(kv: &MemKv) -> Option<Value> {
    let o = kv.get("ks:meta")?.as_object()?;
    for k in &META[..3] {
        let v = o.get(*k)?;
        if !v.is_null() && !v.is_string() {
            return None;
        }
    }
    for k in &META[3..] {
        if !o.get(*k)?.is_number() {
            return None;
        }
    }
    let mut out = Map::new();
    for k in META {
        out.insert((*k).into(), o.get(*k)?.clone());
    }
    Some(Value::Object(out))
}
pub fn save(kv: &mut MemKv, list: &[Value]) {
    for v in list {
        if let Some(v) = resource(v) {
            if let Some(id) = v.get("id").and_then(Value::as_str) {
                kv.put(&format!("ks:resource:{id}"), v.clone());
            }
        }
    }
}
pub fn save_meta(kv: &mut MemKv, v: Value) {
    kv.put("ks:meta", v);
}
