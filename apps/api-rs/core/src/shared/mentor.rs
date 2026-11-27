//! TS 원본: packages/shared/src/mentor.ts
use super::constants::MENTOR_QUESTION_COUNT;
use crate::jsstr::{js_trim, JS_WS};
use serde_json::{json, Value};
use std::sync::LazyLock;
static PROGRAM_RE: LazyLock<Option<regex::Regex>> = LazyLock::new(|| {
    regex::Regex::new(&format!(r"지원[{JS_WS}]*사업|공고|마감|지원금|얼마|금액")).ok()
});

/// TS: export const DEFAULT_MENTOR_QUESTIONS: readonly string[]
pub const DEFAULT_MENTOR_QUESTIONS: &[&str] = &[
    "지금 고객은 어떤 대안을 쓰고 있고, 그 대안의 어떤 점이 가장 불편한가요?",
    "첫 고객 10명은 어디에서, 어떻게 만날 계획인가요?",
    "이 사업을 왜 부산에서 해야 하나요? 부산이라서 유리한 점이 있나요?",
];
/// TS: export const MENTOR_PROGRAM_DEFLECT: string
pub const MENTOR_PROGRAM_DEFLECT: &str =
    "지원사업 이름·금액·마감일은 결과 화면에서 공고 데이터로 보여드릴게요.";

/// TS: function pickMentorQuestions(p: ConsultProfile): string[]
pub fn pick_mentor_questions(p: &Value) -> Vec<String> {
    let mut out = Vec::new();
    if js_trim(p["alternative"].as_str().unwrap_or(""))
        .encode_utf16()
        .count()
        < 10
    {
        out.push(DEFAULT_MENTOR_QUESTIONS[0]);
    }
    let revenue = p["revenue"].as_array();
    if revenue.is_none_or(|r| r.is_empty() || r.iter().any(|v| v == "아직 모름")) {
        out.push("고객은 무엇에 돈을 낼까요? 가격은 얼마쯤이면 좋을까요?");
    }
    if js_trim(p["customerDesc"].as_str().unwrap_or(""))
        .encode_utf16()
        .count()
        < 15
    {
        out.push("가장 먼저 쓸 고객을 한 사람으로 그려 주세요. 나이, 사는 곳, 하루 일과는요?");
    }
    for q in DEFAULT_MENTOR_QUESTIONS {
        if !out.contains(q) {
            out.push(q);
        }
    }
    out.into_iter()
        .take(MENTOR_QUESTION_COUNT as usize)
        .map(str::to_owned)
        .collect()
}
/// TS: function mentorOpening(p: ConsultProfile): string
pub fn mentor_opening(p: &Value) -> String {
    let who = p["customerDesc"]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or("고객");
    let idea = p["idea"].as_str().unwrap_or("아이디어");
    format!("{who}을(를) 위해 '{idea}'를 하려는 거군요. 몇 가지만 더 여쭤볼게요.")
}
/// TS: function asksAboutPrograms(text: string): boolean
pub fn asks_about_programs(text: &str) -> bool {
    PROGRAM_RE.as_ref().is_some_and(|r| r.is_match(text))
}
/// TS: function draftSummary(p: ConsultProfile, messages: ChatMessage[]): IdeaSummary
pub fn draft_summary(p: &Value, messages: &[Value]) -> Value {
    let s = |key: &str| p[key].as_str().unwrap_or("");
    let ages = p["customerAges"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join("·")
        })
        .unwrap_or_default();
    let customer = [s("customerType"), ages.as_str(), s("customerDesc")]
        .into_iter()
        .filter(|x| !x.is_empty())
        .collect::<Vec<_>>()
        .join(" / ");
    let form = if s("bizForm").is_empty() {
        String::new()
    } else {
        format!("({})", s("bizForm"))
    };
    let solution = [s("idea"), form.as_str()]
        .into_iter()
        .filter(|x| !x.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let revenue = p["revenue"]
        .as_array()
        .filter(|a| !a.is_empty())
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_else(|| "아직 정하지 않음".into());
    let busan = messages
        .iter()
        .find(|m| {
            m["role"] == "user" && m["questionIndex"].as_f64() == Some(2.0) && m["skipped"] != true
        })
        .and_then(|m| m["text"].as_str())
        .map(str::to_owned)
        .unwrap_or_else(|| {
            if s("district").is_empty() {
                "부산에서 시작".into()
            } else {
                format!("{}에서 시작", s("district"))
            }
        });
    json!({"problem":s("problem"),"customer":customer,"solution":solution,"revenue":revenue,"busan":busan})
}
/// 함수 골든.
pub fn golden(f: &str, args: &[Value]) -> Option<Value> {
    let a = args.first()?;
    match f {
        "pickMentorQuestions" => Some(json!(pick_mentor_questions(a))),
        "mentorOpening" => Some(json!(mentor_opening(a))),
        "asksAboutPrograms" => Some(json!(asks_about_programs(a.as_str()?))),
        "draftSummary" => Some(draft_summary(a, args.get(1)?.as_array()?)),
        _ => None,
    }
}
#[cfg(test)]
mod correction_tests {
    use super::*;
    #[test]
    fn js_space_and_number() {
        assert!(asks_about_programs("지원\u{feff}사업"));
        assert!(!asks_about_programs("지원\u{85}사업"));
        let p = json!({"alternative":"\u{feff}123456789\u{feff}","revenue":["판매"],"customerDesc":"123456789012345"});
        assert_eq!(pick_mentor_questions(&p)[0], DEFAULT_MENTOR_QUESTIONS[0]);
        assert_eq!(
            draft_summary(
                &p,
                &[json!({"role":"user","questionIndex":2.0,"text":"답변"})]
            )["busan"],
            "답변"
        );
    }
}
