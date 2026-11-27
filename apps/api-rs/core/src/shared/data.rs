//! TS 원본: packages/shared/src/data.ts
use serde_json::Value;
use std::sync::{OnceLock, RwLock};

#[derive(Clone)]
struct Data {
    problems: Vec<Value>,
    contexts: Vec<Value>,
    resources: Vec<Value>,
}
fn parse(s: &str) -> Vec<Value> {
    serde_json::from_str(s).unwrap_or_default()
}
fn shipped() -> Data {
    Data {
        problems: parse(include_str!(
            "../../../../../packages/shared/data/problems.json"
        )),
        contexts: parse(include_str!(
            "../../../../../packages/shared/data/contexts.json"
        )),
        resources: parse(include_str!(
            "../../../../../packages/shared/data/resources.json"
        )),
    }
}
fn store() -> &'static RwLock<Data> {
    static DATA: OnceLock<RwLock<Data>> = OnceLock::new();
    DATA.get_or_init(|| RwLock::new(shipped()))
}
fn current() -> Data {
    store().read().unwrap_or_else(|e| e.into_inner()).clone()
}
/// TS: `PROBLEMS: ProblemCard[]`.
pub fn problems() -> Vec<Value> {
    current().problems
}
/// TS: `CONTEXTS: RegionalContext[]`.
pub fn contexts() -> Vec<Value> {
    current().contexts
}
/// TS: `RESOURCES: Resource[]`.
pub fn resources() -> Vec<Value> {
    current().resources
}
/// TS: `EXPLORE_DATA_VERSION`.
pub fn data_version() -> String {
    super::explore::EXPLORE_DATA_VERSION.to_owned()
}
/// 테스트 전용: 자료를 바꿔 넣는다.
/// TS: `replaceExploreData(d: { problems?: ProblemCard[]; contexts?: RegionalContext[]; resources?: Resource[] }): void`.
pub fn replace_explore_data(d: &Value) {
    let mut data = store().write().unwrap_or_else(|e| e.into_inner());
    if let Some(v) = d.get("problems").and_then(Value::as_array) {
        data.problems = v.clone();
    }
    if let Some(v) = d.get("contexts").and_then(Value::as_array) {
        data.contexts = v.clone();
    }
    if let Some(v) = d.get("resources").and_then(Value::as_array) {
        data.resources = v.clone();
    }
}
/// 테스트 전용 자료를 사용한다.
pub fn use_test_fixtures() {
    let data = Data {
        problems: parse(include_str!(
            "../../../../../packages/shared/test/fixtures/problems.json"
        )),
        contexts: parse(include_str!(
            "../../../../../packages/shared/test/fixtures/contexts.json"
        )),
        resources: parse(include_str!(
            "../../../../../packages/shared/test/fixtures/resources.json"
        )),
    };
    *store().write().unwrap_or_else(|e| e.into_inner()) = data;
}
/// TS: `brokenReferences(problems = PROBLEMS, contexts = CONTEXTS, resources = RESOURCES): string[]`.
pub fn broken_references(
    problems: &[Value],
    contexts: &[Value],
    resources: &[Value],
) -> Vec<String> {
    let mut out = Vec::new();
    for (index, record) in problems.iter().chain(resources).enumerate() {
        let fields: &[(&str, &[Value])] = if index < problems.len() {
            &[("contextIds", contexts), ("resourceIds", resources)]
        } else {
            &[("contextIds", contexts)]
        };
        for (field, targets) in fields {
            if let Some(ids) = record.get(field).and_then(Value::as_array) {
                for id in ids {
                    if !targets.iter().any(|v| v.get("id") == Some(id)) {
                        out.push(format!(
                            "{}→{}",
                            record
                                .get("id")
                                .and_then(Value::as_str)
                                .unwrap_or("undefined"),
                            id.as_str().unwrap_or("undefined")
                        ));
                    }
                }
            }
        }
    }
    // TS processes both reference kinds for each problem before the next problem.
    out
}
/// 함수 골든.
pub fn golden(f: &str, args: &[Value]) -> Option<Value> {
    if f != "brokenReferences" {
        return None;
    }
    let data = current();
    let get = |i: usize, default: Vec<Value>| {
        args.get(i)
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or(default)
    };
    Some(serde_json::json!(broken_references(
        &get(0, data.problems),
        &get(1, data.contexts),
        &get(2, data.resources)
    )))
}
