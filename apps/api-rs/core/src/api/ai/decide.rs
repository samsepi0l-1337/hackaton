//! Solar Decide 관련도. 실패하면 규칙 점수를 쓴다.
use super::{
    solar::resolve_mode,
    upstage::{upstage_headers, upstage_ready},
};
use crate::{
    jsstr,
    ports::{Env, HttpReq, Ports},
    shared::cloudflare::*,
};
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;

/// `normalizeByMax(probs: Record<string, number>): Record<string, number>`
pub fn normalize_by_max(probs: &Map<String, Value>) -> Map<String, Value> {
    let max = probs
        .values()
        .filter_map(Value::as_f64)
        .fold(f64::NEG_INFINITY, f64::max);
    if max <= 0.0 || max.is_nan() {
        return Map::new();
    }
    probs
        .iter()
        .filter_map(|(k, v)| {
            v.as_f64()
                .map(|n| (k.clone(), json!((n / max).clamp(0.0, 1.0))))
        })
        .collect()
}
fn clip(s: &str, n: usize) -> String {
    if jsstr::len16(s) > n {
        format!("{}…", jsstr::take16(s, n))
    } else {
        s.into()
    }
}
pub struct Decide<'a> {
    pub enabled: bool,
    env: &'a Env,
    ports: &'a dyn Ports,
}
/// `createDecide(env: Partial<Bindings> = {}, deps: AiDeps = {}): Decide`
pub fn create_decide<'a>(env: &'a Env, ports: &'a dyn Ports) -> Decide<'a> {
    Decide {
        enabled: resolve_mode(env) != "off"
            && upstage_ready(env)
            && env.get("DECIDE_ENABLED").is_some_and(|s| s == "1"),
        env,
        ports,
    }
}
impl Decide<'_> {
    /// `rank(stateText: string, choices: DecideChoice[], instructions: string): Promise<Record<string, number> | null>`
    pub async fn rank(&self, state: &str, choices: &[Value], instructions: &str) -> Option<Value> {
        let list = &choices[..choices.len().min(DECIDE_MAX_CHOICES as usize)];
        if !self.enabled || list.len() < 2 {
            return None;
        }
        let mut criteria = Map::new();
        for p in list {
            criteria.insert(
                p["id"].as_str().unwrap_or("").into(),
                json!(clip(p["text"].as_str().unwrap_or(""), 240)),
            );
        }
        let base = self
            .env
            .get("UPSTAGE_BASE_URL")
            .filter(|s| !s.is_empty())
            .map(String::as_str)
            .unwrap_or(UPSTAGE_BASE_URL)
            .trim_end_matches('/');
        let mut extra = BTreeMap::new();
        extra.insert("content-type".into(), "application/json".into());
        extra.insert(
            "cf-aig-metadata".into(),
            json!({"app":"gil","task":"decide","user_id":"server"}).to_string(),
        );
        let req = HttpReq { method:"POST".into(), url:format!("{base}/systemone"), headers:upstage_headers(self.env,&extra).into_iter().collect(), body:Some(json!({"model":DECIDE_MODEL,"state":clip(state,2000),"questions":{"fit":{"type":"choice","instructions":instructions,"criteria":criteria}}}).to_string().into_bytes()), timeout_ms:Some(u64::from(DECIDE_TIMEOUT_MS)), ..Default::default() };
        for attempt in 1..=DECIDE_ATTEMPTS {
            let result = match self.ports.fetch(req.clone()).await {
                Ok(r) if !r.ok() => Err(format!("http {}", r.status)),
                Ok(r) => match r.json() {
                    Some(v)
                        if v.pointer("/answers/fit/probabilities")
                            .is_some_and(|p| p.is_object() || p.is_array()) =>
                    {
                        Ok(v)
                    }
                    _ => Err("no probabilities".into()),
                },
                Err(e) => Err(e),
            };
            match result {
                Ok(v) => {
                    let mut clean = Map::new();
                    for p in list {
                        if let Some(id) = p["id"].as_str() {
                            if let Some(n) = v
                                .pointer("/answers/fit/probabilities")
                                .and_then(|x| x.get(id))
                                .and_then(Value::as_f64)
                                .filter(|n| n.is_finite())
                            {
                                clean.insert(id.into(), json!(n));
                            }
                        }
                    }
                    let out = normalize_by_max(&clean);
                    return if out.is_empty() {
                        None
                    } else {
                        Some(Value::Object(out))
                    };
                }
                Err(e) => {
                    if attempt == DECIDE_ATTEMPTS
                        || !(e.contains("timeout") || e.contains("http 5"))
                    {
                        self.ports.log(
                            "warn",
                            &format!("[ai] decide 실패, 규칙 점수를 씁니다: {e}"),
                        );
                        return None;
                    }
                }
            }
        }
        None
    }
    /// `relevance(stateText: string, candidates: Program[]): Promise<Record<string, number> | null>`
    pub async fn relevance(&self, state: &str, candidates: &[Value]) -> Option<Value> {
        let choices: Vec<Value> = candidates.iter().map(|p| json!({"id":p["id"],"text":format!("{} / {} / {}", p["title"].as_str().unwrap_or(""),p["category"].as_str().unwrap_or(""),p["content"].as_str().unwrap_or(""))})).collect();
        self.rank(
            state,
            &choices,
            "예비 창업자의 아이디어와 가장 관련이 큰 지원사업을 고르세요.",
        )
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ports::HttpResp;
    use crate::testkit::{block_on, FakePorts};
    #[test]
    fn normalization_and_request() {
        assert_eq!(
            normalize_by_max(json!({"a":0.2,"b":0.4}).as_object().unwrap()),
            *json!({"a":0.5,"b":1.0}).as_object().unwrap()
        );
        assert!(normalize_by_max(json!({"a":0}).as_object().unwrap()).is_empty());
        let env = Env::from([
            ("AI_MODE".into(), "upstage".into()),
            ("UPSTAGE_API_KEY".into(), "k".into()),
            ("DECIDE_ENABLED".into(), "1".into()),
        ]);
        let ports = FakePorts::default();
        *ports.fetch.borrow_mut() = Some(Box::new(|_| {
            Ok(HttpResp {
                status: 200,
                headers: vec![],
                body: json!({"answers":{"fit":{"probabilities":{"a":0.1,"b":0.3}}}})
                    .to_string()
                    .into_bytes(),
            })
        }));
        let choices = vec![
            json!({"id":"a","text":"첫째"}),
            json!({"id":"b","text":"둘째"}),
        ];
        let out = block_on(create_decide(&env, &ports).rank("상태", &choices, "선택"));
        assert_eq!(out, Some(json!({"a":0.1/0.3,"b":1.0})));
        let fetched = ports.fetched.borrow();
        assert!(fetched[0].url.ends_with("/systemone"));
        let body: Value = serde_json::from_slice(fetched[0].body.as_ref().unwrap()).unwrap();
        assert_eq!(body["model"], DECIDE_MODEL);
        assert_eq!(
            body["questions"]["fit"]["criteria"],
            json!({"a":"첫째","b":"둘째"})
        );
    }
}

#[cfg(test)]
mod retry_tests {
    use super::*;
    use crate::{
        ports::HttpResp,
        testkit::{block_on, FakePorts},
    };
    use std::{cell::Cell, rc::Rc};
    #[test]
    fn retries_server_errors_but_not_client_errors() {
        let env = Env::from([
            ("AI_MODE".into(), "upstage".into()),
            ("UPSTAGE_API_KEY".into(), "k".into()),
            ("DECIDE_ENABLED".into(), "1".into()),
        ]);
        let ports = FakePorts::default();
        let count = Rc::new(Cell::new(0));
        let n = count.clone();
        *ports.fetch.borrow_mut() = Some(Box::new(move |_| {
            n.set(n.get() + 1);
            Ok(HttpResp {
                status: if n.get() == 1 { 503 } else { 200 },
                headers: vec![],
                body: json!({"answers":{"fit":{"probabilities":{"a":0.2,"b":0.8}}}})
                    .to_string()
                    .into_bytes(),
            })
        }));
        let candidates = vec![
            json!({"id":"a","title":"A","category":"c","content":""}),
            json!({"id":"b","title":"B","category":"c","content":""}),
        ];
        assert_eq!(
            block_on(create_decide(&env, &ports).relevance("s", &candidates)),
            Some(json!({"a":0.25,"b":1.0}))
        );
        assert_eq!(count.get(), 2);
        *ports.fetch.borrow_mut() = Some(Box::new(|_| {
            Ok(HttpResp {
                status: 403,
                headers: vec![],
                body: vec![],
            })
        }));
        let before = ports.fetched.borrow().len();
        assert_eq!(
            block_on(create_decide(&env, &ports).relevance("s", &candidates)),
            None
        );
        assert_eq!(ports.fetched.borrow().len(), before + 1);
    }
}
