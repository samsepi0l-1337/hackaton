//! TS 원본: packages/shared/src/kstartup-resource.ts
use super::{
    date::kst_date,
    eligibility::{parse_age_ranges, AgeRanges},
    explore::INDUSTRY_TAGS,
    kstartup::to_iso,
};
use crate::jsstr::{is_js_ws, JS_WS};
use serde_json::{json, Map, Value};
use std::sync::LazyLock;

static TEXT_RE: LazyLock<Option<regex::Regex>> =
    LazyLock::new(|| regex::Regex::new(r"<[^>]*>|&nbsp;").ok());
static REGISTERED_RE: LazyLock<Option<regex::Regex>> = LazyLock::new(|| {
    regex::Regex::new(&format!(
        r"[0-9]+[{JS_WS}]*년[{JS_WS}]*(미만|이내|이하|이상)"
    ))
    .ok()
});
fn text(v: Option<&Value>) -> Option<String> {
    let v = v?;
    if v.is_number() {
        return Some(v.to_string());
    }
    let s = v.as_str()?;
    let re = TEXT_RE.as_ref()?;
    let replaced = re.replace_all(s, " ");
    let result = replaced
        .split(is_js_ws)
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    (!result.is_empty()).then_some(result)
}
fn clip(s: &str, n: usize) -> String {
    if crate::jsstr::len16(s) > n {
        format!(
            "{}…",
            crate::jsstr::take16(s, n - 1).trim_end_matches(is_js_ws)
        )
    } else {
        s.to_owned()
    }
}
fn tokens(s: &str) -> Vec<&str> {
    s.split([',', '·', '/'])
        .map(|s| s.trim_matches(is_js_ws))
        .filter(|s| !s.is_empty())
        .collect()
}

/// TS: function regionsOf(raw: string | null | undefined): Region[]
pub fn regions_of(raw: Option<&str>) -> Vec<&'static str> {
    let t = raw.unwrap_or("");
    [
        ("전국", t.contains("전국")),
        ("부울경", t.contains("부울경")),
        ("부산", t.contains("부산")),
        ("울산", t.contains("울산")),
        ("경남", t.contains("경남") || t.contains("경상남도")),
    ]
    .into_iter()
    .filter_map(|(s, b)| b.then_some(s))
    .collect()
}
/// TS: function enyyOf(raw: string | null | undefined): { stages: ReadinessStage[]; business: 'pre' | 'any' | 'registered' | undefined }
pub fn enyy_of(raw: Option<&str>) -> (Vec<&'static str>, Option<&'static str>) {
    let v = raw.map(|s| Value::String(s.to_owned()));
    let s = text(v.as_ref()).unwrap_or_default();
    let list = tokens(&s);
    if list
        .iter()
        .any(|s| ["전체", "무관", "제한없음", "제한 없음"].contains(s))
    {
        return (vec!["has_idea", "preparing"], Some("any"));
    }
    let pre = list.iter().any(|s| s.contains("예비"));
    let registered = REGISTERED_RE
        .as_ref()
        .is_some_and(|re| list.iter().any(|s| re.is_match(s)));
    let stages = if pre {
        vec!["has_idea", "preparing"]
    } else if registered {
        vec!["preparing"]
    } else {
        vec![]
    };
    (
        stages,
        match (pre, registered) {
            (true, true) => Some("any"),
            (true, false) => Some("pre"),
            (false, true) => Some("registered"),
            _ => None,
        },
    )
}
/// TS: function capabilitiesOf(raw: string | null | undefined): string[]
pub fn capabilities_of(raw: Option<&str>) -> Vec<&'static str> {
    let s = raw.unwrap_or("");
    [
        ("자금", &["사업화", "융자", "보증", "투자"][..]),
        ("상담", &["멘토링", "컨설팅"]),
        ("공간", &["시설", "공간", "보육"]),
        ("교육", &["교육"]),
        ("네트워킹", &["행사", "네트워크"]),
    ]
    .into_iter()
    .filter_map(|(tag, words)| words.iter().any(|w| s.contains(w)).then_some(tag))
    .collect()
}
/// TS: function typeOfCapabilities(tags: readonly string[]): ResourceType
pub fn type_of_capabilities(tags: &[String]) -> &'static str {
    for s in ["공간", "상담", "교육"] {
        if tags.iter().any(|t| t == s) {
            return s;
        }
    }
    "지원사업"
}
/// TS: function industryTagsOf(body: string): IndustryTag[]
pub fn industry_tags_of(body: &str) -> Vec<&'static str> {
    INDUSTRY_TAGS
        .into_iter()
        .filter(|tag| {
            if *tag == "AI" {
                body.match_indices("AI").any(|(i, _)| {
                    !body[..i]
                        .chars()
                        .next_back()
                        .is_some_and(|c| c.is_ascii_alphabetic())
                        && !body[i + 2..]
                            .chars()
                            .next()
                            .is_some_and(|c| c.is_ascii_alphabetic())
                })
            } else {
                body.contains(tag)
            }
        })
        .collect()
}
/// TS: function contiguous(ranges: Array<[number, number]>): [number, number] | null
pub fn contiguous(ranges: &[(f64, f64)]) -> Option<(f64, f64)> {
    let mut sorted = ranges.to_vec();
    sorted.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    let &(lo, mut hi) = sorted.first()?;
    for &(a, b) in &sorted[1..] {
        if a > hi + 1.0 {
            return None;
        }
        hi = hi.max(b);
    }
    Some((lo, hi))
}
fn ranges_value(v: &Value) -> Vec<(f64, f64)> {
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|r| {
                    Some((
                        r.get(0)?.as_f64()?,
                        r.get(1)?.as_f64().unwrap_or(f64::INFINITY),
                    ))
                })
                .collect()
        })
        .unwrap_or_default()
}
fn number(n: f64) -> Value {
    if n == f64::INFINITY {
        json!({"$num":"Infinity"})
    } else if n == f64::NEG_INFINITY {
        json!({"$num":"-Infinity"})
    } else if n.is_nan() {
        json!({"$num":"NaN"})
    } else if n.fract() == 0.0 && n >= i64::MIN as f64 && n < i64::MAX as f64 {
        json!(n as i64)
    } else {
        json!(n)
    }
}
fn conditions_of(item: &Value) -> Value {
    let age = text(item.get("biz_trgt_age"));
    let ranges = parse_age_ranges(age.as_deref());
    let span = match ranges {
        Some(AgeRanges::Open) => Some((0.0, f64::INFINITY)),
        Some(AgeRanges::Ranges(ranges)) => contiguous(&ranges),
        None => None,
    };
    let mut c = Map::new();
    if let Some((lo, hi)) = span {
        if lo <= 0.0 && !hi.is_finite() {
            c.insert("ageAny".into(), json!(true));
        } else {
            if lo > 0.0 {
                c.insert("ageMin".into(), number(lo));
            }
            if hi.is_finite() {
                c.insert("ageMax".into(), number(hi));
            }
        }
    }
    if let Some(b) = enyy_of(item.get("biz_enyy").and_then(Value::as_str)).1 {
        c.insert("business".into(), json!(b));
    }
    if c.is_empty() {
        Value::Null
    } else {
        Value::Object(c)
    }
}
fn procedure_of(item: &Value) -> Option<String> {
    let mut parts = Vec::new();
    for (label, key) in [
        ("온라인 접수", "aply_mthd_onli_rcpt_istc"),
        ("이메일 접수", "aply_mthd_eml_rcpt_istc"),
        ("방문 접수", "aply_mthd_vst_rcpt_istc"),
        ("우편 접수", "aply_mthd_pssr_rcpt_istc"),
        ("팩스 접수", "aply_mthd_fax_rcpt_istc"),
        ("기타", "aply_mthd_etc_istc"),
    ] {
        if let Some(t) = text(item.get(key)) {
            parts.push(format!("{label}: {}", clip(&t, 120)));
        }
    }
    if let Some(url) = text(item.get("biz_aply_url")) {
        parts.push(format!("신청 URL: {url}"));
    }
    (!parts.is_empty()).then(|| parts.join(" / "))
}
/// TS: function recruitStatusOf(item: Pick<KStartupItem, 'rcrt_prgs_yn' | 'pbanc_rcpt_end_dt'>, today: string): RecruitStatus
pub fn recruit_status_of(item: &Value, today: &str) -> &'static str {
    let end = to_iso(item.get("pbanc_rcpt_end_dt").and_then(Value::as_str));
    let flag = text(item.get("rcrt_prgs_yn")).map(|s| s.to_uppercase());
    if flag.as_deref() == Some("N") || end.as_deref().is_some_and(|s| s < today) {
        "closed"
    } else if flag.as_deref() == Some("Y") && end.is_some() {
        "open"
    } else {
        "unknown"
    }
}
/// 공고 하나를 Resource 로. TS: function kstartupToResource(item: KStartupItem, now: Date): Resource | null
pub fn kstartup_to_resource(item: &Value, now: i64) -> Value {
    let Some(sn) = text(item.get("pbanc_sn")) else {
        return Value::Null;
    };
    let Some(title) = text(item.get("biz_pbanc_nm")) else {
        return Value::Null;
    };
    let region = text(item.get("supt_regin"));
    let regions = regions_of(region.as_deref());
    if regions.is_empty() {
        return Value::Null;
    }
    let today = kst_date(now);
    let detail = text(item.get("pbanc_ctnt"));
    let body = text(item.get("support_ctnt")).or_else(|| detail.clone());
    let url = text(item.get("detl_pg_url"))
        .filter(|s| s.starts_with("https://") || s.starts_with("http://"));
    let category = text(item.get("supt_biz_clsfc"));
    let caps = capabilities_of(category.as_deref());
    let cap_strings: Vec<String> = caps.iter().map(|s| (*s).to_owned()).collect();
    let target = text(item.get("aply_trgt_ctnt")).or_else(|| text(item.get("aply_trgt")));
    let industries = industry_tags_of(&format!(
        "{} {} {}",
        title,
        detail.as_deref().unwrap_or(""),
        body.as_deref().unwrap_or("")
    ));
    json!({"id":format!("ks-{sn}"),"type":type_of_capabilities(&cap_strings),"title":title,"agency":text(item.get("pbanc_ntrp_nm")).or_else(|| text(item.get("sprv_inst"))).unwrap_or_default(),"url":url,"target":target.map(|s| clip(&s,200)),"stages":enyy_of(item.get("biz_enyy").and_then(Value::as_str)).0,"content":body.as_deref().map(|s| clip(s,400)).unwrap_or_default(),"procedure":procedure_of(item),"prep":null,"regions":regions,"affiliationLimit":null,"costPeriod":null,"recruitStatus":recruit_status_of(item,&today),"endDate":to_iso(item.get("pbanc_rcpt_end_dt").and_then(Value::as_str)),"startDate":to_iso(item.get("pbanc_rcpt_bgng_dt").and_then(Value::as_str)),"checkedAt":today,"sourceExcerpt":detail.as_deref().or(body.as_deref()).map(|s| clip(s,120)),"industryTags":industries,"capabilityTags":caps,"contextIds":[],"conditions":conditions_of(item),"test":false})
}
/// 팀 검수 자료와 실제 공고를 합친다. TS: function mergeResources(team: readonly Resource[], real: readonly Resource[]): Resource[]
pub fn merge_resources(team: &[Value], real: &[Value]) -> Vec<Value> {
    let mut out: Vec<Value> = team
        .iter()
        .filter(|r| real.is_empty() || r.get("type").and_then(Value::as_str) != Some("지원사업"))
        .cloned()
        .collect();
    out.extend(real.iter().map(|r| {
        let mut r = r.clone();
        if r.get("id")
            .and_then(Value::as_str)
            .is_some_and(|s| s.starts_with("ks-"))
        {
            let tags = r
                .get("capabilityTags")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(Value::as_str)
                        .map(str::to_owned)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            if let Some(obj) = r.as_object_mut() {
                obj.insert("type".into(), json!(type_of_capabilities(&tags)));
            }
        }
        r
    }));
    out
}
/// TS: function activeResources(list: readonly Resource[], now: Date): Resource[]
pub fn active_resources(list: &[Value], now: i64) -> Vec<Value> {
    let today = kst_date(now);
    list.iter()
        .filter(|r| {
            r.get("recruitStatus").and_then(Value::as_str) != Some("closed")
                && !r
                    .get("endDate")
                    .and_then(Value::as_str)
                    .is_some_and(|s| s < today.as_str())
        })
        .cloned()
        .collect()
}
fn date_arg(v: &Value) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(v.get("$date")?.as_str()?)
        .ok()
        .map(|d| d.timestamp_millis())
}
/// 함수 골든 (golden.rs 참고).
pub fn golden(f: &str, args: &[Value]) -> Option<Value> {
    let a = args.first()?;
    Some(match f {
        "regionsOf" => json!(regions_of(a.as_str())),
        "enyyOf" => {
            let (stages, business) = enyy_of(a.as_str());
            json!({"stages":stages,"business":business.map(|s| json!(s)).unwrap_or(json!({"$undef":true}))})
        }
        "capabilitiesOf" => json!(capabilities_of(a.as_str())),
        "typeOfCapabilities" => json!(type_of_capabilities(
            &a.as_array()?
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect::<Vec<_>>()
        )),
        "industryTagsOf" => json!(industry_tags_of(a.as_str()?)),
        "contiguous" => match contiguous(&ranges_value(a)) {
            Some((a, b)) => json!([number(a), number(b)]),
            None => Value::Null,
        },
        "recruitStatusOf" => json!(recruit_status_of(a, args.get(1)?.as_str()?)),
        "kstartupToResource" => kstartup_to_resource(a, date_arg(args.get(1)?)?),
        "mergeResources" => json!(merge_resources(a.as_array()?, args.get(1)?.as_array()?)),
        "activeResources" => json!(active_resources(a.as_array()?, date_arg(args.get(1)?)?)),
        _ => return None,
    })
}
