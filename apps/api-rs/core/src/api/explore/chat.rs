//! F2 질문 표와 선택 규칙. 질문 뜻은 여기서 정한다.
use crate::shared::{data, explore::REVIEW_REGIONS, explore_rules::{industries_of, problem_of}};
use serde_json::Value;
pub const MAX_QUESTIONS: usize = 3;
pub const OPENING: &str = "몇 가지만 가볍게 여쭤볼게요. 모르면 \"아직 모르겠어요\", 넘기고 싶으면 \"건너뛰기\"를 눌러도 돼요. 정답은 없어요.";
pub const CLOSING: &str = "질문은 여기까지예요. 정리된 내용을 같이 볼까요?";
/// 검토 지역 질문. 고른 지역 산업이 있으면 그 분야와 잇고, 없으면 어디서 누구와 시작할지 묻는다.
pub fn region_question(start: &Value) -> String {
    let region = start["reviewRegion"].as_str().filter(|r| *r != "미정").unwrap_or("부산·울산·경남");
    let place = match start["district"].as_str().filter(|d| !d.is_empty() && *d != "미정") { Some(d) => format!("{region} {d}"), None => region.to_owned() };
    let picked: Vec<&str> = start["interests"].as_array().into_iter().flatten().filter_map(Value::as_str).filter(|t| crate::shared::explore::INDUSTRY_TAGS.contains(t)).collect();
    if picked.is_empty() {
        format!("{place}에서 먼저 시작한다면 어디에서, 누구와 해 보고 싶으세요? 예를 들어 대학가나 동네 시장처럼요. 정하지 않았다면 그렇게 답해도 괜찮아요.")
    } else {
        format!("고른 {} 분야와 이어 본다면, {place}에서 어떤 일을 해 볼 수 있을까요? 아직 모르겠다면 그렇게 답해도 괜찮아요.", picked.join("·"))
    }
}
pub fn question(key: &str) -> Option<&'static str> {
    match key {
        "trigger" => Some("이 일을 해보고 싶어진 경험이 있나요? (예: 가족 일을 도우면서 불편한 점을 본 적이 있어요)"),
        "reason" => Some("이 문제의 어떤 부분이 관심을 끌었나요?"),
        "contact" => Some("관련해 겪거나 알고 있는 경험이 있나요? 없어도 괜찮아요."),
        "direction" => Some("이 문제에서 더 알아보고 싶은 부분이나 도움이 될 수 있다고 생각하는 점이 있나요?"),
        "target" => Some("어떤 사람이 이용하면 좋을까요? 아직 정하지 않아도 괜찮아요."),
        "prepared" => Some("지금까지 알아보거나 준비한 것이 있나요?"),
        "region" => Some("부산·울산·경남에서 먼저 시작한다면 어디에서, 누구와 해 보고 싶으세요? 정하지 않았다면 그렇게 답해도 괜찮아요."),
        "interestOnly" => Some("선택한 산업에서 제품을 만드는 일과 관련 업무를 돕는 서비스 중 살펴보고 싶은 방향이 있나요?"),
        // 관심 공고가 목록에서 빠졌을 때 쓰는 질문 (공고 이름 없이).
        "focus" => Some("관심 있는 지원 사업을 받는다면 가장 먼저 해 보고 싶은 일은 무엇인가요?"),
        _ => None,
    }
}
pub fn plan_questions(start: &Value, exploration: &Value, answers: &[Value]) -> Vec<String> {
    let has_problem = exploration["origin"] == "card" || exploration["origin"] == "custom";
    let base = match start["readiness"].as_str().unwrap_or("has_idea") {
        "no_idea" if has_problem => ["reason", "contact", "target"],
        "no_idea" => ["trigger", "interestOnly", "target"],
        "preparing" => ["prepared", "target", "direction"],
        _ => ["trigger", "target", "prepared"],
    };
    let mut plan: Vec<String> = base.into_iter().map(str::to_owned).collect();
    let region = start["reviewRegion"].as_str().unwrap_or("");
    // 관심 공고 질문은 첫 칸이다. 지역 질문은 그 칸을 피해서 넣는다 (같은 칸이면 지역 질문이 사라진다).
    let focus = start["focusResourceId"].as_str().is_some_and(|s| !s.is_empty());
    if focus { plan[0] = "focus".into(); }
    if region != "미정" && REVIEW_REGIONS.contains(&region) && !answers.iter().any(|a| a["key"] == "region") {
        let slot = ["interestOnly", "prepared", "contact", "trigger", "direction", "reason"].iter().find_map(|key| plan.iter().position(|p| p == key)).unwrap_or(1);
        plan[slot] = "region".into();
    }
    plan
}
fn norm(s: &str) -> String { s.chars().filter(|c| !crate::jsstr::is_js_ws(*c)).collect() }
pub fn rule_suggestions(start: &Value, exploration: &Value, rejected: &[String], problems: Option<&[Value]>) -> Vec<String> {
    let shipped;
    let problems = match problems { Some(p) => p, None => { shipped = data::problems(); &shipped } };
    let problem = problem_of(exploration["problemId"].as_str(), problems);
    let interests = start["interests"].as_array().map(Vec::as_slice).unwrap_or(&[]);
    let industries = industries_of(interests);
    let tag = problem.as_ref().and_then(|p| p["industryTags"].as_array()).and_then(|a| a.first()).and_then(Value::as_str).or_else(|| industries.first().and_then(Value::as_str));
    let pool = if let Some(p) = problem.as_ref() {
        vec![format!("{}가 이 상황을 언제 겪는지 직접 들어보는 방향", p["affectedUser"].as_str().unwrap_or("")), "지금 쓰는 방법과 불편한 점을 비교해 보는 방향".into(), "비슷한 문제를 다른 곳에서는 어떻게 푸는지 찾아보는 방향".into()]
    } else if let Some(tag) = tag {
        vec![format!("{tag} 분야에서 제품을 만드는 일을 돕는 서비스를 알아보는 방향"),format!("{tag} 분야 일을 하는 사람의 관련 업무를 돕는 서비스를 알아보는 방향"),format!("{tag} 분야에서 일하는 사람의 하루를 먼저 들어보는 방향")]
    } else { vec!["관심 분야에서 직접 본 불편을 먼저 적어 보는 방향".into(), "관심 분야에서 일하는 사람의 이야기를 들어보는 방향".into()] };
    let dead: Vec<_> = rejected.iter().map(|x| norm(x)).collect();
    pool.into_iter().filter(|s| !dead.contains(&norm(s))).take(2).collect()
}

#[cfg(test)]
mod focus_plan_tests {
    use super::{plan_questions, question};
    use serde_json::json;
    #[test]
    fn focus_and_region_questions_both_stay() {
        let start = json!({"readiness":"preparing","reviewRegion":"울산","focusResourceId":"r1"});
        let plan = plan_questions(&start, &json!({}), &[]);
        assert_eq!(plan[0], "focus");
        assert!(plan.iter().any(|p| p == "region"), "region question kept: {plan:?}");
    }
    #[test]
    fn focus_question_has_a_fallback_text() {
        assert!(question("focus").is_some_and(|q| !q.is_empty()));
    }
}
