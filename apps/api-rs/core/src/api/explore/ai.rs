//! 탐색용 AI 보조. 통과하지 못한 문장은 규칙 결과를 쓴다.
use crate::api::ai::solar::TextAi;
use crate::jsstr::{is_js_ws, js_trim, len16};
use crate::shared::{data, guard::{guard_text, parse_json}};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};

const RULES: &str = "당신은 창업을 처음 생각하는 청년의 생각 정리를 돕는 한국어 도우미예요. 해요체로 짧게 써요. 점수를 매기거나 성공 가능성을 평가하거나 과하게 칭찬하지 않아요. 기관·프로그램 이름, 금액, 마감일, 날짜, 숫자를 절대 쓰지 않아요. 사용자가 말하지 않은 경험·인터뷰·매출·팀을 지어내지 않아요. 확인되지 않은 것은 가설이라고 써요.";
pub const REACTION_PROMPT: &str = "당신은 창업을 처음 생각하는 청년과 이야기하는 따뜻한 한국어 상담자예요. 해요체로 짧게 써요. 점수를 매기거나 성공 가능성을 평가하거나 과하게 칭찬하지 않아요. 기관·프로그램 이름, 금액, 마감일, 날짜, 숫자를 절대 쓰지 않아요. 사용자가 말하지 않은 경험·인터뷰·매출·팀을 지어내지 않아요.\n사용자의 직전 답을 듣고, 다음 질문으로 자연스럽게 넘어가도록 받아 주는 한 문장만 써요.\n- 사용자의 말을 그대로 되풀이하지 말고, 핵심을 자기 말로 짧게 받아요.\n- \"~하셨군요\"로만 끝내지 말고 말끝을 바꿔요. 예: \"직접 겪은 불편이라 더 와닿아요.\", \"짧게 사는 자취생이라면 사서 버리는 부담이 크겠어요.\", \"친구들 이야기부터 들어 보면 방향이 잡히겠어요.\"\n- 다음 질문과 어색하게 겹치지 않게 써요. 새로운 사실·조언·평가를 더하지 않아요.\n- 질문하지 않아요. 물음표를 쓰지 않아요. 다음 질문은 코드가 붙여요.\n- 40자 안팎, 마침표로 끝나는 한 문장만 출력해요.";
pub const REACTION_MAX: usize = 60;
async fn join_all<F: std::future::Future>(futures: Vec<F>) -> Vec<F::Output> {
    let mut pending: Vec<_> = futures.into_iter().map(|f| Some(Box::pin(f))).collect();
    let mut outputs: Vec<Option<F::Output>> = (0..pending.len()).map(|_| None).collect();
    std::future::poll_fn(|cx| {
        let mut done = true;
        for (future, output) in pending.iter_mut().zip(outputs.iter_mut()) {
            if let Some(f) = future {
                match f.as_mut().poll(cx) {
                    std::task::Poll::Ready(value) => { *output=Some(value); *future=None; }
                    std::task::Poll::Pending => done=false,
                }
            }
        }
        if done { std::task::Poll::Ready(()) } else { std::task::Poll::Pending }
    }).await;
    outputs.into_iter().flatten().collect()
}
fn norm(s: &str) -> String { s.chars().filter(|c| !is_js_ws(*c)).collect() }
pub fn clean_reaction(t: Option<&str>) -> Option<String> {
    let s = t?.trim_matches(|c| is_js_ws(c) || matches!(c, '"' | '\'' | '“' | '”' | '‘' | '’'));
    let mut out = String::new(); let mut whitespace = false;
    for c in s.chars() { if is_js_ws(c) { whitespace = true; } else { if whitespace { out.push(' '); whitespace = false; } out.push(c); } }
    if out.is_empty() || len16(&out) > REACTION_MAX || out.contains(['?', '？']) || out.chars().filter(|c| matches!(c, '.' | '!' | '。')).count() > 1 { return None; }
    let stem = out.trim_end_matches(['.', '!']);
    if ["까요", "나요", "세요", "신가요", "인가요"].iter().any(|s| stem.ends_with(s)) { return None; }
    if !out.ends_with(['.', '!', '。']) { out.push('.'); }
    Some(out)
}
pub struct Limiter { max: usize, window_ms: i64, hits: HashMap<String, Vec<i64>> }
impl Limiter {
    pub fn new(max: usize, window_ms: i64) -> Self { Self { max, window_ms, hits: HashMap::new() } }
    pub fn load(max: usize, scratch: &std::collections::BTreeMap<String, Value>) -> Self {
        let hits = scratch.get("explore:ai-limiter").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
        Self { max, window_ms: 3_600_000, hits }
    }
    pub fn save(&self, scratch: &mut std::collections::BTreeMap<String, Value>) {
        scratch.insert("explore:ai-limiter".into(), json!(self.hits));
    }
    pub fn allow(&mut self, id: &str, now: i64) -> bool {
        let recent = self.hits.entry(id.into()).or_default(); recent.retain(|t| now - *t < self.window_ms);
        if recent.len() >= self.max { return false; }
        recent.push(now);
        if self.hits.len() > 5000 { self.hits.retain(|_, v| v.iter().any(|t| now - *t < self.window_ms)); }
        true
    }
}
pub struct AiCall { pub text: Option<String>, pub limited: bool, pub failed: bool }
pub struct ExploreAi<'a> { pub ai: &'a TextAi<'a>, pub limiter: &'a mut Limiter, pub actor_id: &'a str, pub now: i64, pub local: HashSet<String> }
fn other_titles(own: &[&str]) -> Vec<String> { data::resources().iter().filter_map(|r| r["title"].as_str()).filter(|t| !own.contains(t)).map(str::to_owned).collect() }
fn guarded(text: Option<&str>, allowed: &[&str], own: &[&str], max: usize) -> Option<String> { guard_text(text, &json!({"allowedText":allowed,"knownTitles":other_titles(own),"maxLength":max})) }
impl ExploreAi<'_> {
    async fn call(&mut self, task: &str, system: &str, user: &str, rewrite: Option<&str>) -> AiCall {
        if self.ai.mode == "off" || rewrite.is_some_and(|r| self.local.contains(r)) { return AiCall { text: None, limited: false, failed: false }; }
        if !self.limiter.allow(self.actor_id, self.now) { return AiCall { text: None, limited: true, failed: false }; }
        let text = self.ai.generate(task, &[json!({"role":"system","content":system}),json!({"role":"user","content":user})], Some(self.actor_id)).await;
        let failed = text.is_none(); AiCall { text, limited: false, failed }
    }
    pub async fn question(&mut self, base: &str, last_answer: &str) -> (String, bool) {
        if js_trim(last_answer).is_empty() { return (base.into(), false); }
        let r = self.call("mentor", REACTION_PROMPT, &format!("사용자의 직전 답: {last_answer}\n다음에 할 질문(참고만, 쓰지 않기): {base}"), Some("mentor")).await;
        let reaction = clean_reaction(guarded(r.text.as_deref(), &[last_answer], &[], REACTION_MAX).as_deref());
        (reaction.map(|s| format!("{s} {base}")).unwrap_or_else(|| base.into()), r.failed)
    }
    pub async fn suggestions(&mut self, context: &str, user_texts: &[String], avoid: &[String]) -> (Vec<String>, bool) {
        let system = format!("{RULES}\n사용자가 요청해서 더 알아볼 만한 접근 방향 예시를 정확히 2개 제안해요. 사업 아이템을 확정하지 말고 \"무엇을 알아볼지\" 방향으로 써요.\n맥락에 \"관심 공고\" 줄이 있으면, 사용자가 그 공고에 관심을 보인 것이에요. 그 공고의 대상과 지원 내용을 사용자의 생각과 이어서 제안해요. 공고 이름 대신 \"관심 공고\"라고 불러요. 하트한 공고와 최근 본 공고는 관심 분야를 짐작하는 참고로만 써요. JSON 문자열 배열만 출력해요. 각 항목은 한 문장이에요.");
        let user = format!("{context}\n이미 거절한 방향(다시 쓰지 않기): {}", if avoid.is_empty() { "없음".into() } else { avoid.join(" / ") });
        let r = self.call("mentor", &system, &user, None).await;
        let parsed = parse_json(r.text.as_deref());
        let allowed: Vec<_> = std::iter::once(context).chain(user_texts.iter().map(String::as_str)).collect();
        let items = parsed.as_array().into_iter().flatten().filter_map(Value::as_str).filter_map(|s| guarded(Some(s), &allowed, &[], 120)).filter(|s| !avoid.iter().any(|a| norm(a) == norm(s))).take(2).collect();
        (items, r.failed)
    }
    pub async fn fill(&mut self, context: &str, user_texts: &[String], target: bool, value: bool) -> (Value, Option<String>, bool) {
        let system = format!("{RULES}\n주어진 정보로 아직 비어 있는 칸에 대한 제안만 JSON 객체로 출력해요: {{\"target\":\"도움받을 사람 가설\",\"value\":\"해결해볼 불편 가설\",\"hypotheses\":\"확인할 고객·시장 가설과 확인 질문\",\"regional\":\"지역 고객 가설과 확인 질문\"}}. 모르면 빈 문자열이에요. 각 값은 한두 문장이에요.\n맥락에 \"관심 공고\" 줄이 있으면, 사용자가 그 공고에 관심을 보인 것이에요. 그 공고의 대상과 지원 내용을 사용자의 생각과 이어서 제안해요. 공고 이름 대신 \"관심 공고\"라고 불러요. 하트한 공고와 최근 본 공고는 관심 분야를 짐작하는 참고로만 써요.");
        let r = self.call("summary", &system, context, None).await;
        let parsed = parse_json(r.text.as_deref());
        let allowed: Vec<_> = std::iter::once(context).chain(user_texts.iter().map(String::as_str)).collect();
        let g = |key: &str| guarded(parsed.get(key).and_then(Value::as_str), &allowed, &[], 200);
        let mut out = Map::new();
        if target { if let Some(t) = g("target") { out.insert("target".into(), json!(t)); } }
        if value { if let Some(t) = g("value") { out.insert("value".into(), json!(t)); } }
        if let Some(t) = g("hypotheses") { out.insert("hypotheses".into(), json!(t)); }
        (Value::Object(out), g("regional"), r.failed)
    }
    /// (질문들, AI 가 바꾼 것이 있는지, AI 가 답을 하나라도 돌려줬는지)
    pub async fn field(&mut self, rules: &[Value], context: &str) -> (Vec<Value>, bool, bool) {
        let system = format!("{RULES}\n현장 사람에게 물어볼 질문 한 문장을 같은 뜻으로 자연스럽게 바꿔 써요. 어려움·불편·구매 의향·비용 지불을 전제하지 말고, 현재 방식과 실제 경험을 묻는 열린 질문으로 써요. 응답자나 답변을 지어내지 않아요. 문장만 출력해요.");
        let allowed: Vec<bool> = rules.iter().map(|_| self.ai.mode != "off" && !self.local.contains("field") && self.limiter.allow(self.actor_id,self.now)).collect();
        let ai = self.ai; let actor = self.actor_id;
        let outputs = join_all(rules.iter().zip(allowed).map(|(q,allow)| {
            let user = format!("질문: {}\n상황: {context}", q["question"].as_str().unwrap_or(""));
            let system = &system;
            async move { if allow { ai.generate("mentor", &[json!({"role":"system","content":system}),json!({"role":"user","content":user})], Some(actor)).await } else { None } }
        }).collect()).await;
        let answered = outputs.iter().any(Option::is_some);
        let mut changed = false; let mut items = Vec::new();
        for (q,output) in rules.iter().zip(outputs) {
            let question = q["question"].as_str().unwrap_or(""); let purpose = q["purpose"].as_str().unwrap_or("");
            let t = guarded(output.as_deref(), &[question,purpose,context], &[], 140);
            let valid = t.as_ref().is_some_and(|s| {
                let pattern = format!("불편|어려움|어렵|힘들|돈을[{}]*내|구매|결제|지불|사[{}]*주|살[{}]*의향|쓸[{}]*의향", crate::jsstr::JS_WS, crate::jsstr::JS_WS, crate::jsstr::JS_WS, crate::jsstr::JS_WS);
                let presupposes = fancy_regex::Regex::new(&pattern).ok().and_then(|r| r.is_match(s).ok()).unwrap_or(true);
                let s = js_trim(s);
                (s.ends_with('?') || s.ends_with('？')) && !presupposes
            });
            let mut item = q.clone(); if valid { if let (Some(o), Some(t)) = (item.as_object_mut(), t) { o.insert("question".into(), json!(t)); o.insert("source".into(), json!("ai")); changed = true; } } items.push(item);
        }
        (items, changed, answered)
    }
    pub async fn reasons(&mut self, inputs: &[(Value, String)], context: &str) -> Vec<Option<String>> {
        let allowed: Vec<bool> = inputs.iter().map(|_| self.ai.mode != "off" && !self.local.contains("reason") && self.limiter.allow(self.actor_id,self.now)).collect();
        let ai=self.ai; let actor=self.actor_id;
        join_all(inputs.iter().zip(allowed).map(|((resource,rule_reason),allow)| async move {
            if !allow {return None;}
            let typ=resource["type"].as_str().unwrap_or(""); let content=resource["content"].as_str().unwrap_or(""); let target=resource["target"].as_str().unwrap_or(""); let title=resource["title"].as_str().unwrap_or("");
            let facts=format!("경로 종류: {typ}\n제공 내용: {content}\n대상: {}\n규칙 이유: {rule_reason}\n사용자 상황: {context}",if resource["target"].is_null(){"확인 필요"}else{target});
            let system=format!("{RULES}\n이 경로가 사용자의 어떤 준비를 돕는지 한두 문장으로 써 주세요. 기관 이름과 '이 지역이라서'라는 이유는 쓰지 않아요. 주어진 제공 내용 밖의 도움은 쓰지 않아요. 문장만 출력해요.");
            let out=ai.generate("reason", &[json!({"role":"system","content":system}),json!({"role":"user","content":facts})],Some(actor)).await;
            guarded(out.as_deref(), &[rule_reason,content,target,context], &[title],160)
        }).collect()).await
    }
    pub async fn reason(&mut self, resource: &Value, rule_reason: &str, context: &str) -> Option<String> {
        let typ = resource["type"].as_str().unwrap_or(""); let content = resource["content"].as_str().unwrap_or(""); let target = resource["target"].as_str().unwrap_or(""); let title = resource["title"].as_str().unwrap_or("");
        let facts = format!("경로 종류: {typ}\n제공 내용: {content}\n대상: {}\n규칙 이유: {rule_reason}\n사용자 상황: {context}", if resource["target"].is_null() { "확인 필요" } else { target });
        let system = format!("{RULES}\n이 경로가 사용자의 어떤 준비를 돕는지 한두 문장으로 써 주세요. 기관 이름과 '이 지역이라서'라는 이유는 쓰지 않아요. 주어진 제공 내용 밖의 도움은 쓰지 않아요. 문장만 출력해요.");
        let r = self.call("reason", &system, &facts, Some("reason")).await;
        guarded(r.text.as_deref(), &[rule_reason, content, target, context], &[title], 160)
    }
}
pub fn problem_context(p: Option<&Value>) -> String {
    match p { Some(p) => format!("선택한 문제: {} / 대상: {} / 상황: {} / 근거 수준: {}",p["title"].as_str().unwrap_or(""),p["affectedUser"].as_str().unwrap_or(""),p["situation"].as_str().unwrap_or(""),p["evidenceLevel"].as_str().unwrap_or("")), None => "선택한 문제 없음".into() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::ai::solar::create_text_ai;
    use crate::ports::{Env, HttpResp};
    use crate::testkit::{block_on, FakePorts};

    fn run(max: usize) -> (bool, bool, usize) { run_with(max, 200) }
    fn run_with(max: usize, status: u16) -> (bool, bool, usize) {
        let ports = FakePorts::default();
        // 물음표가 없어 검증을 통과하지 못하는 답 (status 가 200 이 아니면 AI 실패).
        *ports.fetch.borrow_mut() = Some(Box::new(move |_| Ok(HttpResp { status, headers: vec![], body: json!({"choices":[{"message":{"content":"지금은 어떻게 하고 계세요"}}]}).to_string().into_bytes() })));
        let mut env = Env::new();
        env.insert("AI_MODE".into(), "upstage".into());
        env.insert("UPSTAGE_API_KEY".into(), "k".into());
        let raw = create_text_ai(&env, &ports);
        let mut limiter = Limiter::new(max, 3_600_000);
        let mut ai = ExploreAi { ai: &raw, limiter: &mut limiter, actor_id: "u1", now: 0, local: HashSet::new() };
        let rules = vec![json!({"question":"지금은 어떻게 하고 계세요?","purpose":"현재 방식"})];
        let (_, changed, attempted) = block_on(ai.field(&rules, "상황"));
        let calls = ports.fetched.borrow().len();
        (changed, attempted, calls)
    }
    #[test]
    fn field_reports_an_attempt_even_when_nothing_changed() {
        assert_eq!(run(40), (false, true, 1));
    }
    #[test]
    fn field_reports_no_answer_when_the_ai_fails() {
        let (changed, answered, calls) = run_with(40, 503);
        assert_eq!((changed, answered), (false, false));
        assert!(calls >= 1);
    }
    #[test]
    fn field_reports_no_attempt_when_the_limit_is_used_up() {
        assert_eq!(run(0), (false, false, 0));
    }
}
