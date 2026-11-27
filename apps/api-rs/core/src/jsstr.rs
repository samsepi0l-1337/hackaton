//! JS 문자열·시각 동작을 맞추는 도우미. JS 의 length·slice·substring 은 UTF-16 코드 단위다.

/// JS `s.length`.
pub fn len16(s: &str) -> usize {
    s.encode_utf16().count()
}

/// JS `s.slice(start, end)` (음수 없음, 범위 밖은 잘라 맞춤). 대리쌍 가운데를 자르면 JS 처럼 반쪽이 남지 않게 U+FFFD 로 바꾼다.
pub fn slice16(s: &str, start: usize, end: usize) -> String {
    let u: Vec<u16> = s.encode_utf16().collect();
    let e = end.min(u.len());
    let st = start.min(e);
    String::from_utf16_lossy(&u[st..e])
}

/// JS `s.slice(0, n)`.
pub fn take16(s: &str, n: usize) -> String {
    slice16(s, 0, n)
}

/// JS `new Date(ms).toISOString()` (예: 2026-11-27T01:00:00.000Z).
pub fn iso(ms: i64) -> String {
    let secs = ms.div_euclid(1000);
    let milli = ms.rem_euclid(1000);
    let dt = chrono::DateTime::from_timestamp(secs, (milli * 1_000_000) as u32).unwrap_or_default();
    format!("{}.{:03}Z", dt.format("%Y-%m-%dT%H:%M:%S"), milli)
}

/// JS `Date.parse(iso)` (ISO 8601 만). 실패하면 None (JS 의 NaN).
pub fn parse_ms(s: &str) -> Option<i64> {
    if let Ok(d) = chrono::DateTime::parse_from_rfc3339(s) {
        return Some(d.timestamp_millis());
    }
    if let Ok(d) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        return Some(d.and_hms_opt(0, 0, 0)?.and_utc().timestamp_millis());
    }
    None
}

/// JS `\s` 와 `String.prototype.trim` 이 지우는 문자 (WhiteSpace + LineTerminator). U+FEFF 포함, U+0085 제외.
pub fn is_js_ws(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{0B}' | '\u{0C}' | '\r' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}
/// 정규식 `[...]` 안에 넣는 JS `\s` 문자 집합 (예: format!("[{JS_WS}]+")). Rust `\s` 는 유니코드라 다르다.
pub const JS_WS: &str = r"\t\n\x0B\x0C\r \u{A0}\u{1680}\u{2000}-\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}";
/// JS `s.trim()`.
pub fn js_trim(s: &str) -> &str {
    s.trim_matches(is_js_ws)
}
/// JS 비유니코드 정규식의 `\d` (ASCII 0-9 만). Rust `\d` 는 유니코드 숫자(전각 등)도 잡는다.
pub const JS_DIGIT: &str = "[0-9]";

/// JS `String(n)` / 템플릿 리터럴의 숫자 표기. 정수면 소수점 없이 (20.0 -> "20"), |n| >= 1e21 이나 < 1e-6 은 지수 표기.
pub fn js_number_string(n: f64) -> String {
    if n.is_nan() {
        return "NaN".into();
    }
    if n.is_infinite() {
        return if n > 0.0 {
            "Infinity".into()
        } else {
            "-Infinity".into()
        };
    }
    if n == 0.0 {
        return "0".into();
    }
    let a = n.abs();
    if (1e-6..1e21).contains(&a) {
        if n.fract() == 0.0 {
            return format!("{}", n as i64);
        }
        return format!("{n}");
    }
    // 지수 표기: JS 는 1e+21, 1.5e-7 처럼 쓴다.
    let s = format!("{n:e}");
    let (m, e) = s.split_once('e').unwrap_or((&s, "0"));
    let e: i32 = e.parse().unwrap_or(0);
    format!("{m}e{}{}", if e >= 0 { "+" } else { "-" }, e.abs())
}
/// JSON 값을 JS 템플릿 리터럴처럼 문자열로 (숫자는 js_number_string, 문자열은 그대로, null 은 "null").
pub fn js_value_string(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Number(n) => n
            .as_f64()
            .map(js_number_string)
            .unwrap_or_else(|| n.to_string()),
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Null => "null".into(),
        serde_json::Value::Bool(b) => b.to_string(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn js_numbers() {
        use super::js_number_string as f;
        assert_eq!(
            (f(20.0), f(1.5), f(-3.0), f(1e21), f(1.5e-7), f(0.000001)),
            (
                "20".into(),
                "1.5".into(),
                "-3".into(),
                "1e+21".into(),
                "1.5e-7".into(),
                "0.000001".into()
            )
        );
        assert_eq!(super::js_value_string(&serde_json::json!(25.0)), "25");
    }
    #[test]
    fn js_whitespace() {
        assert_eq!(super::js_trim("\u{FEFF} 부산 \u{3000}"), "부산");
        assert_eq!(super::js_trim("\u{85}x"), "\u{85}x");
        let re = regex::Regex::new(&format!("^[{}]+$", super::JS_WS)).unwrap();
        assert!(re.is_match("\u{FEFF}\u{A0}"));
        assert!(!re.is_match("\u{85}"));
    }
    use super::*;
    #[test]
    fn hangul_counts_as_one_unit() {
        assert_eq!(len16("부산"), 2);
        assert_eq!(take16("부산창업", 2), "부산");
        assert_eq!(slice16("abc", 1, 99), "bc");
    }
    #[test]
    fn iso_has_millis() {
        assert_eq!(iso(1_795_741_200_000), "2026-11-27T01:00:00.000Z");
        assert_eq!(
            parse_ms("2026-11-27T01:00:00.000Z"),
            Some(1_795_741_200_000)
        );
    }
}
