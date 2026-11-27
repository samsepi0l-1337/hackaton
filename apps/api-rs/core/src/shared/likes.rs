//! TS 원본: packages/shared/src/likes.ts
use serde_json::{json, Value};

/// TS: `LIKES_MAX = 200`.
pub const LIKES_MAX: usize = 200;
/// TS: `interface LikeProfile`.
#[derive(Clone, Debug, Default)]
pub struct LikeProfile {
    pub count: usize,
    pub caps: Vec<(String, usize)>,
    pub industries: Vec<(String, usize)>,
    pub types: Vec<(String, usize)>,
    pub agencies: Vec<(String, usize)>,
    pub ids: Vec<String>,
}
fn bump(map: &mut Vec<(String, usize)>, key: &str) {
    if let Some((_, n)) = map.iter_mut().find(|(k, _)| k == key) {
        *n += 1;
    } else {
        map.push((key.to_owned(), 1));
    }
}
fn strings<'a>(v: &'a Value, field: &str) -> impl Iterator<Item = &'a str> {
    v.get(field)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
}
/// TS: `likeProfile(liked: readonly Resource[]): LikeProfile`.
pub fn like_profile(liked: &[Value]) -> LikeProfile {
    let mut p = LikeProfile {
        count: liked.len(),
        ..Default::default()
    };
    for r in liked {
        if let Some(id) = r.get("id").and_then(Value::as_str) {
            if !p.ids.iter().any(|s| s == id) {
                p.ids.push(id.to_owned());
            }
        }
        for t in strings(r, "capabilityTags") {
            bump(&mut p.caps, t);
        }
        for t in strings(r, "industryTags") {
            bump(&mut p.industries, t);
        }
        if let Some(t) = r.get("type").and_then(Value::as_str) {
            bump(&mut p.types, t);
        }
        if let Some(t) = r
            .get("agency")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
        {
            bump(&mut p.agencies, t);
        }
    }
    p
}
fn share<'a>(map: &[(String, usize)], keys: impl Iterator<Item = &'a str>, count: usize) -> f64 {
    keys.map(|k| map.iter().find(|(s, _)| s == k).map_or(0, |(_, n)| *n))
        .max()
        .unwrap_or(0) as f64
        / count as f64
}
/// TS: `likeSimilarity(r: Resource, p: LikeProfile | null | undefined): number`.
pub fn like_similarity(r: &Value, p: Option<&LikeProfile>) -> f64 {
    let Some(p) = p.filter(|p| p.count > 0) else {
        return 0.0;
    };
    let s = 0.4 * share(&p.caps, strings(r, "capabilityTags"), p.count)
        + 0.3 * share(&p.industries, strings(r, "industryTags"), p.count)
        + 0.2
            * share(
                &p.types,
                r.get("type").and_then(Value::as_str).into_iter(),
                p.count,
            )
        + 0.1
            * share(
                &p.agencies,
                r.get("agency")
                    .and_then(Value::as_str)
                    .filter(|s| !s.is_empty())
                    .into_iter(),
                p.count,
            );
    (s * 1000.0).round().min(1000.0) / 1000.0
}
/// TS: `likeTopics(p: LikeProfile | null | undefined): string[]`.
pub fn like_topics(p: Option<&LikeProfile>) -> Vec<String> {
    let Some(p) = p.filter(|p| p.count > 0) else {
        return vec![];
    };
    let mut topics: Vec<_> = p.caps.iter().chain(&p.industries).collect();
    topics.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    topics.into_iter().take(3).map(|(k, _)| k.clone()).collect()
}
fn profile_json(p: &LikeProfile) -> Value {
    json!({"count":p.count,"caps":{"$map":p.caps},"industries":{"$map":p.industries},"types":{"$map":p.types},"agencies":{"$map":p.agencies},"ids":{"$set":p.ids}})
}
fn from_json(v: &Value) -> Option<LikeProfile> {
    fn entries(v: &Value) -> Vec<(String, usize)> {
        v.get("$map")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|a| Some((a.get(0)?.as_str()?.to_owned(), a.get(1)?.as_u64()? as usize)))
            .collect()
    }
    Some(LikeProfile {
        count: v.get("count")?.as_u64()? as usize,
        caps: entries(&v["caps"]),
        industries: entries(&v["industries"]),
        types: entries(&v["types"]),
        agencies: entries(&v["agencies"]),
        ids: v["ids"]["$set"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect(),
    })
}
/// 함수 골든.
pub fn golden(f: &str, args: &[Value]) -> Option<Value> {
    match f {
        "likeProfile" => Some(profile_json(&like_profile(args.first()?.as_array()?))),
        "likeSimilarity" => Some(json!(like_similarity(
            args.first()?,
            args.get(1).and_then(from_json).as_ref()
        ))),
        "likeTopics" => Some(json!(like_topics(
            args.first().and_then(from_json).as_ref()
        ))),
        _ => None,
    }
}
