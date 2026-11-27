//! TS 원본: apps/api/src/docs/fields.ts
use crate::jsstr;
use fancy_regex::Regex;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{LazyLock, Mutex},
};

/// TS: export const MAX_FIELDS = 40;
pub const MAX_FIELDS: usize = 40;
const BULLET: &str = r"^(?:[0-9]{1,2}\s*-\s*[0-9]{1,2}\s*[.)]?\s*|[0-9]{1,2}\s*[.)]\s*|\(\s*[0-9]{1,2}\s*\)\s*|[가-힣]\s*[.)]\s+|[①-⑳]\s*|[□■○●◦◯▶▷▪▫◆◇ㅇ]\s*|제\s*[0-9]+\s*[장절항호]\s*|[-•·]\s+)+";
const STRUCT: &str = r"^(?:[0-9]{1,2}\s*-\s*[0-9]{1,2}\s*[.)]?\s*\S|[0-9]{1,2}\s*[.)]\s*\S|\(\s*[0-9]{1,2}\s*\)\s*\S|[가-힣]\s*[.)]\s+\S|[①-⑳]|[□■○●◦◯▶▷▪▫◆◇ㅇ]|제\s*[0-9]+\s*[장절항호])";
const REQUIRED: &str = r"[(\[（<]\s*필수\s*[)\]）>]|\*+\s*$|^\s*\*+(?!\*)|필수\s*입력";
static REGEXES: LazyLock<Mutex<HashMap<String, Regex>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
fn re(p: &str) -> Regex {
    let mut cache = REGEXES.lock().unwrap_or_else(|e| e.into_inner());
    cache
        .entry(p.to_string())
        .or_insert_with(|| {
            // Rust's Unicode whitespace differs from ECMAScript's whitespace.
            let p = p
                .replace(r"[-=:|\s]", &format!("[-=:|{}]", jsstr::JS_WS))
                .replace(r"\s", &format!("[{}]", jsstr::JS_WS))
                .replace(r"\S", &format!("[^{}]", jsstr::JS_WS));
            Regex::new(&p).unwrap_or_else(|_| unreachable!("static regex"))
        })
        .clone()
}
fn has(p: &str, s: &str) -> bool {
    re(p).is_match(s).unwrap_or(false)
}
fn replace(p: &str, s: &str, by: &str) -> String {
    re(p).replace_all(s, by).into_owned()
}
fn limit(s: &str) -> Option<u64> {
    for p in [
        r"(?:최대\s*)?([0-9][0-9,]*)\s*자\s*(?:이내|이하|내외|까지|미만)?",
        r"(?i)([0-9][0-9,]*)\s*(?:byte|bytes|바이트)\s*(?:이내|이하|내외)?",
    ] {
        if let Ok(Some(c)) = re(p).captures(s) {
            if let Some(n) = c
                .get(1)
                .and_then(|m| m.as_str().replace(',', "").parse::<u64>().ok())
            {
                if n > 0 && n < 1_000_000 {
                    return Some(n);
                }
            }
        }
    }
    None
}
fn clean(raw: &str) -> String {
    let mut s = replace(r"<[^>]+>", raw, " ");
    s = replace(r"\*\*|__|`", &s, "");
    s = replace(r"^#+\s*", &s, "");
    s = replace(BULLET, jsstr::js_trim(&s), "");
    s = replace(
        r"(?i)[(\[（<][^)\]）>]*(?:자|byte|바이트|필수)[^)\]）>]*[)\]）>]",
        &s,
        " ",
    );
    s = replace(
        r"(?i)(?:최대\s*)?[0-9][0-9,]*\s*(?:자|byte|바이트)\s*(?:이내|이하|내외|까지|미만)?",
        &s,
        " ",
    );
    s = replace(r"\*+", &s, " ");
    s = replace(r"[:：]\s*$", &s, "");
    jsstr::js_trim(&replace(r"\s+", &s, " ")).to_string()
}
fn hit(raw: &str) -> Option<Value> {
    let label = clean(raw);
    if !(2..=40).contains(&jsstr::len16(&label))
        || !has(r"[가-힣A-Za-z]", &label)
        || has(r"^[-=:|\s]+$", &label)
        || has(r"(?:다|요|음|함)[.。]$", &label)
    {
        return None;
    }
    Some(json!({"label":label,"maxLength":limit(raw),"required":has(REQUIRED, raw)}))
}
fn table(line: &str) -> Option<Vec<&str>> {
    let t = jsstr::js_trim(line);
    if !t.starts_with('|') || !t[1..].contains('|') {
        return None;
    }
    let s = t
        .strip_prefix('|')
        .unwrap_or(t)
        .strip_suffix('|')
        .unwrap_or(&t[1..]);
    let cells: Vec<_> = s.split('|').map(jsstr::js_trim).collect();
    if cells.iter().all(|c| c.is_empty() || has(r"^:?-{2,}:?$", c)) {
        return Some(vec![]);
    }
    Some(cells)
}
fn table_hits(cells: &[&str]) -> Vec<Value> {
    let nonempty = cells.iter().filter(|c| !c.is_empty()).count();
    if nonempty == 0
        || (cells.len() > 1
            && nonempty == cells.len()
            && !cells.iter().any(|c| limit(c).is_some() || has(REQUIRED, c)))
    {
        return vec![];
    }
    let mut result = vec![];
    let mut i = 0;
    while i < cells.len() {
        let c = cells[i];
        if c.is_empty() || ["구분", "항목", "내용", "비고", "순번", "번호", "연번"].contains(&c)
        {
            i += 1;
            continue;
        }
        if cells.get(i + 1).is_none_or(|s| s.is_empty()) || limit(c).is_some() || has(REQUIRED, c) {
            if let Some(h) = hit(c) {
                result.push(h);
            }
            i += 1;
        }
        i += 1;
    }
    result
}
fn add(out: &mut Vec<Value>, seen: &mut HashMap<String, usize>, h: Value) {
    let key = replace(r"\s+", h["label"].as_str().unwrap_or(""), "").to_lowercase();
    if let Some(&i) = seen.get(&key) {
        if out[i]["maxLength"].is_null() && !h["maxLength"].is_null() {
            out[i]["maxLength"] = h["maxLength"].clone();
        }
        if h["required"] == true {
            out[i]["required"] = json!(true);
        }
    } else if out.len() < MAX_FIELDS {
        seen.insert(key, out.len());
        out.push(h);
    }
}
/// TS: export function extractFields(input: string): ExtractedField[]
pub fn extract_fields(input: &str) -> Vec<Value> {
    let mut out = vec![];
    let mut seen = HashMap::new();
    for raw in input.split('\n') {
        let cleaned = replace(r"(?i)</?(?:br|p|div|span)[^>]*>", raw, " ");
        let line = jsstr::js_trim(&cleaned);
        if line.is_empty() {
            continue;
        }
        if let Some(cells) = table(line) {
            for h in table_hits(&cells) {
                add(&mut out, &mut seen, h);
            }
            continue;
        }
        if jsstr::len16(line) > 90 {
            continue;
        }
        let heading = has(r"^#{1,6}\s+", line);
        let stripped = replace(r"^#{1,6}\s+", line, "");
        let stripped = replace(r"^\*\*(.+)\*\*$", &stripped, "$1");
        let marker = limit(&stripped).is_some() || has(REQUIRED, &stripped);
        if has(r"^[※*]\s*\S", &stripped) && !heading && limit(&stripped).is_none() {
            continue;
        }
        if has(r"^[-•·]\s+", &stripped) && !marker {
            continue;
        }
        if has(STRUCT, &stripped) || marker {
            if !heading && !marker && has(r"(?:다|요|음|함)[.。]?$", &stripped) {
                continue;
            }
            if let Some(h) = hit(&stripped) {
                add(&mut out, &mut seen, h);
            }
        }
    }
    out
}
#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(name: &str) -> &'static str {
        let source = include_str!("../../../../../api/test/docs-fixtures.ts");
        source
            .split(&format!("export const {name} = `"))
            .nth(1)
            .and_then(|s| s.split('`').next())
            .unwrap_or("")
    }
    #[test]
    fn fixture_assertions() {
        let pre = extract_fields(fixture("PRE_STARTUP_PLAN"));
        let find = |name: &str| {
            pre.iter()
                .find(|v| v["label"] == name)
                .cloned()
                .unwrap_or_default()
        };
        for name in [
            "창업아이템명",
            "신청자 성명",
            "생년월일",
            "이메일",
            "창업 아이템 개요",
            "개발 동기 및 필요성",
            "시장 분석",
        ] {
            assert!(!find(name).is_null(), "{name}");
        }
        assert_eq!(find("창업 아이템 개요")["maxLength"], 500);
        assert_eq!(find("개발 동기 및 필요성")["required"], true);
        assert_eq!(find("개발 방안 및 사업화 전략")["maxLength"], 1000);
        assert_eq!(find("시장 분석")["required"], true);
        let youth = extract_fields(fixture("YOUTH_APPLICATION"));
        for (label, n) in [
            ("창업 아이템 개요", 500),
            ("사업화 목표 및 계획", 800),
            ("대표자 약력", 2000),
        ] {
            assert_eq!(
                youth
                    .iter()
                    .find(|v| v["label"] == label)
                    .unwrap_or(&Value::Null)["maxLength"],
                n
            );
        }
        let global = extract_fields(fixture("GLOBAL_STARTUP"));
        for (label, n) in [
            ("주요 제품 및 서비스", 300),
            ("해외 진출 계획", 1000),
            ("팀 소개", 400),
        ] {
            assert_eq!(
                global
                    .iter()
                    .find(|v| v["label"] == label)
                    .unwrap_or(&Value::Null)["maxLength"],
                n
            );
        }
        assert!(extract_fields(fixture("NOT_A_FORM")).is_empty());
    }
    #[test]
    fn js_whitespace() {
        assert_eq!(
            extract_fields("\u{feff}□\u{feff}기업명\u{feff}")[0]["label"],
            "기업명"
        );
        assert_eq!(extract_fields("□ 기업\u{85}명")[0]["label"], "기업\u{85}명");
        assert_eq!(extract_fields("\u{85}□ 기업명"), Vec::<Value>::new());
    }
    #[test]
    fn duplicate_and_limit() {
        assert_eq!(
            extract_fields(
                "1. 창업 아이템 개요\n□ 창업 아이템 개요 (500자 이내)\n| 창업 아이템 개요 | |"
            ),
            vec![json!({"label":"창업 아이템 개요","maxLength":500,"required":false})]
        );
        assert!(extract_fields("안내문입니다.").is_empty());
    }
}
