//! TS 원본: packages/shared/src/profile.ts
use super::{constants::*, date::is_valid_iso_date};
use serde_json::{json, Value};

/// TS: export const SECTION_FIELDS: Record<ProfileSection, (keyof ConsultProfile)[]>
pub const SECTION_FIELDS: &[(&str, &[&str])] = &[
    (
        "me",
        &[
            "age",
            "stage",
            "openedAt",
            "district",
            "affiliation",
            "teamSize",
            "typeCode",
        ],
    ),
    (
        "business",
        &[
            "idea",
            "industry",
            "bizForm",
            "problem",
            "readiness",
            "revenue",
        ],
    ),
    (
        "customer",
        &[
            "customerType",
            "customerAges",
            "customerRegion",
            "customerDesc",
            "alternative",
            "needs",
        ],
    ),
];
fn has(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::String(s) => !crate::jsstr::js_trim(s).is_empty(),
        Value::Array(a) => !a.is_empty(),
        _ => true,
    }
}
fn one_of(v: &Value, list: &[&str]) -> bool {
    v.as_str().is_some_and(|s| list.contains(&s))
}
fn any_of(v: &Value, list: &[&str]) -> bool {
    v.as_array()
        .is_some_and(|a| a.iter().any(|v| one_of(v, list)))
}
fn push(e: &mut Vec<Value>, field: &str, message: &str) {
    e.push(json!({"field":field,"message":message}));
}
fn required(e: &mut Vec<Value>, p: &Value, field: &str, label: &str) {
    if !has(&p[field]) {
        push(e, field, &format!("{label}을(를) 입력해 주세요"));
    }
}
fn max_len(e: &mut Vec<Value>, p: &Value, field: &str, max: i64, label: &str) {
    if p[field].as_str().unwrap_or("").encode_utf16().count() > max as usize {
        let particle = if field == "customerDesc" {
            "은"
        } else {
            "는"
        };
        push(e, field, &format!("{label}{particle} {max}자 이하예요"));
    }
}
/// TS: function validateProfileSection(section: ProfileSection, p: ConsultProfile): FieldError[]
pub fn validate_profile_section(section: &str, p: &Value) -> Vec<Value> {
    let mut e = vec![];
    if section == "me" {
        if !has(&p["age"]) {
            push(&mut e, "age", "나이를 입력해 주세요");
        } else if !p["age"]
            .as_f64()
            .is_some_and(|n| n.fract() == 0.0 && n >= AGE_MIN as f64 && n <= AGE_MAX as f64)
        {
            push(
                &mut e,
                "age",
                &format!("나이는 만 {AGE_MIN}~{AGE_MAX}세예요"),
            );
        }
        if !p["stage"]
            .as_str()
            .is_some_and(|s| STAGES.iter().any(|(v, _)| *v == s))
        {
            push(&mut e, "stage", "창업 단계를 골라 주세요");
        }
        if p["stage"]
            .as_str()
            .is_some_and(|s| !s.is_empty() && s != "pre")
            && !is_valid_iso_date(&p["openedAt"])
        {
            push(&mut e, "openedAt", "사업자 개업일을 입력해 주세요");
        }
        if !one_of(&p["district"], BUSAN_DISTRICTS) && p["district"] != OUTSIDE_BUSAN {
            push(&mut e, "district", "사업장 지역을 골라 주세요");
        }
    }
    if section == "business" {
        required(&mut e, p, "idea", "아이디어");
        max_len(&mut e, p, "idea", IDEA_MAX, "아이디어");
        if !one_of(&p["industry"], INDUSTRIES) {
            push(&mut e, "industry", "업종을 골라 주세요");
        }
        if !one_of(&p["bizForm"], BIZ_FORMS) {
            push(&mut e, "bizForm", "사업 형태를 골라 주세요");
        }
        required(&mut e, p, "problem", "해결하려는 문제");
        max_len(&mut e, p, "problem", PROBLEM_MAX, "문제");
        if !one_of(&p["readiness"], READINESS) {
            push(&mut e, "readiness", "준비 상태를 골라 주세요");
        }
    }
    if section == "customer" {
        if !one_of(&p["customerType"], CUSTOMER_TYPES) {
            push(&mut e, "customerType", "고객 유형을 골라 주세요");
        }
        if p["customerType"] == "B2C" && !any_of(&p["customerAges"], CUSTOMER_AGES) {
            push(&mut e, "customerAges", "고객 연령대를 골라 주세요");
        }
        if !one_of(&p["customerRegion"], CUSTOMER_REGIONS) {
            push(&mut e, "customerRegion", "고객 지역을 골라 주세요");
        }
        required(&mut e, p, "customerDesc", "고객 설명");
        max_len(&mut e, p, "customerDesc", CUSTOMER_DESC_MAX, "고객 설명");
        if !any_of(&p["needs"], SUPPORT_NEEDS) {
            push(&mut e, "needs", "필요한 지원을 하나 이상 골라 주세요");
        }
    }
    e
}
/// TS: function validateProfile(p: ConsultProfile): FieldError[]
pub fn validate_profile(p: &Value) -> Vec<Value> {
    ["me", "business", "customer"]
        .into_iter()
        .flat_map(|s| validate_profile_section(s, p))
        .collect()
}
/// TS: function isProfileComplete(p: ConsultProfile | null | undefined): p is ConsultProfile
pub fn is_profile_complete(p: &Value) -> bool {
    !p.is_null() && p.get("$undef").is_none() && validate_profile(p).is_empty()
}
/// 함수 골든.
pub fn golden(f: &str, args: &[Value]) -> Option<Value> {
    let a = args.first()?;
    match f {
        "validateProfileSection" => {
            Some(json!(validate_profile_section(a.as_str()?, args.get(1)?)))
        }
        "validateProfile" => Some(json!(validate_profile(a))),
        "isProfileComplete" => Some(json!(is_profile_complete(a))),
        _ => None,
    }
}
#[cfg(test)]
mod correction_tests {
    use super::*;
    #[test]
    fn js_trim_required_fields() {
        assert!(
            validate_profile_section("business", &json!({"idea":"\u{feff}"}))
                .iter()
                .any(|e| e["field"] == "idea")
        );
        assert!(
            !validate_profile_section("business", &json!({"idea":"\u{85}"}))
                .iter()
                .any(|e| e["field"] == "idea")
        );
    }
}
