//! TS 원본: packages/shared/src/guard.ts
use fancy_regex::Regex;
use serde_json::Value;
const JS_WS: &str = r"[\x09-\x0d\x20\u{00a0}\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}\u{feff}]";
fn js_ws(c: char) -> bool {
    matches!(c, '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}
fn norm(s: &str) -> String {
    s.chars()
        .filter(|c| !js_ws(*c) && *c != ',')
        .collect::<String>()
        .to_lowercase()
}
fn strings<'a>(v: &'a Value, k: &str) -> impl Iterator<Item = &'a str> {
    v.get(k)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
}
fn date_forms(s: &str) -> Vec<String> {
    let re = Regex::new(r"^([0-9]{4})-([0-9]{2})-([0-9]{2})").ok();
    if let Some(Some(c)) = re.as_ref().map(|r| r.captures(s).ok().flatten()) {
        let m = c
            .get(2)
            .and_then(|x| x.as_str().parse::<u32>().ok())
            .unwrap_or(0);
        let d = c
            .get(3)
            .and_then(|x| x.as_str().parse::<u32>().ok())
            .unwrap_or(0);
        vec![s.into(), format!("{m}월{d}일")]
    } else {
        vec![]
    }
}
/// `guardText(text: string | null | undefined, opts: GuardOptions = {}): string | null`
pub fn guard_text(text: Option<&str>, opts: &Value) -> Option<String> {
    let text = text.filter(|s| !s.is_empty())?;
    let fence = Regex::new(r"(?i)```[a-z]*|```").ok()?;
    let ws = Regex::new(&format!("{JS_WS}+")).ok()?;
    let cleaned = fence.replace_all(text, "");
    let mut t = ws.replace_all(&cleaned, " ").trim_matches(js_ws).to_owned();
    if t.is_empty() {
        return None;
    }
    let programs: Vec<&Value> = opts
        .get("programs")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .collect();
    let mut sources: Vec<String> = strings(opts, "allowedText").map(str::to_owned).collect();
    for p in &programs {
        for k in ["title", "content", "target", "targetAge"] {
            sources.push(p.get(k).and_then(Value::as_str).unwrap_or("").into());
        }
        for k in ["endDate", "startDate"] {
            sources.extend(date_forms(p.get(k).and_then(Value::as_str).unwrap_or("")));
        }
    }
    let source = norm(&sources.join(" "));
    for pat in [
        r"[0-9][0-9,.]*\s*(?:천|백)?\s*(?:만|억|조)?\s*원|\$\s?[0-9][0-9,.]*|[0-9][0-9,.]*\s*(?:만|억)(?![가-힣])",
        r"(?i)[0-9]{4}[-./][0-9]{1,2}[-./][0-9]{1,2}|[0-9]{1,2}\s*월\s*[0-9]{1,2}\s*일|(?<![0-9A-Za-z_])D\s*[-+]\s*[0-9]+(?![0-9A-Za-z_])|D-day",
    ] {
        let re = Regex::new(&pat.replace(r"\s", JS_WS)).ok()?;
        for m in re.find_iter(&t) {
            if !source.contains(&norm(m.ok()?.as_str())) {
                return None;
            }
        }
    }
    let titles: Vec<String> = programs
        .iter()
        .map(|p| norm(p.get("title").and_then(Value::as_str).unwrap_or("")))
        .collect();
    for k in strings(opts, "knownTitles") {
        let n = norm(k);
        if !titles.contains(&n) && norm(&t).contains(&n) {
            return None;
        }
    }
    let quoted = Regex::new(r#"['"‘“「『]([^'"’”」』]+)['"’”」』]"#).ok()?;
    for c in quoted.captures_iter(&t) {
        let c = c.ok()?;
        let q = c.get(1)?.as_str();
        let n = norm(q);
        if (3..=60).contains(&crate::jsstr::len16(q))
            && ["사업", "지원", "공모", "프로그램", "챌린지", "캠프", "센터"]
                .iter()
                .any(|x| q.contains(x))
            && !titles.contains(&n)
            && !source.contains(&n)
        {
            return None;
        }
    }
    let max = opts
        .get("maxLength")
        .and_then(Value::as_i64)
        .unwrap_or(300)
        .max(0) as usize;
    if crate::jsstr::len16(&t) > max {
        let cut = crate::jsstr::take16(&t, max);
        let end = cut
            .char_indices()
            .filter(|(_, c)| matches!(c, '.' | '요' | '다'))
            .map(|(i, _)| crate::jsstr::len16(&cut[..i]))
            .max();
        t = if let Some(e) = end.filter(|e| (*e as f64) > max as f64 * 0.5) {
            crate::jsstr::take16(&cut, e + 1)
        } else {
            cut
        };
    }
    Some(t)
}
/// `parseJson(text: string | null): unknown`
pub fn parse_json(text: Option<&str>) -> Value {
    let Some(s) = text else { return Value::Null };
    let Some(start) = s.find(['[', '{']) else {
        return Value::Null;
    };
    let Some(end) = s.rfind([']', '}']) else {
        return Value::Null;
    };
    if end < start {
        return Value::Null;
    }
    serde_json::from_str(&s[start..=end]).unwrap_or(Value::Null)
}
/// 함수 골든.
pub fn golden(f: &str, args: &[Value]) -> Option<Value> {
    match f {
        "guardText" => Some(
            guard_text(
                args.first().and_then(Value::as_str),
                args.get(1).unwrap_or(&Value::Null),
            )
            .map(Value::String)
            .unwrap_or(Value::Null),
        ),
        "parseJson" => Some(parse_json(args.first().and_then(Value::as_str))),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn ascii_word_boundary_for_korean() {
        let text = "마감까지 D-3일 남았어요";
        assert_eq!(guard_text(Some(text), &json!({})), None);
        assert_eq!(
            guard_text(Some(text), &json!({"allowedText":["D-3"]})),
            Some(text.to_owned())
        );
    }
}
