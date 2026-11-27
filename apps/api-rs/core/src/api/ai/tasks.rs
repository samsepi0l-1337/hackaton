//! 작업별 AI 호출 + 사실 검사 + 규칙 대체.
use super::{
    decide::{create_decide, Decide},
    prompts::{DOC_SUMMARY_PROMPT, SYSTEM_PROMPTS},
    solar::{create_text_ai, TextAi},
};
use crate::{
    jsstr,
    ports::{Env, Ports},
    shared::{
        date::d_day_label,
        guard::{guard_text, parse_json},
    },
};
use serde_json::{json, Map, Value};
use std::future::Future;

/// `DOC_SUMMARY_INPUT_CHARS: number`
pub const DOC_SUMMARY_INPUT_CHARS: usize = 12_000;
fn s<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}
fn nonblank(v: &Value) -> Option<&str> {
    v.as_str().filter(|s| !s.trim().is_empty())
}
fn prompt(task: &str) -> &'static str {
    SYSTEM_PROMPTS
        .iter()
        .find(|(k, _)| *k == task)
        .map(|(_, v)| *v)
        .unwrap_or("")
}
fn messages(task: &str, user: String) -> Vec<Value> {
    vec![
        json!({"role":"system","content":if task == "extract" { DOC_SUMMARY_PROMPT } else { prompt(task) }}),
        json!({"role":"user","content":user}),
    ]
}
fn needs(profile: &Value) -> String {
    profile
        .get("needs")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default()
}

pub struct AiTasks<'a> {
    pub mode: &'static str,
    pub raw: TextAi<'a>,
    pub decide_enabled: bool,
    decide: Decide<'a>,
    ports: &'a dyn Ports,
}
/// `createAiTasks(env: Partial<Bindings> = {}, deps: AiDeps = {}): AiTasks`
pub fn create_ai_tasks<'a>(env: &'a Env, ports: &'a dyn Ports) -> AiTasks<'a> {
    let raw = create_text_ai(env, ports);
    let decide = create_decide(env, ports);
    AiTasks {
        mode: raw.mode,
        decide_enabled: decide.enabled,
        raw,
        decide,
        ports,
    }
}
impl AiTasks<'_> {
    /// `rank(stateText: string, choices: DecideChoice[], instructions: string): Promise<Record<string, number> | null>`
    pub async fn rank(&self, state: &str, choices: &[Value], instructions: &str) -> Option<Value> {
        self.decide.rank(state, choices, instructions).await
    }
    /// `mentorQuestion(base: string, lastAnswer: string, userId?: string): Promise<string>`
    pub async fn mentor_question(
        &self,
        base: &str,
        last_answer: &str,
        user_id: Option<&str>,
    ) -> String {
        let out = self
            .raw
            .generate(
                "mentor",
                &messages(
                    "mentor",
                    format!(
                        "질문: {base}\n사용자의 직전 답: {}",
                        if last_answer.is_empty() {
                            "(없음)"
                        } else {
                            last_answer
                        }
                    ),
                ),
                user_id,
            )
            .await;
        guard_text(
            out.as_deref(),
            &json!({"allowedText":[base,last_answer],"maxLength":200}),
        )
        .unwrap_or_else(|| base.into())
    }
    /// `summary(profile: ConsultProfile, answers: string[], userId?: string): Promise<IdeaSummary | null>`
    pub async fn summary(
        &self,
        profile: &Value,
        answers: &[String],
        user_id: Option<&str>,
    ) -> Option<Value> {
        let profile_text = profile.to_string();
        let out = self
            .raw
            .generate(
                "summary",
                &messages(
                    "summary",
                    format!("프로필: {profile_text}\n답변:\n{}", answers.join("\n")),
                ),
                user_id,
            )
            .await;
        let j = parse_json(out.as_deref());
        let Some(obj) = j.as_object() else {
            if out.is_some() {
                self.ports
                    .log("warn", "[ai] summary JSON 파싱 실패, 규칙 요약을 씁니다");
            }
            return None;
        };
        let mut allowed = vec![profile_text];
        allowed.extend_from_slice(answers);
        let mut res = Map::new();
        for k in ["problem", "customer", "solution", "revenue", "busan"] {
            let v = obj.get(k).filter(|v| !v.is_null()).or_else(|| {
                obj.iter()
                    .find(|(key, _)| key.to_lowercase().contains(k))
                    .map(|(_, v)| v)
            });
            let Some(v) = v.and_then(nonblank) else {
                self.ports.log(
                    "warn",
                    &format!("[ai] summary.{k} 비어 있음, 규칙 요약을 씁니다"),
                );
                return None;
            };
            let Some(g) = guard_text(Some(v), &json!({"allowedText":allowed,"maxLength":400}))
            else {
                self.ports.log(
                    "warn",
                    &format!("[ai] summary.{k} 사실 검사 탈락, 규칙 요약을 씁니다"),
                );
                return None;
            };
            res.insert(k.into(), json!(g));
        }
        Some(Value::Object(res))
    }
    /// `relevance(profile: ConsultProfile, candidates: Program[]): Promise<Record<string, number> | null>`
    pub async fn relevance(&self, profile: &Value, candidates: &[Value]) -> Option<Value> {
        self.decide
            .relevance(
                &format!(
                    "아이디어: {}\n문제: {}\n고객: {}\n업종: {}\n필요한 지원: {}",
                    s(profile, "idea"),
                    s(profile, "problem"),
                    s(profile, "customerDesc"),
                    s(profile, "industry"),
                    needs(profile)
                ),
                candidates,
            )
            .await
    }
    /// `reasons(top: Recommendation[], profile: ConsultProfile, now: Date, userId?: string): Promise<Recommendation[]>`
    pub async fn reasons(
        &self,
        top: &[Value],
        profile: &Value,
        _now: i64,
        user_id: Option<&str>,
    ) -> Vec<Value> {
        if self.mode == "off" {
            return top.to_vec();
        }
        let mut pending: Vec<_> = top.iter().map(|r| Some(Box::pin(async move {
            let p = &r["program"]; let label = d_day_label(r.get("dDay").and_then(Value::as_f64));
            let facts = format!("공고: {}\n분야: {}\n기관: {}\n마감: {label}\n규칙 근거: {}\n사용자 아이디어: {}",s(p,"title"),s(p,"category"),s(p,"agency"),s(r,"reason"),s(profile,"idea"));
            let out = self.raw.generate("reason",&messages("reason",facts),user_id).await;
            let g = guard_text(out.as_deref(),&json!({"programs":[p],"allowedText":[s(r,"reason"),profile.to_string(),label],"maxLength":160}));
            let mut item = r.clone(); if let (Some(g),Some(obj)) = (g,item.as_object_mut()) { obj.insert("reason".into(),json!(g)); } item
        }))).collect();
        let mut result = vec![None; pending.len()];
        std::future::poll_fn(|cx| {
            for (i, future) in pending.iter_mut().enumerate() {
                if let Some(f) = future {
                    if let std::task::Poll::Ready(value) = f.as_mut().poll(cx) {
                        result[i] = Some(value);
                        *future = None;
                    }
                }
            }
            if pending.iter().all(Option::is_none) {
                std::task::Poll::Ready(())
            } else {
                std::task::Poll::Pending
            }
        })
        .await;
        result.into_iter().flatten().collect()
    }
    /// `plan(rule: PlanItem[], top: Recommendation[], profile: ConsultProfile, userId?: string): Promise<PlanItem[] | null>`
    pub async fn plan(
        &self,
        rule: &[Value],
        top: &[Value],
        profile: &Value,
        user_id: Option<&str>,
    ) -> Option<Vec<Value>> {
        let first = rule.first()?;
        let titles = top
            .iter()
            .map(|r| s(&r["program"], "title"))
            .collect::<Vec<_>>()
            .join(" / ");
        let out = self
            .raw
            .generate(
                "prep",
                &messages(
                    "prep",
                    format!(
                        "1일차: {}\n아이디어: {}\n필요한 지원: {}\n참고 공고: {titles}",
                        s(first, "task"),
                        s(profile, "idea"),
                        needs(profile)
                    ),
                ),
                user_id,
            )
            .await;
        let j = parse_json(out.as_deref());
        let arr = j.as_array().filter(|a| a.len() == 7)?;
        let programs: Vec<&Value> = top.iter().map(|r| &r["program"]).collect();
        let mut res = Vec::new();
        for (i, it) in arr.iter().enumerate() {
            if it.get("day").and_then(Value::as_u64) != Some((i + 1) as u64) {
                return None;
            }
            let task = it.get("task").and_then(nonblank)?;
            if i == 0 {
                res.push(first.clone());
                continue;
            }
            let g = guard_text(
                Some(task),
                &json!({"programs":programs,"allowedText":[profile.to_string(),s(first,"task")],"maxLength":120}),
            )?;
            res.push(json!({"day":i+1,"task":g,"done":false}));
        }
        Some(res)
    }
    /// `docSummary(doc: ParsedDocument, userId?: string): Promise<string | null>`
    pub async fn doc_summary(&self, doc: &Value, user_id: Option<&str>) -> Option<String> {
        let text = s(doc, "text");
        let name = s(doc, "fileName");
        if self.mode == "off" || text.trim().is_empty() {
            return None;
        }
        let out = self
            .raw
            .generate(
                "extract",
                &messages(
                    "extract",
                    format!(
                        "파일: {name}\n본문:\n{}",
                        jsstr::take16(text, DOC_SUMMARY_INPUT_CHARS)
                    ),
                ),
                user_id,
            )
            .await;
        let g = guard_text(
            out.as_deref(),
            &json!({"allowedText":[text,name],"maxLength":1500}),
        );
        if out.is_some() && g.is_none() {
            self.ports.log(
                "warn",
                "[ai] 문서 정리 사실 검사 탈락, 정리 없이 저장합니다",
            );
        }
        g.map(|g| {
            let re = fancy_regex::Regex::new(
                r"\s+(?=(?:지원 내용|신청 기간|제출 서류|신청 양식 항목):)",
            );
            match re {
                Ok(re) => re.replace_all(&g, "\n").into_owned(),
                Err(_) => g,
            }
        })
    }
    /// `draft(fields: FormField[], profile: ConsultProfile, program: Program, userId?: string): Promise<FormField[]>`
    pub async fn draft(
        &self,
        fields: &[Value],
        profile: &Value,
        program: &Value,
        user_id: Option<&str>,
    ) -> Vec<Value> {
        let open: Vec<&Value> = fields
            .iter()
            .filter(|f| !f.get("identity").and_then(Value::as_bool).unwrap_or(false))
            .collect();
        if self.mode == "off" || open.is_empty() {
            return fields.to_vec();
        }
        let descriptors: Vec<Value> = open
            .iter()
            .map(|f| {
                let mut m = Map::new();
                for (dst, src) in [
                    ("key", "key"),
                    ("label", "label"),
                    ("maxLength", "maxLength"),
                    ("current", "value"),
                ] {
                    if let Some(v) = f.get(src) {
                        m.insert(dst.into(), v.clone());
                    }
                }
                Value::Object(m)
            })
            .collect();
        let out = self
            .raw
            .generate(
                "draft",
                &messages(
                    "draft",
                    format!(
                        "프로필: {}\n공고: {}\n항목: {}",
                        profile,
                        json!({"title":program["title"],"target":program["target"],"content":program["content"]}),
                        json!(descriptors)
                    ),
                ),
                user_id,
            )
            .await;
        let j = parse_json(out.as_deref());
        let Some(obj) = j.as_object() else {
            return fields.to_vec();
        };
        fields.iter().map(|f| {
            let mut result = f.clone(); let identity = f.get("identity").and_then(Value::as_bool).unwrap_or(false);
            if !identity { if let Some(v) = obj.get(s(f,"key")).and_then(nonblank) {
                let max = f.get("maxLength").and_then(Value::as_u64).unwrap_or(500) as usize;
                if let Some(g) = guard_text(Some(v),&json!({"programs":[program],"allowedText":[profile.to_string(),s(f,"value")],"maxLength":max})) {
                    if let Some(m) = result.as_object_mut() { m.insert("value".into(),json!(if f.get("maxLength").is_some_and(|x| !x.is_null()) { jsstr::take16(&g,max) } else { g })); }
                }
            } }
            result
        }).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        ports::HttpResp,
        testkit::{block_on, FakePorts},
    };
    #[test]
    fn mentor_and_summary_use_guard_and_fallback() {
        let env = Env::from([
            ("AI_MODE".into(), "upstage".into()),
            ("UPSTAGE_API_KEY".into(), "k".into()),
        ]);
        let ports = FakePorts::default();
        *ports.fetch.borrow_mut() = Some(Box::new(|req| {
            let body: Value = serde_json::from_slice(req.body.as_ref().unwrap()).unwrap();
            let content = if body["model"] == "solar-pro-4" {
                r#"{"problem":"문제예요","customer":"고객이에요","solution":"해결이에요","revenue":"수익이에요","busan":"부산이에요"}"#
            } else {
                "좋아요, 어떤 고객이 떠오르세요?"
            };
            Ok(HttpResp {
                status: 200,
                headers: vec![],
                body: json!({"choices":[{"message":{"content":content}}]})
                    .to_string()
                    .into_bytes(),
            })
        }));
        let tasks = create_ai_tasks(&env, &ports);
        assert_eq!(
            block_on(tasks.mentor_question("고객은?", "", None)),
            "좋아요, 어떤 고객이 떠오르세요?"
        );
        let summary = block_on(tasks.summary(&json!({}), &[], None)).unwrap();
        assert_eq!(summary["problem"], "문제예요");
        let off = create_ai_tasks(&Env::new(), &ports).mode;
        assert_eq!(off, "off");
    }
}

#[cfg(test)]
mod adapter_tests {
    use super::*;
    use crate::{
        api::ai::solar::create_text_ai,
        ports::HttpResp,
        testkit::{block_on, FakePorts},
    };
    #[test]
    fn off_direct_gateway_and_http_failure() {
        let ports = FakePorts::default();
        let off = Env::new();
        assert_eq!(
            block_on(create_text_ai(&off, &ports).generate("reason", &[], None)),
            None
        );
        assert!(ports.fetched.borrow().is_empty());
        let direct = Env::from([
            ("AI_MODE".into(), "upstage".into()),
            ("UPSTAGE_API_KEY".into(), "k".into()),
            ("CF_AIG_TOKEN".into(), "t".into()),
        ]);
        *ports.fetch.borrow_mut() = Some(Box::new(|_| {
            Ok(HttpResp {
                status: 200,
                headers: vec![],
                body: json!({"choices":[{"message":{"content":" 안녕 "}}]})
                    .to_string()
                    .into_bytes(),
            })
        }));
        assert_eq!(
            block_on(create_text_ai(&direct, &ports).generate("reason", &[], None)).as_deref(),
            Some("안녕")
        );
        assert_eq!(
            block_on(create_text_ai(&direct, &ports).generate("summary", &[], None)).as_deref(),
            Some("안녕")
        );
        let reqs = ports.fetched.borrow();
        assert_eq!(reqs[0].url, "https://api.upstage.ai/v1/chat/completions");
        assert!(reqs[0]
            .headers
            .contains(&("authorization".into(), "Bearer k".into())));
        let body: Value = serde_json::from_slice(reqs[1].body.as_ref().unwrap()).unwrap();
        assert_eq!(body["model"], "solar-pro-4");
        drop(reqs);
        let gateway = Env::from([
            ("AI_MODE".into(), "upstage".into()),
            ("CF_AIG_TOKEN".into(), "t".into()),
            (
                "UPSTAGE_BASE_URL".into(),
                "https://gateway.ai.cloudflare.com/v1/a/g/custom-upstage".into(),
            ),
        ]);
        assert_eq!(
            block_on(create_text_ai(&gateway, &ports).generate("mentor", &[], Some("g-1")))
                .as_deref(),
            Some("안녕")
        );
        let reqs = ports.fetched.borrow();
        assert!(reqs[2]
            .headers
            .contains(&("cf-aig-authorization".into(), "Bearer t".into())));
        drop(reqs);
        *ports.fetch.borrow_mut() = Some(Box::new(|_| {
            Ok(HttpResp {
                status: 500,
                headers: vec![],
                body: vec![],
            })
        }));
        assert_eq!(
            block_on(create_text_ai(&direct, &ports).generate("reason", &[], None)),
            None
        );
    }
}
