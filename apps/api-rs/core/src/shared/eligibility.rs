//! TS 원본: packages/shared/src/eligibility.ts
use super::{
    constants::{BUSAN_DISTRICTS, OUTSIDE_BUSAN},
    date::{add_years, d_day, d_day_label, kst_date},
};
use crate::jsstr::{js_trim, JS_WS};
use regex::Regex;
use serde_json::{json, Value};
use std::sync::LazyLock;

static BOTH: LazyLock<Option<Regex>> = LazyLock::new(|| {
    Regex::new(&format!(r"([0-9]+)[{JS_WS}]*세[{JS_WS}]*이상[{JS_WS}]*~[{JS_WS}]*만?[{JS_WS}]*([0-9]+)[{JS_WS}]*세[{JS_WS}]*(이하|미만)")).ok()
});
static LOWER: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(&format!(r"([0-9]+)[{JS_WS}]*세[{JS_WS}]*이상")).ok());
static UPPER: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(&format!(r"([0-9]+)[{JS_WS}]*세[{JS_WS}]*(이하|미만)")).ok());
static YEARS: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(&format!(r"([0-9]+)[{JS_WS}]*년[{JS_WS}]*(미만|이내|이하)")).ok());
fn tokens(raw: Option<&str>) -> Vec<&str> {
    raw.unwrap_or("")
        .split([',', '·', '/'])
        .map(js_trim)
        .filter(|s| !s.is_empty())
        .collect()
}
fn open(t: &[&str]) -> bool {
    t.iter()
        .any(|s| ["전체", "무관", "제한없음", "제한 없음"].contains(s))
}
/// Parsed age conditions, preserving JavaScript's infinite upper bound.
#[derive(Debug, PartialEq)]
pub enum AgeRanges {
    Open,
    Ranges(Vec<(f64, f64)>),
}

/// TS: function parseAgeRanges(raw: string | null): Array<[number, number]> | 'open' | null
pub fn parse_age_ranges(raw: Option<&str>) -> Option<AgeRanges> {
    let t = tokens(raw);
    if t.is_empty() {
        return None;
    }
    if open(&t) {
        return Some(AgeRanges::Open);
    }
    let (both, lower, upper) = (BOTH.as_ref()?, LOWER.as_ref()?, UPPER.as_ref()?);
    let mut ranges = vec![];
    for s in t {
        if let Some(c) = both.captures(s) {
            let lo = c[1].parse::<f64>().ok()?;
            let hi = c[2].parse::<f64>().ok()? - if &c[3] == "미만" { 1.0 } else { 0.0 };
            ranges.push((lo, hi));
        } else if let Some(c) = lower.captures(s) {
            ranges.push((c[1].parse::<f64>().ok()?, f64::INFINITY));
        } else {
            let c = upper.captures(s)?;
            ranges.push((
                0.0,
                c[1].parse::<f64>().ok()? - if &c[2] == "미만" { 1.0 } else { 0.0 },
            ));
        }
    }
    Some(AgeRanges::Ranges(ranges))
}
/// TS: function parseYearBuckets(raw: string | null): { pre: boolean; maxYears: number | null } | 'open' | null
pub fn parse_year_buckets(raw: Option<&str>) -> Value {
    let t = tokens(raw);
    if t.is_empty() {
        return Value::Null;
    }
    if open(&t) {
        return json!("open");
    }
    let Some(re) = YEARS.as_ref() else {
        return Value::Null;
    };
    let mut pre = false;
    let mut max: Option<f64> = None;
    for s in t {
        if s.contains("예비") {
            pre = true;
        } else if let Some(c) = re.captures(s) {
            let Ok(n) = c[1].parse::<f64>() else {
                return Value::Null;
            };
            max = Some(max.unwrap_or(0.0).max(n));
        } else {
            return Value::Null;
        }
    }
    json!({"pre":pre,"maxYears":max})
}
fn check(key: &str, label: &str, status: &str, detail: &str) -> Value {
    json!({"key":key,"label":label,"status":status,"detail":detail})
}
fn text<'a>(p: &'a Value, k: &str) -> &'a str {
    p[k].as_str().unwrap_or("")
}
/// TS: function checkDeadline(p: Program, now: Date): EligibilityCheck
pub fn check_deadline(p: &Value, now: i64) -> Value {
    if p["recruiting"] != true {
        return check("deadline", "마감", "fail", "모집이 끝났어요");
    }
    let end = p["endDate"].as_str();
    match d_day(end, now) {
        None => check("deadline", "마감", "pass", "상시 모집"),
        Some(d) if d < 0.0 => check(
            "deadline",
            "마감",
            "fail",
            &format!("{} 마감됨", end.unwrap_or("")),
        ),
        Some(d) => check(
            "deadline",
            "마감",
            "pass",
            &format!("{} 마감 ({})", end.unwrap_or(""), d_day_label(Some(d))),
        ),
    }
}
/// TS: function checkRegion(p: Program, profile: ConsultProfile): EligibilityCheck
pub fn check_region(p: &Value, profile: &Value) -> Value {
    let list = tokens(p["region"].as_str());
    let district = text(profile, "district");
    if list.is_empty() {
        check("region", "지역", "unknown", "공고에 지역 정보가 없어요")
    } else if list.contains(&"전국") {
        check("region", "지역", "pass", "전국 대상")
    } else if !list.contains(&"부산") {
        check(
            "region",
            "지역",
            "fail",
            &format!("{} 한정", list.join(", ")),
        )
    } else if district.is_empty() {
        check("region", "지역", "unknown", "사업장 지역을 입력해 주세요")
    } else if district == OUTSIDE_BUSAN {
        check("region", "지역", "fail", "부산 소재 사업장만 대상")
    } else if BUSAN_DISTRICTS.contains(&district) {
        check(
            "region",
            "지역",
            "pass",
            &format!("부산 대상 · 내 지역 {district}"),
        )
    } else {
        check(
            "region",
            "지역",
            "unknown",
            "사업장 지역을 확인할 수 없어요",
        )
    }
}
/// TS: function checkAge(p: Program, profile: ConsultProfile): EligibilityCheck
pub fn check_age(p: &Value, profile: &Value) -> Value {
    let raw = text(p, "targetAge");
    let ranges = parse_age_ranges(p["targetAge"].as_str());
    if ranges == Some(AgeRanges::Open) {
        return check("age", "나이", "pass", "나이 제한 없음");
    }
    if ranges.is_none() {
        return check(
            "age",
            "나이",
            "unknown",
            &if raw.is_empty() {
                "공고에 나이 조건이 없어요".into()
            } else {
                format!("조건 확인 필요: {raw}")
            },
        );
    }
    if profile.get("age").is_none() {
        return check("age", "나이", "unknown", "나이를 입력해 주세요");
    }
    let age = profile["age"].as_f64().unwrap_or(0.0);
    let ok = match ranges {
        Some(AgeRanges::Ranges(r)) => r.iter().any(|(lo, hi)| age >= *lo && age <= *hi),
        _ => false,
    };
    check(
        "age",
        "나이",
        if ok { "pass" } else { "fail" },
        &format!(
            "대상 {raw} · 나 만 {}세",
            if profile["age"].is_number() {
                age.to_string()
            } else {
                profile["age"].to_string()
            }
        ),
    )
}
/// TS: function checkYears(p: Program, profile: ConsultProfile, now: Date): EligibilityCheck
pub fn check_years(p: &Value, profile: &Value, now: i64) -> Value {
    let raw = text(p, "bizYears");
    let b = parse_year_buckets(p["bizYears"].as_str());
    if b == "open" {
        return check("years", "창업 연차", "pass", "연차 제한 없음");
    }
    if b.is_null() {
        return check(
            "years",
            "창업 연차",
            "unknown",
            &if raw.is_empty() {
                "공고에 창업 연차 조건이 없어요".into()
            } else {
                format!("조건 확인 필요: {raw}")
            },
        );
    }
    let stage = text(profile, "stage");
    if stage.is_empty() {
        return check("years", "창업 연차", "unknown", "창업 단계를 입력해 주세요");
    }
    if stage == "pre" {
        return if b["pre"] == true {
            check("years", "창업 연차", "pass", "예비창업자 대상")
        } else {
            check("years", "창업 연차", "fail", "사업자가 있는 창업자만 대상")
        };
    }
    let opened = text(profile, "openedAt");
    if opened.is_empty() {
        return check("years", "창업 연차", "unknown", "개업일을 입력해 주세요");
    }
    let Some(years) = b["maxYears"].as_f64() else {
        return check("years", "창업 연차", "fail", "예비창업자만 대상");
    };
    let limit = add_years(opened, years as i32);
    check(
        "years",
        "창업 연차",
        if kst_date(now) <= limit {
            "pass"
        } else {
            "fail"
        },
        &format!("창업 {years}년 이내 대상 ({limit}까지)"),
    )
}
/// TS: function verdictOf(checks: EligibilityCheck[]): Verdict
pub fn verdict_of(checks: &[Value]) -> &'static str {
    if checks.iter().any(|c| c["status"] == "fail") {
        "ineligible"
    } else if checks.iter().any(|c| c["status"] == "unknown") {
        "check"
    } else {
        "eligible"
    }
}
/// TS: function judge(p: Program, profile: ConsultProfile, now: Date): Eligibility
pub fn judge(p: &Value, profile: &Value, now: i64) -> Value {
    let checks = vec![
        check_deadline(p, now),
        check_region(p, profile),
        check_age(p, profile),
        check_years(p, profile, now),
    ];
    json!({"programId":p["id"],"verdict":verdict_of(&checks),"checks":checks})
}
fn date_arg(v: &Value) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(v.get("$date")?.as_str()?)
        .ok()
        .map(|d| d.timestamp_millis())
}
/// 함수 골든.
pub fn golden(f: &str, args: &[Value]) -> Option<Value> {
    let a = args.first()?;
    match f {
        "parseAgeRanges" => Some(match parse_age_ranges(a.as_str()) {
            None => Value::Null,
            Some(AgeRanges::Open) => json!("open"),
            Some(AgeRanges::Ranges(r)) => Value::Array(
                r.into_iter()
                    .map(|(lo, hi)| {
                        json!([
                            if lo.is_infinite() {
                                json!({"$num":"Infinity"})
                            } else {
                                json!(lo)
                            },
                            if hi.is_infinite() {
                                json!({"$num":"Infinity"})
                            } else {
                                json!(hi)
                            }
                        ])
                    })
                    .collect(),
            ),
        }),
        "parseYearBuckets" => Some(parse_year_buckets(a.as_str())),
        "checkDeadline" => Some(check_deadline(a, date_arg(args.get(1)?)?)),
        "checkRegion" => Some(check_region(a, args.get(1)?)),
        "checkAge" => Some(check_age(a, args.get(1)?)),
        "checkYears" => Some(check_years(a, args.get(1)?, date_arg(args.get(2)?)?)),
        "verdictOf" => Some(json!(verdict_of(a.as_array()?))),
        "judge" => Some(judge(a, args.get(1)?, date_arg(args.get(2)?)?)),
        _ => None,
    }
}
#[cfg(test)]
mod correction_tests {
    use super::*;
    #[test]
    fn fullwidth_and_js_whitespace() {
        assert_eq!(parse_age_ranges(Some("만 ２０세 이상")), None);
        assert!(parse_year_buckets(Some("２년미만")).is_null());
        assert_eq!(
            parse_age_ranges(Some("\u{feff}전체\u{feff}")),
            Some(AgeRanges::Open)
        );
        assert!(parse_age_ranges(Some("20\u{feff}세 이상")).is_some());
        assert!(parse_age_ranges(Some("20\u{85}세 이상")).is_none());
        assert_eq!(
            check_age(&json!({"targetAge":"만 ２０세 이상"}), &json!({"age":24}))["status"],
            "unknown"
        );
        assert_eq!(
            check_years(&json!({"bizYears":"２년미만"}), &json!({"stage":"pre"}), 0)["status"],
            "unknown"
        );
        assert!(
            check_age(&json!({"targetAge":"20세 이상"}), &json!({"age":24.0}))["detail"]
                .as_str()
                .is_some_and(|s| s.contains("24세"))
        );
    }
}
