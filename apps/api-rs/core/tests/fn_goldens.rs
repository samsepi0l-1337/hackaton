//! TS 테스트에서 기록한 함수 골든을 재생한다 (apps/api-rs/goldens/fn/<모듈>.json).
//! 모듈 하나만: cargo test -p gil-core --test fn_goldens <모듈>
use serde_json::Value;

/// TS JSON 규칙으로 맞춘다: 객체의 undefined 키는 없앤다, 숫자는 f64 로 비교한다.
fn norm(v: &Value) -> Value {
    match v {
        Value::Object(m) if m.len() == 1 && m.get("$undef") == Some(&Value::Bool(true)) => Value::Null,
        Value::Object(m) => Value::Object(m.iter().filter(|(_, x)| !matches!(x, Value::Object(o) if o.len() == 1 && o.get("$undef") == Some(&Value::Bool(true)))).map(|(k, x)| (k.clone(), norm(x))).collect()),
        Value::Array(a) => Value::Array(a.iter().map(norm).collect()),
        Value::Number(n) => n.as_f64().map(|f| serde_json::json!(f)).unwrap_or(v.clone()),
        _ => v.clone(),
    }
}

fn run(module: &str) {
    let path = format!(
        "{}/../goldens/fn/{}.json",
        env!("CARGO_MANIFEST_DIR"),
        module
    );
    let doc: Value =
        serde_json::from_str(&std::fs::read_to_string(&path).expect("golden file")).unwrap();
    let cases = doc["cases"].as_array().unwrap();
    let mut fails = vec![];
    for (i, c) in cases.iter().enumerate() {
        let f = c["fn"].as_str().unwrap();
        let args = c["args"].as_array().unwrap();
        let got = gil_core::shared::golden::call(module, f, args);
        let want = norm(&c["out"]);
        match got {
            None => fails.push(format!("#{i} {f}: 옮기지 않음")),
            Some(g) if norm(&g) != want => fails.push(format!(
                "#{i} {f}({})\n  want {}\n  got  {}",
                Value::Array(args.clone()),
                want,
                norm(&g)
            )),
            _ => {}
        }
    }
    if !fails.is_empty() {
        let n = fails.len();
        let head: Vec<_> = fails.into_iter().take(8).collect();
        panic!("{module}: {n}/{} 실패\n{}", cases.len(), head.join("\n"));
    }
}

#[test]
fn account() {
    run("account");
}
#[test]
fn data() {
    run("data");
}
#[test]
fn date() {
    run("date");
}
#[test]
fn eligibility() {
    run("eligibility");
}
#[test]
fn explore_rules() {
    run("explore-rules");
}
#[test]
fn guard() {
    run("guard");
}
#[test]
fn kstartup_resource() {
    run("kstartup-resource");
}
#[test]
fn kstartup() {
    run("kstartup");
}
#[test]
fn likes() {
    run("likes");
}
#[test]
fn mentor() {
    run("mentor");
}
#[test]
fn profile() {
    run("profile");
}
#[test]
fn query() {
    run("query");
}
#[test]
fn recommend() {
    run("recommend");
}
#[test]
fn seed() {
    run("seed");
}
#[test]
fn type_test() {
    run("typeTest");
}
