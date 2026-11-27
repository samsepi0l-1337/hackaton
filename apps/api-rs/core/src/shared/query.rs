//! TS 원본: packages/shared/src/query.ts
use super::{
    constants::{DUE_SOON_DAYS, PAGE_SIZE},
    date::{d_day, is_closed},
    eligibility::{judge, parse_age_ranges, parse_year_buckets, AgeRanges},
};
use crate::jsstr::js_trim;
use serde_json::{json, Value};

fn text<'a>(v: &'a Value, k: &str) -> &'a str {
    v[k].as_str().unwrap_or("")
}
fn date_arg(v: &Value) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(v.get("$date")?.as_str()?)
        .ok()
        .map(|d| d.timestamp_millis())
}
fn day(p: &Value, now: i64) -> Option<f64> {
    d_day(p["endDate"].as_str(), now)
}
fn day_json(d: Option<f64>) -> Value {
    match d {
        Some(n) if n.is_finite() && n.fract() == 0.0 => json!(n as i64),
        Some(n) => json!(n),
        None => Value::Null,
    }
}
fn matches_stage(p: &Value, stage: &str) -> bool {
    let b = parse_year_buckets(p["bizYears"].as_str());
    if b.is_null() || b == "open" {
        true
    } else if stage == "pre" {
        b["pre"] == true
    } else {
        b["maxYears"].as_f64().unwrap_or(0.0)
            >= match stage {
                "lt1" => 1.0,
                "1to3" => 3.0,
                _ => 7.0,
            }
    }
}
fn matches_age(p: &Value, age: f64) -> bool {
    match parse_age_ranges(p["targetAge"].as_str()) {
        None | Some(AgeRanges::Open) => true,
        Some(AgeRanges::Ranges(ranges)) => ranges.iter().any(|(lo, hi)| age >= *lo && age <= *hi),
    }
}
/// TS: function toCard(p: Program, now: Date, profile: ConsultProfile | null): ProgramCard
pub fn to_card(p: &Value, now: i64, profile: &Value) -> Value {
    json!({"program":p,"dDay":day_json(day(p,now)),"eligibility":if profile.is_null() {Value::Null} else {judge(p,profile,now)}})
}
/// TS: function listPrograms(programs: Program[], q: ProgramListQuery, now: Date, profile: ConsultProfile | null): ProgramListResponse
pub fn list_programs(programs: &[Value], q: &Value, now: i64, profile: &Value) -> Value {
    let kw = js_trim(text(q, "q")).to_lowercase();
    let mut cards: Vec<Value> = programs
        .iter()
        .filter(|p| {
            if q["includeClosed"] != true
                && (p["recruiting"] != true || is_closed(p["endDate"].as_str(), now))
            {
                return false;
            }
            if !kw.is_empty()
                && !["title", "agency", "content"]
                    .iter()
                    .any(|k| text(p, k).to_lowercase().contains(&kw))
                && !p["tags"].as_array().is_some_and(|a| {
                    a.iter()
                        .any(|t| t.as_str().unwrap_or("").to_lowercase().contains(&kw))
                })
            {
                return false;
            }
            if !text(q, "region").is_empty()
                && !text(p, "region")
                    .split(',')
                    .any(|r| js_trim(r) == text(q, "region"))
            {
                return false;
            }
            if !text(q, "category").is_empty() && q["category"] != p["category"] {
                return false;
            }
            if !text(q, "stage").is_empty() && !matches_stage(p, text(q, "stage")) {
                return false;
            }
            if let Some(age) = q["age"].as_f64() {
                if !matches_age(p, age) {
                    return false;
                }
            }
            if !text(q, "due").is_empty() {
                let d = day(p, now);
                if text(q, "due") == "always" {
                    if d.is_some() {
                        return false;
                    }
                } else if !d.is_some_and(|n| {
                    n >= 0.0 && n <= text(q, "due").parse::<f64>().unwrap_or(f64::NAN)
                }) {
                    return false;
                }
            }
            true
        })
        .map(|p| to_card(p, now, profile))
        .filter(|c| {
            text(q, "verdict").is_empty()
                || profile.is_null()
                || c["eligibility"]["verdict"] == q["verdict"]
        })
        .collect();
    cards.sort_by(|a, b| {
        let pa = &a["program"];
        let pb = &b["program"];
        let primary = if text(q, "sort") == "latest" {
            text(pb, "registeredAt").cmp(text(pa, "registeredAt"))
        } else {
            a["dDay"]
                .as_f64()
                .unwrap_or(1e9)
                .total_cmp(&b["dDay"].as_f64().unwrap_or(1e9))
        };
        primary.then_with(|| text(pa, "id").cmp(text(pb, "id")))
    });
    let offset = q["offset"].as_i64().unwrap_or(0).max(0) as usize;
    let limit = q["limit"].as_i64().unwrap_or(PAGE_SIZE).clamp(1, 100) as usize;
    let total = cards.len();
    let items: Vec<_> = cards.into_iter().skip(offset).take(limit).collect();
    json!({"total":total,"items":items,"nextOffset":if offset.saturating_add(limit)<total {Some(offset+limit)} else {None}})
}
/// TS: function homeSummary(programs: Program[], now: Date): HomeResponse
pub fn home_summary(programs: &[Value], now: i64) -> Value {
    let open: Vec<_> = programs
        .iter()
        .filter(|p| p["recruiting"] == true && !is_closed(p["endDate"].as_str(), now))
        .collect();
    let mut closing: Vec<_> = open
        .iter()
        .copied()
        .filter(|p| !p["endDate"].is_null())
        .collect();
    closing.sort_by(|a, b| {
        text(a, "endDate")
            .cmp(text(b, "endDate"))
            .then_with(|| text(a, "id").cmp(text(b, "id")))
    });
    let count = closing
        .iter()
        .filter(|p| day(p, now).unwrap_or(1e9) <= DUE_SOON_DAYS as f64)
        .count();
    let cards: Vec<_> = closing
        .iter()
        .take(3)
        .map(|p| to_card(p, now, &Value::Null))
        .collect();
    json!({"openCount":open.len(),"closingThisWeek":count,"closingSoon":cards})
}
/// TS: function parseVerdict(v: unknown): Verdict | undefined
pub fn parse_verdict(v: &Value) -> Value {
    if ["eligible", "check", "ineligible"].contains(&v.as_str().unwrap_or("")) {
        v.clone()
    } else {
        json!({"$undef":true})
    }
}
/// 함수 골든.
pub fn golden(f: &str, args: &[Value]) -> Option<Value> {
    let a = args.first()?;
    match f {
        "toCard" => Some(to_card(a, date_arg(args.get(1)?)?, args.get(2)?)),
        "listPrograms" => Some(list_programs(
            a.as_array()?,
            args.get(1)?,
            date_arg(args.get(2)?)?,
            args.get(3)?,
        )),
        "homeSummary" => Some(home_summary(a.as_array()?, date_arg(args.get(1)?)?)),
        "parseVerdict" => Some(parse_verdict(a)),
        _ => None,
    }
}
