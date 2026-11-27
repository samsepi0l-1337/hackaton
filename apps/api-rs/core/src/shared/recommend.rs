//! TS 원본: packages/shared/src/recommend.ts
use super::{
    constants::CATEGORY_TO_NEEDS,
    date::{d_day, d_day_label},
    eligibility::judge,
    query::to_card,
};
use serde_json::{json, Value};
fn text<'a>(v: &'a Value, k: &str) -> &'a str {
    v[k].as_str().unwrap_or("")
}
fn arr(v: &Value) -> &[Value] {
    v.as_array().map(Vec::as_slice).unwrap_or(&[])
}
fn date_arg(v: &Value) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(v.get("$date")?.as_str()?)
        .ok()
        .map(|d| d.timestamp_millis())
}
fn words(s: &str) -> Vec<String> {
    s.to_lowercase()
        .split(|c: char| {
            !(c.is_ascii_digit() || c.is_ascii_lowercase() || ('가'..='힣').contains(&c))
        })
        .filter(|s| s.chars().count() >= 2)
        .map(str::to_owned)
        .collect()
}
fn end(p: &Value) -> &str {
    p["endDate"].as_str().unwrap_or("9999")
}
fn cmp_program(a: &Value, b: &Value) -> std::cmp::Ordering {
    end(a)
        .cmp(end(b))
        .then_with(|| text(a, "id").cmp(text(b, "id")))
}
fn limit_slice<T>(v: Vec<T>, limit: i64) -> Vec<T> {
    let len = v.len();
    let n = if limit < 0 {
        len.saturating_sub(limit.unsigned_abs() as usize)
    } else {
        (limit as usize).min(len)
    };
    v.into_iter().take(n).collect()
}
fn excluded(ids: &Value, id: &Value) -> bool {
    arr(if ids.get("$set").is_some() {
        &ids["$set"]
    } else {
        ids
    })
    .contains(id)
}
/// TS: function relevanceKeywords(p: Program, profile: ConsultProfile, summary?: IdeaSummary | null): string[]
pub fn relevance_keywords(p: &Value, profile: &Value, summary: &Value) -> Vec<String> {
    let mine = words(&format!(
        "{} {} {} {}",
        text(profile, "idea"),
        text(profile, "problem"),
        text(profile, "customerDesc"),
        text(summary, "solution")
    ));
    let mut hay: Vec<String> = arr(&p["tags"])
        .iter()
        .filter_map(Value::as_str)
        .map(str::to_lowercase)
        .collect();
    hay.extend(words(&format!(
        "{} {}",
        text(p, "title"),
        text(p, "content")
    )));
    let mut result = vec![];
    for w in hay {
        if mine.contains(&w) && !result.contains(&w) {
            result.push(w);
        }
    }
    result
}
/// TS: function scoreProgram(p: Program, profile: ConsultProfile, now: Date, verdict: string, summary?: IdeaSummary | null, aiRelevance?: number): ScoreParts
pub fn score_program(
    p: &Value,
    profile: &Value,
    now: i64,
    verdict: &str,
    summary: &Value,
    ai: Option<f64>,
) -> Value {
    let keywords = relevance_keywords(p, profile, summary);
    let relevance = ai
        .filter(|n| n.is_finite())
        .map(|n| (n.clamp(0.0, 1.0) * 40.0).round() as i64)
        .unwrap_or((keywords.len() as i64 * 10).min(40));
    let industry = if !text(profile, "industry").is_empty()
        && arr(&p["tags"]).contains(&profile["industry"])
    {
        15
    } else {
        0
    };
    let offered = CATEGORY_TO_NEEDS
        .iter()
        .find(|(c, _)| *c == text(p, "category"))
        .map(|(_, n)| *n)
        .unwrap_or(&[]);
    let needs: Vec<_> = arr(&profile["needs"])
        .iter()
        .filter(|n| n.as_str().is_some_and(|s| offered.contains(&s)))
        .cloned()
        .collect();
    let need = if needs.is_empty() { 0 } else { 20 };
    let due = if d_day(p["endDate"].as_str(), now).is_some_and(|n| (0.0..=7.0).contains(&n)) {
        10
    } else {
        0
    };
    let penalty = if verdict == "check" { -15 } else { 0 };
    json!({"relevance":relevance,"industry":industry,"need":need,"due":due,"penalty":penalty,"matchedNeeds":needs,"keywords":keywords})
}
fn join(v: &Value, n: usize) -> String {
    arr(v)
        .iter()
        .take(n)
        .filter_map(Value::as_str)
        .collect::<Vec<_>>()
        .join(", ")
}
/// TS: function ruleReason(p: Program, parts: ScoreParts, profile: ConsultProfile): string
pub fn rule_reason(p: &Value, parts: &Value, profile: &Value) -> String {
    let mut bits = vec![];
    if !arr(&parts["matchedNeeds"]).is_empty() {
        bits.push(format!(
            "필요한 지원({})과 지원 분야 '{}'가 맞아요",
            join(&parts["matchedNeeds"], usize::MAX),
            text(p, "category")
        ));
    }
    if parts["industry"].as_i64().unwrap_or(0) != 0 {
        bits.push(format!(
            "업종 '{}' 관련 공고예요",
            text(profile, "industry")
        ));
    }
    if !arr(&parts["keywords"]).is_empty() {
        bits.push(format!(
            "아이디어의 '{}'와 공고 내용이 겹쳐요",
            join(&parts["keywords"], 2)
        ));
    }
    if parts["due"].as_i64().unwrap_or(0) != 0 {
        bits.push("마감이 가까워 먼저 확인하면 좋아요".into());
    }
    if bits.is_empty() {
        bits.push(
            format!(
                "{} 대상 '{}' 공고로 지금 신청할 수 있어요",
                text(p, "region"),
                text(p, "category")
            )
            .trim()
            .to_owned(),
        );
    }
    format!(
        "{}.",
        bits.into_iter().take(2).collect::<Vec<_>>().join(". ")
    )
}
/// TS: function recommend(input: RecommendInput): Recommendation[]
pub fn recommend(input: &Value, now: i64) -> Vec<Value> {
    let profile = &input["profile"];
    let mut rows = vec![];
    for p in arr(&input["programs"]) {
        if excluded(&input["excludeIds"], &p["id"]) {
            continue;
        }
        let e = judge(p, profile, now);
        if e["verdict"] == "ineligible" {
            continue;
        }
        let id = text(p, "id");
        let parts = score_program(
            p,
            profile,
            now,
            text(&e, "verdict"),
            &input["summary"],
            input["relevance"][id].as_f64(),
        );
        let score = ["relevance", "industry", "need", "due", "penalty"]
            .iter()
            .map(|k| parts[*k].as_i64().unwrap_or(0))
            .sum::<i64>();
        rows.push((p, e, parts, score));
    }
    rows.sort_by(|a, b| b.3.cmp(&a.3).then_with(|| cmp_program(a.0, b.0)));
    let rows = limit_slice(rows, input["limit"].as_i64().unwrap_or(3));
    rows.into_iter().map(|(p,e,parts,score)| {let card=to_card(p,now,&Value::Null); json!({"program":p,"dDay":card["dDay"],"eligibility":e,"score":score,"reason":rule_reason(p,&parts,profile),"feedback":input["feedback"][text(p,"id")]})}).collect()
}
fn agency_score(a: &Value, p: &Value) -> i32 {
    let district = !text(p, "district").is_empty() && arr(&a["districts"]).contains(&p["district"]);
    let affiliation = !text(p, "affiliation").is_empty()
        && arr(&a["forAffiliations"]).contains(&p["affiliation"]);
    2 * i32::from(district)
        + 2 * i32::from(affiliation)
        + i32::from(arr(&a["districts"]).is_empty())
        - 3 * i32::from(!arr(&a["forAffiliations"]).is_empty() && !affiliation)
}
/// TS: function pickAgencies(agencies: Agency[], profile: ConsultProfile, limit = 3): Agency[]
pub fn pick_agencies(agencies: &[Value], profile: &Value, limit: i64) -> Vec<Value> {
    let mut a = agencies.to_vec();
    a.sort_by(|x, y| {
        agency_score(y, profile)
            .cmp(&agency_score(x, profile))
            .then_with(|| text(x, "id").cmp(text(y, "id")))
    });
    limit_slice(a, limit)
}
/// TS: function buildPlan(top: Recommendation[], now: Date): PlanItem[]
pub fn build_plan(top: &[Value], now: i64) -> Vec<Value> {
    let first = top.iter().min_by(|a, b| {
        a["dDay"]
            .as_f64()
            .unwrap_or(1e9)
            .total_cmp(&b["dDay"].as_f64().unwrap_or(1e9))
    });
    let mut out = vec![];
    if let Some(r) = first {
        let p = &r["program"];
        out.push(json!({"day":1,"task":format!("'{}' 공고 원문 읽고 신청 자격·서류 확인 ({})",text(p,"title"),d_day_label(d_day(p["endDate"].as_str(),now))),"programId":p["id"],"done":false}));
    } else {
        out.push(
            json!({"day":1,"task":"공고 모음에서 조건 맞는 공고 3개 골라 원문 읽기","done":false}),
        );
    }
    for (i, task) in [
        "아이디어 1장 요약을 지원서 문장으로 다듬기",
        "타겟 고객 5명에게 문제 인터뷰하기",
        "인터뷰 결과로 해결책·수익 구조 수정하기",
        "찾아갈 기관 1곳에 상담 예약하기",
        "지원서 초안 만들고 팀원·지인에게 피드백 받기",
        "지원서 최종 확인 후 제출하기",
    ]
    .iter()
    .enumerate()
    {
        out.push(json!({"day":i+2,"task":task,"done":false}));
    }
    out
}
/// TS: function relevanceCandidates(programs: Program[], profile: ConsultProfile, now: Date, excludeIds?: Iterable<string>, max = 26): Program[]
pub fn relevance_candidates(
    programs: &[Value],
    profile: &Value,
    now: i64,
    ids: &Value,
    max: i64,
) -> Vec<Value> {
    let mut v: Vec<_> = programs
        .iter()
        .filter(|p| !excluded(ids, &p["id"]) && judge(p, profile, now)["verdict"] != "ineligible")
        .cloned()
        .collect();
    v.sort_by(cmp_program);
    limit_slice(v, max)
}
/// 함수 골든.
pub fn golden(f: &str, args: &[Value]) -> Option<Value> {
    let a = args.first()?;
    let null = Value::Null;
    match f {
        "relevanceKeywords" => Some(json!(relevance_keywords(
            a,
            args.get(1)?,
            args.get(2).unwrap_or(&null)
        ))),
        "scoreProgram" => Some(score_program(
            a,
            args.get(1)?,
            date_arg(args.get(2)?)?,
            args.get(3)?.as_str()?,
            args.get(4).unwrap_or(&null),
            args.get(5).and_then(Value::as_f64),
        )),
        "ruleReason" => Some(json!(rule_reason(a, args.get(1)?, args.get(2)?))),
        "recommend" => Some(json!(recommend(a, date_arg(&a["now"])?))),
        "pickAgencies" => Some(json!(pick_agencies(
            a.as_array()?,
            args.get(1)?,
            args.get(2).and_then(Value::as_i64).unwrap_or(3)
        ))),
        "buildPlan" => Some(json!(build_plan(a.as_array()?, date_arg(args.get(1)?)?))),
        "relevanceCandidates" => Some(json!(relevance_candidates(
            a.as_array()?,
            args.get(1)?,
            date_arg(args.get(2)?)?,
            args.get(3).unwrap_or(&null),
            args.get(4).and_then(Value::as_i64).unwrap_or(26)
        ))),
        _ => None,
    }
}
