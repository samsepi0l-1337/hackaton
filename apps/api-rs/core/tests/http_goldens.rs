//! TS API 테스트에서 기록한 요청·응답 골든을 Rust core 에 재생한다 (apps/api-rs/goldens/http/<테스트 파일>.json).
//! 시나리오 = TS setup() 하나. 가짜 fetch·doc-worker·저장소를 주입한 시나리오는 건너뛴다 (보고에 개수).
//! 토큰·id 처럼 매번 다른 값은 TS 응답과 Rust 응답의 같은 자리를 짝지어 대응표를 만들고, 다음 요청에서 바꿔 넣는다.
//! 파일 하나만: cargo test -p gil-core --test http_goldens <파일>
use gil_core::app::AppOpts;
use gil_core::ports::Env;
use gil_core::testkit::{Client, TestApp};
use serde_json::Value;
use std::collections::HashMap;

fn volatile(s: &str) -> bool {
    let hexrun = s
        .chars()
        .fold((0usize, 0usize), |(cur, best), c| {
            if c.is_ascii_hexdigit() && !c.is_ascii_uppercase() {
                (cur + 1, best.max(cur + 1))
            } else {
                (0, best)
            }
        })
        .1;
    hexrun >= 24 || s.starts_with("MOCK-") || is_uuid(s)
}

/// crypto.randomUUID() 꼴 (8-4-4-4-12 소문자 hex). 매번 다른 값이다.
fn is_uuid(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    parts.len() == 5
        && parts.iter().zip([8, 4, 4, 4, 12]).all(|(p, n)| {
            p.len() == n
                && p.chars()
                    .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        })
}

/// TS 와 Rust 값을 비교한다. 매번 다른 문자열은 대응표에 넣고 같다고 본다.
fn same(
    ts: &Value,
    rs: &Value,
    map: &mut HashMap<String, String>,
    at: &str,
    diffs: &mut Vec<String>,
) {
    match (ts, rs) {
        (Value::String(a), Value::String(b)) if volatile(a) => match map.get(a) {
            Some(m) if m != b => diffs.push(format!("{at}: {a} 는 {m} 이어야 하는데 {b}")),
            _ => {
                map.insert(a.clone(), b.clone());
            }
        },
        (Value::Object(a), Value::Object(b)) => {
            for (k, v) in a {
                match b.get(k) {
                    Some(w) => same(v, w, map, &format!("{at}.{k}"), diffs),
                    None => diffs.push(format!("{at}.{k}: Rust 에 없음 (TS {v})")),
                }
            }
            for k in b.keys() {
                if !a.contains_key(k) {
                    diffs.push(format!("{at}.{k}: TS 에 없음 (Rust {})", b[k]));
                }
            }
        }
        (Value::Array(a), Value::Array(b)) => {
            if a.len() != b.len() {
                diffs.push(format!("{at}: 길이 {} != {}", a.len(), b.len()));
            }
            for (i, (x, y)) in a.iter().zip(b).enumerate() {
                same(x, y, map, &format!("{at}[{i}]"), diffs);
            }
        }
        (Value::Number(a), Value::Number(b)) if a.as_f64() == b.as_f64() => {}
        _ if ts == rs => {}
        _ => diffs.push(format!("{at}: TS {ts} != Rust {rs}")),
    }
}

fn subst(v: &Value, map: &HashMap<String, String>) -> Value {
    match v {
        Value::String(s) => Value::String(subst_str(s, map)),
        Value::Array(a) => Value::Array(a.iter().map(|x| subst(x, map)).collect()),
        Value::Object(o) => {
            Value::Object(o.iter().map(|(k, x)| (k.clone(), subst(x, map))).collect())
        }
        _ => v.clone(),
    }
}
fn subst_str(s: &str, map: &HashMap<String, String>) -> String {
    let mut out = s.to_string();
    for (a, b) in map {
        if out.contains(a.as_str()) {
            out = out.replace(a.as_str(), b);
        }
    }
    out
}

/// 메일 본문에서 매번 다른 값(링크 토큰, 6자리 코드, 복구 비밀번호)을 뽑는다.
fn mail_secrets(text: &str) -> Vec<String> {
    let mut v = vec![];
    if let Some(i) = text.find("/verify?token=") {
        v.push(
            text[i + 14..]
                .split_whitespace()
                .next()
                .unwrap_or("")
                .to_string(),
        );
    }
    let re = regex::Regex::new(r"인증 코드 (\d{6})|복구 비밀번호[^:：]*[:：]\s*(\S+)").unwrap();
    for c in re.captures_iter(text) {
        for g in [1, 2] {
            if let Some(m) = c.get(g) {
                v.push(m.as_str().to_string());
            }
        }
    }
    v
}

fn run(file: &str) {
    let path = format!(
        "{}/../goldens/http/{}.json",
        env!("CARGO_MANIFEST_DIR"),
        file
    );
    let scenarios: Vec<Value> =
        serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    let (mut ran, mut skipped, mut failed) = (0, 0, vec![]);
    for sc in &scenarios {
        let o = &sc["opts"];
        if o["custom"]
            .as_array()
            .map(|a| !a.is_empty())
            .unwrap_or(false)
        {
            skipped += 1;
            continue;
        }
        ran += 1;
        let mut env = Env::new();
        if let Some(m) = o["env"].as_object() {
            for (k, v) in m {
                if let Some(s) = v.as_str() {
                    env.insert(k.clone(), s.into());
                }
            }
        }
        let opts = AppOpts {
            seed_users: true,
            consult_limit: o["consultLimit"].as_object().map(|c| {
                (
                    c.get("count").and_then(|x| x.as_u64()).unwrap_or(3) as u32,
                    c.get("windowDays").and_then(|x| x.as_u64()).unwrap_or(7) as u32,
                )
            }),
            explore_ai_limit: o["exploreAiLimit"].as_u64().map(|x| x as u32),
            fail_submit: o["failSubmit"].as_bool().unwrap_or(false),
            ..Default::default()
        };
        let mut app = TestApp::with(env, opts);
        let mut clients: HashMap<u64, Client> = HashMap::new();
        let mut map: HashMap<String, String> = HashMap::new();
        let mut mails_seen = 0;
        for (i, st) in sc["steps"].as_array().unwrap().iter().enumerate() {
            let cid = st["client"].as_u64().unwrap_or(0);
            let client = clients.entry(cid).or_insert_with(|| app.client());
            app.now = gil_core::jsstr::parse_ms(st["now"].as_str().unwrap()).unwrap();
            let method = st["method"].as_str().unwrap();
            let p = subst_str(st["path"].as_str().unwrap(), &map);
            let body = if st["body"].is_null() {
                None
            } else {
                Some(subst(&st["body"], &map))
            };
            let (status, resp, cookies) = app.call(client, method, &p, body);
            let mut diffs = vec![];
            if status != st["status"].as_u64().unwrap() as u16 {
                diffs.push(format!("status TS {} != Rust {}", st["status"], status));
            }
            same(&st["response"], &resp, &mut map, "body", &mut diffs);
            let ts_cookies: Vec<String> = st["setCookie"]
                .as_array()
                .unwrap()
                .iter()
                .map(|c| c.as_str().unwrap().to_string())
                .collect();
            if ts_cookies.len() != cookies.len() {
                diffs.push(format!("set-cookie TS {ts_cookies:?} != Rust {cookies:?}"));
            }
            for (a, b) in ts_cookies.iter().zip(&cookies) {
                let (an, aa) = a.split_once(';').unwrap_or((a, ""));
                let (bn, ba) = b.split_once(';').unwrap_or((b, ""));
                let (ak, av) = an.split_once('=').unwrap_or((an, ""));
                let (bk, bv) = bn.split_once('=').unwrap_or((bn, ""));
                if ak != bk || aa != ba || av.is_empty() != bv.is_empty() {
                    diffs.push(format!("set-cookie TS {a} != Rust {b}"));
                }
            }
            let rs_mails = app.ports.mails.borrow()[mails_seen..].to_vec();
            mails_seen = app.ports.mails.borrow().len();
            let ts_mails = st["mails"].as_array().unwrap();
            if ts_mails.len() != rs_mails.len() {
                diffs.push(format!(
                    "mails TS {} != Rust {}",
                    ts_mails.len(),
                    rs_mails.len()
                ));
            }
            for (tm, rm) in ts_mails.iter().zip(&rs_mails) {
                if tm["to"] != rm.to.as_str() || tm["subject"] != rm.subject.as_str() {
                    diffs.push(format!(
                        "mail TS {}/{} != Rust {}/{}",
                        tm["to"], tm["subject"], rm.to, rm.subject
                    ));
                }
                let (a, b) = (
                    mail_secrets(tm["text"].as_str().unwrap()),
                    mail_secrets(&rm.text),
                );
                for (x, y) in a.iter().zip(&b) {
                    map.insert(x.clone(), y.clone());
                }
                if subst_str(tm["text"].as_str().unwrap(), &map) != rm.text {
                    diffs.push(format!(
                        "mail text TS {:?} != Rust {:?}",
                        tm["text"], rm.text
                    ));
                }
            }
            if !diffs.is_empty() {
                failed.push(format!(
                    "{} 단계 {i} {method} {p}\n    {}",
                    sc["name"].as_str().unwrap_or("?"),
                    diffs.into_iter().take(6).collect::<Vec<_>>().join("\n    ")
                ));
                break;
            }
        }
    }
    eprintln!("{file}: 시나리오 {ran} 재생, {skipped} 건너뜀 (주입된 fetch·doc-worker·저장소)");
    if !failed.is_empty() {
        panic!(
            "{file}: {}/{ran} 실패\n{}",
            failed.len(),
            failed.into_iter().take(5).collect::<Vec<_>>().join("\n")
        );
    }
}

#[test]
fn ai() {
    run("ai");
}
#[test]
fn applications_form() {
    run("applications-form");
}
#[test]
fn applications() {
    run("applications");
}
#[test]
fn auth() {
    run("auth");
}
#[test]
fn bufs_profile() {
    run("bufs-profile");
}
#[test]
fn cov_02() {
    run("cov-02");
}
#[test]
fn db() {
    run("db");
}
#[test]
fn explore_decide() {
    run("explore-decide");
}
#[test]
fn explore_scenarios() {
    run("explore-scenarios");
}
#[test]
fn kstartup_explore() {
    run("kstartup-explore");
}
#[test]
fn kstartup() {
    run("kstartup");
}
#[test]
fn likes_conditions() {
    run("likes-conditions");
}
#[test]
fn mentor() {
    run("mentor");
}
#[test]
fn programs_sort() {
    run("programs-sort");
}
#[test]
fn programs() {
    run("programs");
}
#[test]
fn purge() {
    run("purge");
}
