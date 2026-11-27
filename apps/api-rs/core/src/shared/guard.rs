//! TS 원본: packages/shared/src/guard.ts
use fancy_regex::Regex;
use serde_json::Value;
fn norm(s: &str) -> String {
    s.chars()
        .filter(|c| !c.is_whitespace() && *c != ',')
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
    let re = Regex::new(r"^(\d{4})-(\d{2})-(\d{2})").ok();
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
    let ws = Regex::new(r"\s+").ok()?;
    let cleaned = fence.replace_all(text, "");
    let mut t = ws.replace_all(&cleaned, " ").trim().to_owned();
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
        r"(?i)[0-9]{4}[-./][0-9]{1,2}[-./][0-9]{1,2}|[0-9]{1,2}\s*월\s*[0-9]{1,2}\s*일|\bD\s*[-+]\s*[0-9]+\b|D-day",
    ] {
        let re = Regex::new(pat).ok()?;
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
    let quoted = Regex::new(r#"['"‘“「『]([^'"’”」』]{3,60})['"’”」』]"#).ok()?;
    for c in quoted.captures_iter(&t) {
        let c = c.ok()?;
        let q = c.get(1)?.as_str();
        let n = norm(q);
        if ["사업", "지원", "공모", "프로그램", "챌린지", "캠프", "센터"]
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
