//! F2 질문 표와 선택 규칙. 질문 뜻은 여기서 정한다.
use crate::shared::{data, explore::REVIEW_REGIONS, explore_rules::{industries_of, problem_of}};
use serde_json::Value;
pub const MAX_QUESTIONS: usize = 3;
pub const OPENING: &str = "몇 가지만 가볍게 여쭤볼게요. 모르면 \"아직 모르겠어요\", 넘기고 싶으면 \"건너뛰기\"를 눌러도 돼요. 정답은 없어요.";
pub const CLOSING: &str = "질문은 여기까지예요. 정리된 내용을 같이 볼까요?";
pub fn question(key: &str) -> Option<&'static str> {
    match key {
        "trigger" => Some("이 일을 해보고 싶어진 경험이 있나요? (예: 가족 일을 도우면서 불편한 점을 본 적이 있어요)"),
        "reason" => Some("이 문제의 어떤 부분이 관심을 끌었나요?"),
        "contact" => Some("관련해 겪거나 알고 있는 경험이 있나요? 없어도 괜찮아요."),
        "direction" => Some("이 문제에서 더 알아보고 싶은 부분이나 도움이 될 수 있다고 생각하는 점이 있나요?"),
        "target" => Some("어떤 사람이 이용하면 좋을까요? 아직 정하지 않아도 괜찮아요."),
        "prepared" => Some("지금까지 알아보거나 준비한 것이 있나요?"),
        "region" => Some("부울경의 조선·해양, 자동차, 항공, 방산, 수소·에너지, 데이터센터, AI, 2차전지 분야 중 이 구상과 연결해보고 싶은 분야가 있나요? 잘 모르겠으면 그렇다고 해도 돼요."),
        "interestOnly" => Some("선택한 산업에서 제품을 만드는 일과 관련 업무를 돕는 서비스 중 살펴보고 싶은 방향이 있나요?"),
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
