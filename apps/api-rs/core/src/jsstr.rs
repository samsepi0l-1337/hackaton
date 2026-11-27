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

#[cfg(test)]
mod tests {
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
