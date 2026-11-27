//! TS 원본: packages/shared/src/explore-rules.ts
use super::{
    constants::BUSAN_DISTRICTS,
    data,
    explore::{IDEA_MAX_V2, INDUSTRY_TAGS, REVIEW_REGIONS},
};
use serde_json::{json, Value};

/// TS: `UNDECIDED_TEXT`.
pub const UNDECIDED_TEXT: &str = "미정";
/// TS: `PROBLEMS_EMPTY_REASON`.
pub const PROBLEMS_EMPTY_REASON: &str =
    "현재 확인된 문제 자료가 없습니다. 직접 입력하거나 탐색을 보류하고 진행할 수 있어요.";
/// TS: `industriesOf(interests: readonly string[] | undefined): IndustryTag[]`.
pub fn industries_of(interests: &[Value]) -> Vec<Value> {
    interests
        .iter()
        .filter(|v| v.as_str().is_some_and(|s| INDUSTRY_TAGS.contains(&s)))
        .cloned()
        .collect()
}
fn real_region(region: Option<&str>) -> Option<&str> {
    region.filter(|r| *r != "미정" && REVIEW_REGIONS.contains(r))
}
/// TS: `validateStart(s: Partial<StartProfile>): StartError[]`.
pub fn validate_start(s: &Value) -> Vec<Value> {
    let idea = crate::jsstr::js_trim(s["idea"].as_str().unwrap_or(""));
    let has_interest = s["interests"].as_array().is_some_and(|a| !a.is_empty())
        || !crate::jsstr::js_trim(s["interestNote"].as_str().unwrap_or("")).is_empty();
    let readiness = s["readiness"].as_str().unwrap_or("");
    let mut errors = Vec::new();
    if readiness.is_empty() {
        errors.push(json!({"field":"readiness","message":"지금 상태를 골라 주세요"}));
        return errors;
    }
    if crate::jsstr::len16(idea) > IDEA_MAX_V2 {
        errors.push(json!({"field":"idea","message":format!("해보고 싶은 일은 {IDEA_MAX_V2}자 이내로 적어 주세요")}));
    }
    if readiness == "no_idea" {
        if !has_interest {
            errors.push(
                json!({"field":"interests","message":"관심 분야나 경험을 하나 이상 골라 주세요"}),
            );
        }
    } else if idea.is_empty() && !has_interest {
        errors.push(
            json!({"field":"idea","message":"해보고 싶은 일을 적거나 관심 분야를 골라 주세요"}),
        );
    }
    errors
}
/// TS: `regionFits(cardRegion: string, region: string | null | undefined): boolean`.
pub fn region_fits(card_region: &str, region: Option<&str>) -> bool {
    real_region(region).is_none_or(|r| card_region == "부울경" || card_region == r)
}
/// TS: `problemsFor(interests: readonly string[] | undefined, region?: string | null, problems: ProblemCard[] = PROBLEMS)`.
pub fn problems_for(interests: &[Value], region: Option<&str>, problems: &[Value]) -> Value {
    let tags = industries_of(interests);
    let items: Vec<_> = problems
        .iter()
        .filter(|p| {
            !tags.is_empty()
                && p["industryTags"]
                    .as_array()
                    .is_some_and(|ts| ts.iter().any(|t| tags.contains(t)))
                && region_fits(p["region"].as_str().unwrap_or(""), region)
        })
        .take(3)
        .cloned()
        .collect();
    let reason = if items.is_empty() {
        Some(PROBLEMS_EMPTY_REASON)
    } else {
        None
    };
    json!({"items": items, "emptyReason": reason})
}
/// TS: `regionOfText(s: string | undefined | null): ReviewRegion | null`.
pub fn region_of_text(s: Option<&str>) -> Option<&'static str> {
    let t = crate::jsstr::js_trim(s.unwrap_or(""));
    if t.contains("울산") {
        Some("울산")
    } else if [
        "경남",
        "경상남도",
        "창원",
        "김해",
        "양산",
        "진주",
        "거제",
        "통영",
    ]
    .iter()
    .any(|x| t.contains(x))
    {
        Some("경남")
    } else if t.contains("부산") || BUSAN_DISTRICTS.contains(&t) {
        Some("부산")
    } else {
        None
    }
}
/// TS: `directionCaps(direction: string | null | undefined): string[]`.
pub fn direction_caps(direction: Option<&str>) -> Vec<&'static str> {
    let d = direction.unwrap_or("");
    let mut out = Vec::new();
    if ["시제품", "제작", "만들"].iter().any(|s| d.contains(s)) {
        out.extend(["시제품", "공간"]);
    }
    if ["배우", "교육", "공부", "익히"]
        .iter()
        .any(|s| d.contains(s))
    {
        out.push("교육");
    }
    if ["상담", "조언", "물어", "점검"]
        .iter()
        .any(|s| d.contains(s))
    {
        out.push("상담");
    }
    out
}
/// TS: `item(text: string | null | undefined, provenance: SummaryItem['provenance'] = 'user'): SummaryItem`.
pub fn item(text: Option<&str>, provenance: &str) -> Value {
    let t = crate::jsstr::js_trim(text.unwrap_or(""));
    if t.is_empty() {
        json!({"text":UNDECIDED_TEXT,"provenance":"unknown"})
    } else {
        json!({"text":t,"provenance":provenance})
    }
}
/// TS: `problemOf(id: string | null | undefined, problems: ProblemCard[] = PROBLEMS)`.
pub fn problem_of(id: Option<&str>, problems: &[Value]) -> Option<Value> {
    let id = id.filter(|s| !s.is_empty())?;
    problems
        .iter()
        .find(|p| p["id"].as_str() == Some(id))
        .cloned()
}
/// 함수 골든 (golden.rs 참고).
pub fn golden(f: &str, args: &[Value]) -> Option<Value> {
    let arg = |i: usize| args.get(i).unwrap_or(&Value::Null);
    let strings = |i: usize| arg(i).as_array().cloned().unwrap_or_default();
    let mut input = arg(0).clone();
    if let Some(o) = input.as_object_mut() {
        for (key, data) in [
            ("problems", fixture_problems()),
            ("resources", fixture_resources()),
            ("contexts", fixture_contexts()),
        ] {
            if !o.get(key).is_some_and(Value::is_array) {
                o.insert(key.to_owned(), json!(data));
            }
        }
    }
    Some(match f {
        "validateStart" => json!(validate_start(arg(0))),
        "industriesOf" => json!(industries_of(&strings(0))),
        "regionFits" => json!(region_fits(arg(0).as_str().unwrap_or(""), arg(1).as_str())),
        "regionOfText" => json!(region_of_text(arg(0).as_str())),
        "directionCaps" => json!(direction_caps(arg(0).as_str())),
        "item" => item(arg(0).as_str(), arg(1).as_str().unwrap_or("user")),
        "problemOf" => problem_of(
            arg(0).as_str(),
            &arg(1).as_array().cloned().unwrap_or_else(fixture_problems),
        )
        .unwrap_or_else(|| json!({"$undef":true})),
        "problemsFor" => problems_for(
            &strings(0),
            arg(1).as_str(),
            &arg(2).as_array().cloned().unwrap_or_else(fixture_problems),
        ),
        "mergeConditions" => merge_conditions(arg(0), arg(1)),
        "checkConditions" => check_conditions(arg(0), arg(1), date_ms(arg(2))),
        "decideCandidates" => json!(decide_candidates(&input)),
        "recommendResources" => recommend_resources(&input),
        "buildPrep" => build_prep(
            arg(0).as_str(),
            arg(1),
            arg(2),
            &strings(3),
            &arg(4).as_array().cloned().unwrap_or_else(fixture_problems),
        ),
        "buildSummary" => build_summary(&input),
        "buildRegional" => build_regional(&input),
        "coverageByRegion" => coverage_by_region(
            &arg(0).as_array().cloned().unwrap_or_else(fixture_problems),
            &arg(1).as_array().cloned().unwrap_or_else(fixture_resources),
            &arg(2).as_array().cloned().unwrap_or_else(fixture_contexts),
        ),
        "coverageNote" => json!(coverage_note(
            arg(0).as_str(),
            &arg(1).as_array().cloned().unwrap_or_else(fixture_problems),
            &arg(2).as_array().cloned().unwrap_or_else(fixture_resources),
            &arg(3).as_array().cloned().unwrap_or_else(fixture_contexts)
        )),
        "buildFieldQuestions" => json!(build_field_questions(arg(0), arg(1), arg(2), &strings(3))),
        "applySummaryEdit" => apply_summary_edit(arg(0), arg(1)),
        "decideChoiceText" => json!(decide_choice_text(arg(0))),
        "reasonFor" => json!(reason_for(
            arg(0),
            arg(1).as_str(),
            arg(2).as_bool().unwrap_or(false)
        )),
        _ => return None,
    })
}

fn s<'a>(v: &'a Value, k: &str) -> &'a str {
    v.get(k).and_then(Value::as_str).unwrap_or("")
}
fn arr<'a>(v: &'a Value, k: &str) -> &'a [Value] {
    v.get(k)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}
fn text(v: &Value) -> &str {
    v.as_str().unwrap_or("")
}
fn present(v: &Value) -> bool {
    !v.is_null() && v.get("$undef").is_none()
}
fn default_array(v: &Value, field: &str, default: fn() -> Vec<Value>) -> Vec<Value> {
    v.get(field)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_else(default)
}
fn date_ms(now: &Value) -> i64 {
    now.get("$date")
        .and_then(Value::as_str)
        .and_then(crate::jsstr::parse_ms)
        .or_else(|| now.as_i64())
        .unwrap_or(0)
}
fn check(key: &str, label: &str, status: &str, detail: String) -> Value {
    json!({"key":key,"label":label,"status":status,"detail":detail})
}
/// TS: `mergeConditions(session: UserConditions | undefined, profile: UserConditions | undefined): UserConditions | undefined`.
pub fn merge_conditions(session: &Value, profile: &Value) -> Value {
    if !present(session) {
        return profile.clone();
    }
    if !present(profile) {
        return session.clone();
    }
    let mut out = profile.clone();
    if let Some(o) = out.as_object_mut() {
        for k in ["age", "residence", "affiliation", "hasBusiness"] {
            if let Some(v) = session.get(k) {
                if v != "unknown" && v != "" && v.get("$undef").is_none() {
                    o.insert(k.to_string(), v.clone());
                }
            }
        }
    }
    out
}
fn copula(w: &str) -> &'static str {
    let c = w.chars().last().unwrap_or('\0') as u32;
    if (0xac00..=0xd7a3).contains(&c) && (c - 0xac00) % 28 != 0 {
        "이에요"
    } else {
        "예요"
    }
}
fn region_check(r: &Value, user: Option<&str>) -> Value {
    let regions = arr(r, "regions");
    if regions.iter().any(|x| x == "전국") {
        return check(
            "residence",
            "거주지",
            "match",
            user.filter(|x| !x.is_empty())
                .map_or("전국 대상이에요".to_string(), |u| {
                    format!("전국 대상이에요 (입력한 거주지 {u})")
                }),
        );
    }
    let area = regions.iter().map(text).collect::<Vec<_>>().join("·");
    if area.is_empty() {
        return check(
            "residence",
            "거주지",
            "check",
            "원문의 거주 조건을 확인하지 못했어요".into(),
        );
    }
    let Some(u) = user.filter(|u| !u.is_empty()) else {
        return check(
            "residence",
            "거주지",
            "check",
            format!(
                "지원 지역은 {area}{}. 거주지를 입력하지 않아 비교하지 못했어요",
                copula(&area)
            ),
        );
    };
    let have = region_of_text(Some(u));
    if have.is_some()
        && regions
            .iter()
            .any(|x| x == have.unwrap_or("") || x == "부울경")
    {
        check("residence","거주지","match",format!("입력한 거주지({u})가 지원 지역({area})에 속해요. 사업장 소재지 조건은 공식 안내로 확인해 주세요"))
    } else {
        check("residence","거주지","check",format!("지원 지역({area})과 입력한 거주지({u})가 달라요. 사업장 소재지 기준인지 공식 안내로 확인해 주세요"))
    }
}
/// TS: `checkConditions(r: Resource, user: UserConditions | undefined, now: Date): ConditionResult`.
pub fn check_conditions(r: &Value, u: &Value, now: i64) -> Value {
    let c = &r["conditions"];
    let mut checks = Vec::new();
    let mut notes: Vec<&str> = Vec::new();
    let age = u["age"].as_f64();
    let age_s = crate::jsstr::js_value_string(&u["age"]);
    let min = c["ageMin"].as_f64();
    let max = c["ageMax"].as_f64();
    let bound = |k: &str| {
        if c[k].is_null() {
            String::new()
        } else {
            crate::jsstr::js_value_string(&c[k])
        }
    };
    let (status, detail) = if c["ageAny"] == true {
        (
            "match",
            if age.is_none() {
                "나이 제한이 없다고 명시돼 있어요".into()
            } else {
                format!("나이 제한이 없다고 명시돼 있어요 (입력한 나이 {age_s}세)")
            },
        )
    } else if c.get("ageMin").is_none() && c.get("ageMax").is_none() {
        (
            "check",
            if age.is_none() {
                "원문의 나이 조건을 확인하지 못했어요".into()
            } else {
                format!("입력한 나이는 {age_s}세예요. 원문에 나이 조건이 없어 공식 안내로 확인해 주세요")
            },
        )
    } else if age.is_none() {
        ("check", "나이를 입력하지 않아 비교하지 못했어요".into())
    } else if min.is_some_and(|x| age.unwrap_or(0.0) < x)
        || max.is_some_and(|x| age.unwrap_or(0.0) > x)
    {
        (
            "mismatch",
            format!(
                "입력한 나이 {age_s}세가 명시 조건({}~{}세)과 달라요",
                bound("ageMin"),
                bound("ageMax")
            ),
        )
    } else {
        (
            "match",
            format!(
                "입력한 나이 {age_s}세가 명시 조건({}~{}세) 범위예요",
                bound("ageMin"),
                bound("ageMax")
            ),
        )
    };
    checks.push(check("age", "나이", status, detail));
    let user = u["residence"].as_str().filter(|x| *x != "unknown");
    let need = s(c, "residence");
    if need.is_empty() {
        checks.push(region_check(r, user));
    } else if user.is_none_or(str::is_empty) {
        checks.push(check(
            "residence",
            "거주지",
            "check",
            "거주지를 입력하지 않아 비교하지 못했어요".into(),
        ));
    } else {
        let have = user.unwrap_or("");
        let nr = region_of_text(Some(need));
        let hr = region_of_text(Some(have));
        let (status, detail) = if need.contains("부울경")
            || nr.unwrap_or(need) == hr.unwrap_or(have)
            || have.contains(need)
            || need.contains(have)
        {
            if need.contains("부울경") && hr.is_none() {
                (
                    "check",
                    "입력한 거주지가 부울경에 속하는지 확인하지 못했어요".into(),
                )
            } else {
                (
                    "match",
                    format!("입력한 거주지({have})가 명시 조건({need})과 같아요"),
                )
            }
        } else if hr.is_some() && nr.is_some() {
            (
                "mismatch",
                format!("입력한 거주지({have})가 명시 조건({need})과 달라요"),
            )
        } else {
            ("check", "거주지 조건을 비교하지 못했어요".into())
        };
        checks.push(check("residence", "거주지", status, detail));
    }
    let biz = u["hasBusiness"].as_bool();
    let b = s(c, "business");
    let (status, detail) = if b.is_empty() {
        ("check",biz.map_or("원문의 사업자 조건을 확인하지 못했어요".into(),|b| format!("입력한 정보는 {}이에요. 원문에 사업자 조건이 없어 공식 안내로 확인해 주세요",if b {"사업자 있음"}else{"사업자 없음(예비창업자)"})))
    } else if b == "any" {
        ("match", "사업자 여부와 상관없다고 명시돼 있어요".into())
    } else if biz.is_none() {
        (
            "check",
            "사업자 여부를 입력하지 않아 비교하지 못했어요".into(),
        )
    } else if (b == "pre") == biz.unwrap_or(false) {
        (
            "mismatch",
            if b == "pre" {
                "예비창업자(사업자 없음) 대상이라고 명시돼 있어요"
            } else {
                "사업자 등록자 대상이라고 명시돼 있어요"
            }
            .into(),
        )
    } else {
        (
            "match",
            if b == "pre" {
                "예비창업자 대상 조건과 같아요"
            } else {
                "사업자 등록자 대상 조건과 같아요"
            }
            .into(),
        )
    };
    checks.push(check("business", "사업자 여부", status, detail));
    let today = super::date::kst_date(now);
    let end = s(r, "endDate");
    let recruit = s(r, "recruitStatus");
    let closed = recruit == "closed" || r["endDate"].as_str().is_some_and(|d| d < today.as_str());
    let (status, detail) = if recruit == "closed" {
        ("mismatch", "모집이 종료됐어요".into())
    } else if closed {
        ("mismatch", format!("마감일({end})이 지났어요"))
    } else if recruit == "open" {
        if !end.is_empty() {
            notes.push("정확한 종료 시각 확인 필요");
        }
        (
            "match",
            if end.is_empty() {
                "모집 중이에요".into()
            } else {
                format!("모집 중이고 마감일은 {end}예요")
            },
        )
    } else if recruit == "always" {
        ("match", "상시 안내로 명시돼 있어요".into())
    } else {
        if !end.is_empty() {
            notes.push("정확한 종료 시각 확인 필요");
        }
        ("check", "모집 상태를 확인하지 못했어요".into())
    };
    checks.push(check("period", "모집 기간", status, detail));
    let status = if checks.iter().any(|c| c["status"] == "mismatch") {
        "mismatch"
    } else if checks.iter().any(|c| c["status"] == "check") {
        "check"
    } else {
        "match"
    };
    json!({"status":status,"checks":checks,"closed":closed,"notes":notes})
}
/// TS: `decideChoiceText(r: Resource): string`.
pub fn decide_choice_text(r: &Value) -> String {
    let caps = arr(r, "capabilityTags")
        .iter()
        .map(text)
        .collect::<Vec<_>>()
        .join("·");
    let mut out = vec![format!("[{}] {}", s(r, "type"), s(r, "title"))];
    if !caps.is_empty() {
        out.push(format!("도움: {caps}"));
    }
    if !s(r, "target").is_empty() {
        out.push(format!("대상: {}", s(r, "target")));
    }
    if !s(r, "content").is_empty() {
        out.push(s(r, "content").into());
    }
    out.join(" / ")
}
/// TS: `reasonFor(r: Resource, readiness: ReadinessStage | undefined, linked: boolean): string`.
pub fn reason_for(r: &Value, readiness: Option<&str>, linked: bool) -> String {
    let goal = match readiness {
        Some("no_idea") => "관심 분야를 구체적인 문제로 좁히는 준비",
        Some("has_idea") => "생각해 둔 아이디어를 이용할 사람의 관점에서 확인하는 준비",
        Some("preparing") => "준비 중인 구상을 실제로 확인하고 다듬는 준비",
        None | Some("") => "구상을 정리하는 준비",
        _ => "undefined",
    };
    let caps = arr(r, "capabilityTags")
        .iter()
        .filter_map(|t| match text(t) {
            "교육" => Some("기초 지식을 익히는 교육"),
            "상담" => Some("방향을 점검하는 상담"),
            "공간" => Some("작업·시험 공간 이용"),
            "시제품" => Some("시제품을 만들어 보는 일"),
            "자금" => Some("자금 지원 안내"),
            _ => None,
        })
        .collect::<Vec<_>>();
    let help = if caps.is_empty() {
        "어떤 도움을 받을 수 있는지 공식 안내에서 확인해야 해요".into()
    } else {
        format!("{}을(를) 안내하는 경로로 보여요", caps.join("·"))
    };
    format!(
        "{}{goal}에 쓸 수 있어요. {help}. 실제 운영 범위와 대상은 공식 안내로 확인해 주세요.",
        if linked {
            "선택한 문제와 연결된 경로예요. "
        } else {
            ""
        }
    )
}

/// TS: `buildSummary(input: SummaryInput): SummaryV2`.
pub fn build_summary(input: &Value) -> Value {
    let start = &input["start"];
    let ex = &input["exploration"];
    let ai = &input["aiFill"];
    let problems = default_array(input, "problems", data::problems);
    let problem = problem_of(ex["problemId"].as_str(), &problems);
    let answer = |key: &str| {
        arr(input, "answers")
            .iter()
            .find(|a| {
                s(a, "key") == key
                    && s(a, "how") == "answered"
                    && !crate::jsstr::js_trim(s(a, "text")).is_empty()
            })
            .map(|a| crate::jsstr::js_trim(s(a, "text")))
    };
    let ai_or = |user: Option<&str>, ait: &str| {
        if let Some(u) = user.filter(|x| !x.is_empty()) {
            item(Some(u), "user")
        } else if !crate::jsstr::js_trim(ait).is_empty() {
            item(Some(ait), "ai")
        } else {
            item(None, "user")
        }
    };
    let mut words: Vec<&str> = arr(start, "interests")
        .iter()
        .map(text)
        .filter(|x| !super::explore::INTEREST_EXTRA.contains(x) && !x.is_empty())
        .collect();
    if !crate::jsstr::js_trim(s(start, "interestNote")).is_empty() {
        words.push(crate::jsstr::js_trim(s(start, "interestNote")));
    }
    let words = words.join(", ");
    let mut interest = Vec::new();
    if !crate::jsstr::js_trim(s(start, "idea")).is_empty() {
        interest.push(crate::jsstr::js_trim(s(start, "idea")).to_string());
    }
    if !words.is_empty() {
        interest.push(format!("관심: {words}"));
    }
    let target = ai_or(answer("target"), s(ai, "target"));
    let reason = [
        Some(crate::jsstr::js_trim(s(ex, "selectionReason"))).filter(|x| !x.is_empty()),
        answer("reason"),
        answer("trigger"),
    ]
    .into_iter()
    .flatten()
    .next();
    let picked = problem
        .as_ref()
        .map(|p| format!("선택한 문제: {}", s(p, "title")))
        .or_else(|| {
            if s(ex, "origin") == "custom" {
                ex["customProblem"].as_str().map(str::to_owned)
            } else {
                None
            }
        });
    let value = ai_or(answer("direction").or(picked.as_deref()), s(ai, "value"));
    let mut unknowns = Vec::new();
    if target["provenance"] != "user" {
        unknowns.push("도움을 주고 싶은 대상".to_string());
    }
    if value["provenance"] != "user" {
        unknowns.push("해결해보고 싶은 불편·제공할 가치".to_string());
    }
    if s(ex, "direction").is_empty() {
        unknowns.push("접근 방향".to_string());
    }
    if let Some(p) = &problem {
        unknowns.extend(arr(p, "unknowns").iter().map(|x| text(x).to_string()));
    }
    let unknowns = if unknowns.is_empty() {
        "표시된 미확인 사항이 없어요. 그래도 실제 이용자에게 확인해야 해요.".into()
    } else {
        unknowns.join(", ")
    };
    let prob = if let Some(p) = &problem {
        json!({"title":p["title"],"source":if p["sourceRef"].is_null(){&p["sourceType"]}else{&p["sourceRef"]},"evidenceLevel":p["evidenceLevel"]})
    } else if s(ex, "origin") == "custom"
        && !crate::jsstr::js_trim(s(ex, "customProblem")).is_empty()
    {
        json!({"title":crate::jsstr::js_trim(s(ex,"customProblem")),"source":null,"evidenceLevel":"사용자 작성·외부 검증 전"})
    } else {
        Value::Null
    };
    let d = crate::jsstr::js_trim(s(ex, "direction"));
    let ds = ex["directionStatus"].as_str().unwrap_or("hold");
    let direction = if d.is_empty() {
        json!({"text":"아직 탐색 중","provenance":"unknown","status":"hold"})
    } else {
        json!({"text":d,"provenance":if ds=="ai_suggested"{"ai"}else{"user"},"status":ds})
    };
    let hypo = if !crate::jsstr::js_trim(s(ai, "hypotheses")).is_empty() {
        item(Some(s(ai, "hypotheses")), "ai")
    } else if let Some(p) = &problem {
        item(Some(&format!("{}에게 \"{}\"가 지금도 있는지, 지금은 어떻게 해결하는지 직접 물어봐서 확인해야 해요.",s(p,"affectedUser"),s(p,"situation"))),"ai")
    } else {
        item(None, "user")
    };
    json!({"interest":item(Some(&interest.join(" / ")),"user"),"target":target,"value":value,"unknowns":{"text":unknowns,"provenance":"unknown"},"exploration":{"problem":prob,"reason":item(reason,"user"),"direction":direction,"hypotheses":hypo}})
}
/// TS: `applySummaryEdit(base: SummaryV2, edit: SummaryEdit): { summary: SummaryV2; changed: boolean }`.
pub fn apply_summary_edit(base: &Value, edit: &Value) -> Value {
    let mut changed = false;
    let mut upd = |cur: &Value, e: &Value| -> Value {
        let Some(t) = e.get("text").and_then(Value::as_str) else {
            return cur.clone();
        };
        if crate::jsstr::js_trim(t) == crate::jsstr::js_trim(s(cur, "text")) {
            return cur.clone();
        }
        changed = true;
        item(Some(t), "user")
    };
    let ex = &base["exploration"];
    let dir = upd(&ex["direction"], &edit["exploration"]["direction"]);
    let direction = if dir == ex["direction"] {
        dir
    } else if dir["provenance"] == "unknown" {
        json!({"text":"아직 탐색 중","provenance":"unknown","status":"hold"})
    } else {
        json!({"text":dir["text"],"provenance":dir["provenance"],"status":"user"})
    };
    let mut out = serde_json::Map::new();
    for k in ["interest", "target", "value", "unknowns"] {
        out.insert(k.into(), upd(&base[k], &edit[k]));
    }
    let mut exploration = ex.clone();
    if let Some(o) = exploration.as_object_mut() {
        o.insert(
            "reason".into(),
            upd(&ex["reason"], &edit["exploration"]["reason"]),
        );
        o.insert("direction".into(), direction);
        o.insert(
            "hypotheses".into(),
            upd(&ex["hypotheses"], &edit["exploration"]["hypotheses"]),
        );
    }
    out.insert("exploration".into(), exploration);
    json!({"summary":out,"changed":changed})
}

// 함수 골든은 TypeScript 테스트의 setup-fixtures.ts로 녹화되었다.
fn fixture_problems() -> Vec<Value> {
    serde_json::from_str(include_str!(
        "../../../../../packages/shared/test/fixtures/problems.json"
    ))
    .unwrap_or_default()
}
fn fixture_resources() -> Vec<Value> {
    serde_json::from_str(include_str!(
        "../../../../../packages/shared/test/fixtures/resources.json"
    ))
    .unwrap_or_default()
}
fn fixture_contexts() -> Vec<Value> {
    serde_json::from_str(include_str!(
        "../../../../../packages/shared/test/fixtures/contexts.json"
    ))
    .unwrap_or_default()
}
fn contains_region(r: &Value, region: &str) -> bool {
    arr(r, "regions")
        .iter()
        .any(|v| v == region || v == "부울경")
}
/// TS: `coverageByRegion(problems = PROBLEMS, resources = RESOURCES, contexts = CONTEXTS)`.
pub fn coverage_by_region(problems: &[Value], resources: &[Value], contexts: &[Value]) -> Value {
    let mut out = serde_json::Map::new();
    for region in ["부산", "울산", "경남"] {
        out.insert(region.into(),json!({"problems":problems.iter().filter(|p| s(p,"region")==region || s(p,"region")=="부울경").count(),"resources":resources.iter().filter(|r| contains_region(r,region)).count(),"contexts":contexts.iter().filter(|c| s(c,"region")==region || s(c,"region")=="부울경").count()}));
    }
    Value::Object(out)
}
/// TS: `coverageNote(reviewRegion?: string | null, problems = PROBLEMS, resources = RESOURCES, contexts = CONTEXTS): string`.
pub fn coverage_note(
    region: Option<&str>,
    problems: &[Value],
    resources: &[Value],
    contexts: &[Value],
) -> String {
    let cov = coverage_by_region(problems, resources, contexts);
    let mut have = Vec::new();
    let mut none = Vec::new();
    for r in ["부산", "울산", "경남"] {
        let c = &cov[r];
        let p = c["problems"].as_u64().unwrap_or(0);
        let rs = c["resources"].as_u64().unwrap_or(0);
        let cs = c["contexts"].as_u64().unwrap_or(0);
        if p + rs + cs > 0 {
            have.push(format!("{r}(문제 {p}·경로 {rs}·배경 {cs})"));
        } else {
            none.push(r);
        }
    }
    let mut parts = vec![format!(
        "현재 검수 자료가 있는 지역: {}.",
        if have.is_empty() {
            "없음".into()
        } else {
            have.join(", ")
        }
    )];
    if !none.is_empty() {
        parts.push(format!("{}은(는) 아직 자료가 없어요.", none.join("·")));
    }
    let n = resources
        .iter()
        .filter(|r| arr(r, "regions").iter().any(|x| x == "전국"))
        .count();
    if n > 0 {
        parts.push(format!("전국 대상 경로 {n}개도 있어요."));
    }
    if let Some(r) = real_region(region).filter(|r| none.contains(r)) {
        parts.push(format!(
            "검토 지역으로 고른 {r}은(는) 자료가 없어서 지역 안내는 확인이 필요해요."
        ));
    }
    if problems
        .iter()
        .chain(resources)
        .chain(contexts)
        .any(|v| v["test"] == true)
    {
        parts.push("일부 자료는 팀 검수 전 테스트 자료예요.".into());
    }
    parts.join(" ")
}
/// TS: `buildRegional(input: RegionalInput): { card: RegionalContextCard; contexts: RegionalContext[] } | null`.
pub fn build_regional(input: &Value) -> Value {
    let start = &input["start"];
    let Some(region) = real_region(start["reviewRegion"].as_str()) else {
        return Value::Null;
    };
    let problems = default_array(input, "problems", data::problems);
    let problem = problem_of(input["exploration"]["problemId"].as_str(), &problems);
    let mut industries = Vec::new();
    for t in industries_of(arr(start, "interests")) {
        if !industries.contains(&t) {
            industries.push(t);
        }
    }
    if let Some(p) = &problem {
        for t in arr(p, "industryTags") {
            if !industries.contains(t) {
                industries.push(t.clone());
            }
        }
    }
    let contexts: Vec<Value> = default_array(input, "contexts", data::contexts)
        .into_iter()
        .filter(|c| {
            region_fits(s(c, "region"), Some(region)) && industries.contains(&c["industry"])
        })
        .collect();
    let mut ids: Vec<Value> = Vec::new();
    for c in &contexts {
        if !ids.contains(&c["id"]) {
            ids.push(c["id"].clone());
        }
    }
    let resource_ids: Vec<Value> = default_array(input, "resources", data::resources)
        .into_iter()
        .filter(|r| {
            contains_region(r, region)
                && (arr(r, "contextIds").iter().any(|id| ids.contains(id))
                    || problem
                        .as_ref()
                        .is_some_and(|p| arr(p, "resourceIds").contains(&r["id"])))
                && check_conditions(r, &Value::Null, date_ms(&input["now"]))["closed"] == false
        })
        .map(|r| r["id"].clone())
        .collect();
    let verified = contexts
        .iter()
        .any(|c| c["test"] != true && !s(c, "url").is_empty() && !s(c, "checkedAt").is_empty());
    let status = if verified && !resource_ids.is_empty() {
        "has_basis"
    } else if industries.is_empty() {
        "weak"
    } else {
        "needs_check"
    };
    let want = if industries.is_empty() {
        "아직 고르지 않은 분야".into()
    } else {
        industries.iter().map(text).collect::<Vec<_>>().join("·")
    };
    let basis = if !contexts.is_empty() {
        format!("[확인된 배경] {} [내 관심과의 연결] {want}에 관심이 있어 {region}에서 살펴볼 수 있어요. 산업 배경은 창업 수요나 계약 가능성의 근거가 아니에요.{}",contexts.iter().map(|c|s(c,"background")).collect::<Vec<_>>().join(" "),if resource_ids.is_empty(){" 이용할 수 있는 지원 경로는 아직 확인하지 못했어요."}else{""})
    } else if industries.is_empty() {
        format!("{region}과 연결할 관심 분야가 아직 없어서 지역과의 연관성을 판단하기 어려워요. 구상은 바꾸지 않고 그대로 두었어요.")
    } else {
        format!("{region}의 {want} 분야에 대해 검수된 배경 자료가 아직 없어요. 지역 배경과 지원 경로는 확인이 필요해요.")
    };
    let hypo = if !crate::jsstr::js_trim(s(input, "aiHypothesis")).is_empty() {
        item(Some(s(input, "aiHypothesis")), "ai")
    } else if let Some(p) = &problem {
        item(
            Some(&format!(
                "{}가 {region}에서도 같은 어려움을 겪는지 직접 물어보고 확인해야 해요. (미검증)",
                s(p, "affectedUser")
            )),
            "ai",
        )
    } else {
        item(None, "user")
    };
    json!({"card":{"region":region,"basis":basis,"sourceIds":ids,"customerHypothesis":hypo,"resourceIds":resource_ids,"status":status},"contexts":contexts})
}
/// TS: `buildFieldQuestions(problem: ProblemCard | undefined | null, exploration: Exploration | null, summary: SummaryV2 | null, unknowns: readonly string[] = []): FieldQuestion[]`.
pub fn build_field_questions(
    problem: &Value,
    ex: &Value,
    summary: &Value,
    unknowns: &[Value],
) -> Vec<Value> {
    let who = problem
        .get("affectedUser")
        .and_then(Value::as_str)
        .unwrap_or("이용할 사람");
    let custom = if !present(problem) && s(ex, "origin") == "custom" {
        crate::jsstr::js_trim(s(ex, "customProblem"))
    } else {
        ""
    };
    let mut topic = if present(problem) {
        s(problem, "title")
    } else if !custom.is_empty() && crate::jsstr::len16(custom) <= 40 {
        custom
    } else {
        ""
    };
    if present(problem) && topic.starts_with('[') {
        if let Some(i) = topic.find(']') {
            topic = topic[i + 1..].trim_start_matches(crate::jsstr::is_js_ws);
        }
    }
    let h = &summary["exploration"]["hypotheses"];
    let hypo = if present(summary) && s(h, "provenance") != "unknown" {
        crate::jsstr::js_trim(s(h, "text"))
    } else {
        ""
    };
    let purpose = format!(
        "{who}의 현재 처리 방식을 먼저 확인해요.{}",
        if hypo.is_empty() {
            String::new()
        } else {
            format!(" 확인할 가설(미검증): {}", crate::jsstr::take16(hypo, 80))
        }
    );
    let mut list = vec![
        json!({"id":"fq-current","question":if topic.is_empty(){"이 업무는 현재 어떤 방식으로 처리하나요?".into()}else{format!("{topic} 업무는 현재 어떤 방식으로 처리하나요?")},"purpose":purpose,"source":"rule"}),
    ];
    let relevant = unknowns
        .iter()
        .map(text)
        .find(|u| ["서비스", "도구", "대안"].iter().any(|x| u.contains(x)));
    if let Some(u) = relevant {
        list.push(json!({"id":"fq-tools","question":"이 일에 지금 쓰는 도구나 서비스가 있다면 무엇이고, 어떻게 쓰나요?","purpose":format!("{who}가 이미 쓰는 방법이 있는지 확인해요. (미확인 사항: {u})"),"source":"rule"}));
    }
    list.push(json!({"id":"fq-time","question":"어느 단계에서 시간이 많이 드나요?","purpose":format!("{who}가 실제로 겪는 과정을 단계별로 듣고, 시간이 드는 단계가 정말 있는지 확인해요."),"source":"rule"}));
    list.push(json!({"id":"fq-conditions","question":"외부 서비스를 검토하기 전에 어떤 조건을 확인하나요?","purpose":format!("{who}가 새로운 방법을 검토할 때 보는 기준을 알아봐요. 이용 의향을 묻는 것이 아니에요."),"source":"rule"}));
    list.truncate(3);
    list
}

/// TS: `REGION_NOTHING`.
pub const REGION_NOTHING: &str = "조건에 맞는 검수된 경로가 아직 없어요. 아래 준비 안내를 먼저 해 보고, 공식 문의 경로를 확인해 보세요.";
/// TS: `RELEVANCE_MIN`.
pub const RELEVANCE_MIN: f64 = 0.2;
/// TS: `DECIDE_CANDIDATES_MAX`.
pub const DECIDE_CANDIDATES_MAX: usize = 26;
/// TS: `DECIDE_INSTRUCTIONS`.
pub const DECIDE_INSTRUCTIONS: &str = "이 사람이 지금 준비 단계에서 가장 먼저 이용하면 도움이 될 지원을 고르세요. 사용자가 원하는 도움의 종류와 하고 싶은 일에 맞는지를 보고, 나이·거주지·사업자 여부 조건에 맞지 않는 것은 고르지 마세요.";
fn similarity(r: &Value, p: &Value) -> f64 {
    super::likes::golden("likeSimilarity", &[r.clone(), p.clone()])
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0)
}
fn wanted(input: &Value) -> Vec<&str> {
    let mut caps = match s(input, "readiness") {
        "no_idea" => vec!["교육", "상담"],
        "has_idea" => vec!["상담", "교육"],
        "preparing" => vec!["시제품", "공간", "상담"],
        _ => vec![],
    };
    caps.extend(direction_caps(input["direction"].as_str()));
    caps
}
fn linked(r: &Value, input: &Value, problems: &[Value]) -> bool {
    problem_of(input["problemId"].as_str(), problems)
        .is_some_and(|p| arr(&p, "resourceIds").contains(&r["id"]))
}
fn cap_match(r: &Value, input: &Value) -> bool {
    let caps = wanted(input);
    arr(r, "capabilityTags")
        .iter()
        .any(|x| caps.contains(&text(x)))
}
fn region_match(r: &Value, input: &Value) -> bool {
    real_region(input["reviewRegion"].as_str()).is_some_and(|reg| contains_region(r, reg))
}
fn allowed(r: &Value, input: &Value) -> bool {
    let stage = s(input, "readiness");
    if !stage.is_empty()
        && !arr(r, "stages")
            .iter()
            .any(|x| x == stage || (stage == "no_idea" && x == "has_idea"))
    {
        return false;
    }
    let c = check_conditions(r, &input["conditions"], date_ms(&input["now"]));
    c["closed"] != true && c["status"] != "mismatch"
}
/// TS: `decideCandidates(input: ExploreRecommendInput): Resource[]`.
pub fn decide_candidates(input: &Value) -> Vec<Value> {
    let problems = default_array(input, "problems", data::problems);
    let mut rows: Vec<(Value, f64)> = default_array(input, "resources", data::resources)
        .into_iter()
        .filter(|r| allowed(r, input))
        .map(|r| {
            let score = if linked(&r, input, &problems) {
                2.0
            } else {
                0.0
            } + if cap_match(&r, input) { 1.0 } else { 0.0 }
                + 0.9 * similarity(&r, &input["likes"])
                + if region_match(&r, input) { 0.3 } else { 0.0 };
            (r, score)
        })
        .collect();
    rows.sort_by(|a, b| {
        b.1.total_cmp(&a.1)
            .then_with(|| s(&a.0, "id").cmp(s(&b.0, "id")))
    });
    rows.into_iter()
        .take(DECIDE_CANDIDATES_MAX)
        .map(|x| x.0)
        .collect()
}
/// TS: `recommendResources(input: ExploreRecommendInput): { items: Recommended[]; noMatchReason: string | null }`.
pub fn recommend_resources(input: &Value) -> Value {
    let problems = default_array(input, "problems", data::problems);
    let relevance = &input["relevance"];
    let use_rel = relevance
        .as_object()
        .is_some_and(|x| !x.is_empty() && !x.contains_key("$undef"));
    let rs = if use_rel {
        decide_candidates(input)
    } else {
        default_array(input, "resources", data::resources)
    };
    let mut rows: Vec<(Value, f64, f64, bool)> = Vec::new();
    for r in rs {
        if !allowed(&r, input) {
            continue;
        }
        let link = linked(&r, input, &problems);
        let cap = cap_match(&r, input);
        let like = similarity(&r, &input["likes"]);
        let reg = region_match(&r, input);
        let base = (if link { 2.0 } else { 0.0 }) + (if cap { 1.0 } else { 0.0 });
        let rel = relevance
            .get(s(&r, "id"))
            .and_then(Value::as_f64)
            .unwrap_or(0.0);
        if (use_rel && rel < RELEVANCE_MIN)
            || (!use_rel && base == 0.0 && !s(input, "readiness").is_empty())
        {
            continue;
        }
        let score = if use_rel { rel } else { base + 0.9 * like };
        rows.push((r, score, like, reg));
    }
    rows.sort_by(|a, b| {
        b.1.total_cmp(&a.1)
            .then_with(|| {
                if use_rel {
                    b.2.total_cmp(&a.2)
                } else {
                    std::cmp::Ordering::Equal
                }
            })
            .then_with(|| b.3.cmp(&a.3))
            .then_with(|| s(&a.0, "id").cmp(s(&b.0, "id")))
    });
    let items: Vec<Value> = rows.into_iter().take(3).map(|(r,_,_,reg)| {
        let condition = check_conditions(&r, &input["conditions"], date_ms(&input["now"]));
        let link = linked(&r, input, &problems);
        let cap = cap_match(&r, input);
        json!({"resource":r,"condition":condition,"regionMatch":reg,"linked":link,"capMatch":cap})
    }).collect();
    let reason = if items.is_empty() {
        Some(REGION_NOTHING)
    } else {
        None
    };
    json!({"items":items,"noMatchReason":reason})
}
fn prep(
    id: &str,
    title: &str,
    why: &str,
    how: &str,
    output: &str,
    resource: Option<&str>,
) -> Value {
    let mut v = json!({"id":id,"title":title,"why":why,"how":how,"output":output,"source":"rule"});
    if let Some(r) = resource.filter(|r| !r.is_empty()) {
        v["resourceId"] = json!(r);
    }
    v
}
/// TS: `buildPrep(readiness: ReadinessStage | undefined, summary: SummaryV2 | null, exploration: Exploration | null, resources: Resource[], problems: ProblemCard[] = PROBLEMS): { primary: PrepDraft; followUps: PrepDraft[] }`.
pub fn build_prep(
    readiness: Option<&str>,
    summary: &Value,
    ex: &Value,
    resources: &[Value],
    problems: &[Value],
) -> Value {
    let stage = readiness.unwrap_or("no_idea");
    let target = s(&summary["target"], "provenance") == "user";
    let problem = problem_of(ex["problemId"].as_str(), problems);
    let dir = if ["user_selected", "user"].contains(&s(ex, "directionStatus")) {
        s(ex, "direction")
    } else {
        ""
    };
    let mut list = Vec::new();
    if !target {
        let how=match stage {"has_idea"=>"아이디어를 쓸 것 같은 사람 한 명을 정하고, 그 사람이 하루 중 언제 이 문제를 겪는지 세 줄로 적어요.","preparing"=>"지금 준비한 내용이 맞는 사람이 누구인지 한 문장으로 쓰고, 그 사람을 직접 본 적이 있는지 구분해서 적어요.",_=>"관심 있는 분야에서 불편해 보였던 장면 하나를 떠올리고, 그 장면에 있던 사람이 누구인지, 언제 어떤 일을 겪는지 세 줄로 적어요."};
        list.push(prep(
            "prep-target",
            "이용할 사람의 상황 구체화",
            "대상이 아직 정해지지 않았어요. 누가 언제 불편한지 알아야 다음 준비를 고를 수 있어요.",
            how,
            "대상·상황 메모 3줄 (아직 모르는 것은 미정으로 표시)",
            None,
        ));
    } else if !dir.is_empty() {
        list.push(prep("prep-direction","선택한 방향의 가설 확인하기",&format!("직접 고른 방향(\"{dir}\")이 맞는지는 아직 확인되지 않았어요."),"이 방향이 맞다면 이용할 사람이 무엇을 말할지 가설 한 줄과, 그것을 확인할 질문 3개를 적어요.","가설 1줄 + 확인 질문 3개",None));
    } else {
        let (id, title, why) = match stage {
            "has_idea" => (
                "prep-idea-check",
                "아이디어를 이용할 사람 눈으로 점검하기",
                "생각해 둔 아이디어가 실제 상황과 맞는지 질문으로 확인할 차례예요.",
            ),
            "preparing" => (
                "prep-assumptions",
                "준비한 내용 중 가정 표시하기",
                "준비한 내용 중 직접 확인한 것과 가정을 구분하면 남은 준비가 보여요.",
            ),
            _ => (
                "prep-problem",
                "문제가 생기는 상황 알아보기",
                "해결책은 정하지 않고, 선택한 문제가 누구에게 어떤 상황에서 생기는지부터 알아봐요.",
            ),
        };
        list.push(prep(
            id,
            title,
            why,
            if stage == "preparing" {
                "준비한 내용을 한 장으로 쓰고, 확인한 것에는 근거를, 가정에는 표시를 붙여요."
            } else {
                "이용할 사람에게 물어볼 질문을 3개 만들고, 가능하면 한 사람에게 물어봐요."
            },
            "질문 3개 + 들은 내용 메모",
            None,
        ));
    }
    if let Some(p) = problem.filter(|_| stage != "preparing") {
        let u = arr(&p, "unknowns")
            .iter()
            .take(3)
            .map(text)
            .collect::<Vec<_>>()
            .join(" / ");
        list.push(prep(
            "prep-unknowns",
            "문제 카드의 미확인 사항 확인하기",
            "선택한 문제 자료에는 아직 확인되지 않은 부분이 남아 있어요.",
            &format!(
                "자료에 적힌 미확인 사항({})을 현장 사람에게 하나씩 물어봐요.",
                if u.is_empty() { "없음" } else { &u }
            ),
            "미확인 사항별 확인 결과 (확인 못 한 것은 미확인으로 유지)",
            None,
        ));
    }
    if stage == "preparing" {
        list.push(prep(
            "prep-interview",
            "이용할 사람에게 확인할 질문 정리",
            "준비 중인 구상도 실제 이용할 사람의 이야기로 한 번 확인해야 해요.",
            "이용할 사람 2~3명에게 물어볼 질문을 쓰고 대화 후 들은 말을 그대로 적어요.",
            "질문 목록 + 들은 말 기록",
            None,
        ));
    }
    if stage == "has_idea" {
        list.push(prep(
            "prep-oneline",
            "아이디어 한 줄과 모르는 것 적기",
            "한 줄로 쓰면 아직 모르는 부분이 눈에 보여요.",
            "\"누구의 어떤 불편을 어떻게 돕고 싶다\" 한 줄과, 모르는 것 3개를 적어요.",
            "한 줄 정리 + 모르는 것 목록",
            None,
        ));
    }
    if stage == "no_idea" {
        list.push(prep(
            "prep-interest-scan",
            "관심 분야에서 본 불편 적어 보기",
            "관심은 있어도 문제를 아직 못 정했다면 본 것을 적어 두면 길이 보여요.",
            "관심 분야에서 직접 보거나 들은 불편을 세 가지 적어요. 없으면 없다고 적어도 돼요.",
            "불편 목록 (0~3개)",
            None,
        ));
    }
    let caps = match stage {
        "preparing" => ["공간", "상담"],
        "no_idea" => ["교육", "상담"],
        _ => ["상담", "교육"],
    };
    let first = caps.iter().find_map(|cap| {
        resources.iter().find(|r| {
            arr(r, "capabilityTags").iter().any(|t| t == cap)
                && check_conditions(r, &Value::Null, 0)["closed"] == false
        })
    });
    if let Some(r) = first {
        let edu = arr(r, "capabilityTags").iter().any(|t| t == "교육");
        let agency = s(r, "agency");
        let title = if edu {
            format!("{agency}의 {} 안내 살펴보기", s(r, "type"))
        } else {
            format!("{agency}에 문의할 내용 한 장 정리하기")
        };
        let url = s(r, "url");
        let how=format!("공식 안내{}에서 대상·절차를 읽고, {}과 궁금한 점을 적어 가요. 이용 가능 여부와 응답은 기관이 정해요.",if url.is_empty(){String::new()}else{format!("({url})")},if readiness==Some("preparing"){"준비한 내용"}else{"지금까지 정리한 내용"});
        list.push(prep(
            &format!("prep-contact-{}", s(r, "id")),
            &title,
            "공식 안내를 보고 대상과 운영 범위를 알면, 나에게 맞는지 스스로 가늠할 수 있어요.",
            &how,
            "문의 전 메모 (궁금한 점 3개)",
            Some(s(r, "id")),
        ));
    }
    json!({"primary":list.first(),"followUps":list.iter().skip(1).take(2).collect::<Vec<_>>()})
}
/// TS: `FIELD_QUESTION_MAX`.
pub const FIELD_QUESTION_MAX: usize = 3;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn js_whitespace_in_edits_and_answers() {
        let base = build_summary(&json!({"start":{},"exploration":null,"answers":[]}));
        let edited = apply_summary_edit(&base, &json!({"target":{"text":"\u{feff}"}}));
        assert_eq!(
            edited["summary"]["target"],
            json!({"text":"미정","provenance":"unknown"})
        );
        let summary = build_summary(
            &json!({"start":{},"exploration":null,"answers":[{"key":"target","text":"\u{85}","how":"answered"}]}),
        );
        assert_eq!(
            summary["target"],
            json!({"text":"\u{85}","provenance":"user"})
        );
    }

    #[test]
    fn condition_numbers_use_js_format() {
        let result = check_conditions(
            &json!({"conditions":{"ageMin":20.0},"regions":[],"endDate":null,"recruitStatus":"unknown"}),
            &json!({"age":25.0}),
            0,
        );
        assert_eq!(
            result["checks"][0]["detail"],
            "입력한 나이 25세가 명시 조건(20~세) 범위예요"
        );
    }
}
