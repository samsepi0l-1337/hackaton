//! TS 원본: packages/shared/src/date.ts
use chrono::{DateTime, Datelike, Duration, NaiveDate, Utc};
use serde_json::{json, Value};

const DAY_MS: i64 = 86_400_000;

fn components(date: &str) -> Option<(i32, i32, i64)> {
    let mut parts = date.split('-');
    let number = |s: &str| {
        if s.trim().is_empty() {
            Some(0)
        } else {
            s.trim().parse().ok()
        }
    };
    Some((
        number(parts.next()?)?,
        number(parts.next()?)?,
        i64::from(number(parts.next()?)?),
    ))
}

fn utc_date(year: i32, month: i32, day: i64) -> Option<NaiveDate> {
    let year = if (0..=99).contains(&year) {
        year + 1900
    } else {
        year
    };
    let total = i64::from(year) * 12 + i64::from(month) - 1;
    let y = i32::try_from(total.div_euclid(12)).ok()?;
    let m = u32::try_from(total.rem_euclid(12) + 1).ok()?;
    NaiveDate::from_ymd_opt(y, m, 1)?.checked_add_signed(Duration::try_days(day.checked_sub(1)?)?)
}

fn parse_date(date: &str) -> Option<NaiveDate> {
    let (y, m, d) = components(date)?;
    utc_date(y, m, d)
}

/// 주어진 시각의 한국 날짜. TS: function kstDate(now: Date): IsoDate
pub fn kst_date(now: i64) -> String {
    now.checked_add(9 * 60 * 60 * 1000)
        .and_then(DateTime::<Utc>::from_timestamp_millis)
        .map(|d| d.format("%Y-%m-%d").to_string())
        .unwrap_or_default()
}

/// b - a (일). TS: function daysBetween(a: IsoDate, b: IsoDate): number
pub fn days_between(a: &str, b: &str) -> f64 {
    match (parse_date(a), parse_date(b)) {
        (Some(a), Some(b)) => (b - a).num_days() as f64,
        _ => f64::NAN,
    }
}

/// TS: function addDays(date: IsoDate, days: number): IsoDate
pub fn add_days(date: &str, days: f64) -> String {
    let Some(date) = parse_date(date) else {
        return String::new();
    };
    if !days.is_finite() {
        return String::new();
    }
    let Some(base) = date.and_hms_opt(0, 0, 0) else {
        return String::new();
    };
    let ms = (base.and_utc().timestamp_millis() as f64 + days * DAY_MS as f64).trunc();
    DateTime::<Utc>::from_timestamp_millis(ms as i64)
        .map(|d| d.format("%Y-%m-%d").to_string())
        .unwrap_or_default()
}

/// date 에 years 년을 더한다. 2월 29일은 2월 28일로 맞춘다. TS: function addYears(date: IsoDate, years: number): IsoDate
pub fn add_years(date: &str, years: i32) -> String {
    let Some((y, m, d)) = components(date) else {
        return String::new();
    };
    let Some(y) = y.checked_add(years) else {
        return String::new();
    };
    let Some(next_month) = m.checked_add(1) else {
        return String::new();
    };
    let Some(last) = utc_date(y, next_month, 0) else {
        return String::new();
    };
    format!("{y}-{m:02}-{:02}", d.min(i64::from(last.day())))
}

/// 마감까지 남은 일수. TS: function dDay(endDate: IsoDate | null, now: Date): number | null
pub fn d_day(end_date: Option<&str>, now: i64) -> Option<f64> {
    end_date.map(|date| days_between(&kst_date(now), date))
}

/// TS: function dDayLabel(d: number | null): string
pub fn d_day_label(d: Option<f64>) -> String {
    match d {
        None => "상시".into(),
        Some(n) if n < 0.0 => "마감".into(),
        Some(0.0) => "D-DAY".into(),
        Some(n) => format!("D-{n}"),
    }
}

/// TS: function isClosed(endDate: IsoDate | null, now: Date): boolean
pub fn is_closed(end_date: Option<&str>, now: i64) -> bool {
    d_day(end_date, now).is_some_and(|d| d < 0.0)
}

/// TS: function isValidIsoDate(value: unknown): value is IsoDate
pub fn is_valid_iso_date(value: &Value) -> bool {
    let Some(s) = value.as_str() else {
        return false;
    };
    let bytes = s.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes
            .iter()
            .enumerate()
            .any(|(i, b)| i != 4 && i != 7 && !b.is_ascii_digit())
    {
        return false;
    }
    NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok()
}

fn date_arg(value: &Value) -> Option<i64> {
    DateTime::parse_from_rfc3339(value.get("$date")?.as_str()?)
        .ok()
        .map(|d| d.timestamp_millis())
}

/// 함수 골든 (golden.rs 참고).
pub fn golden(f: &str, args: &[Value]) -> Option<Value> {
    let a = args.first()?;
    match f {
        "kstDate" => Some(json!(kst_date(date_arg(a)?))),
        "daysBetween" => Some(json!(days_between(a.as_str()?, args.get(1)?.as_str()?))),
        "addDays" => Some(json!(add_days(a.as_str()?, args.get(1)?.as_f64()?))),
        "addYears" => Some(json!(add_years(
            a.as_str()?,
            i32::try_from(args.get(1)?.as_i64()?).ok()?
        ))),
        "dDay" => Some(json!(d_day(
            if a.is_null() { None } else { Some(a.as_str()?) },
            date_arg(args.get(1)?)?
        ))),
        "dDayLabel" => Some(json!(d_day_label(if a.is_null() {
            None
        } else {
            Some(a.as_f64()?)
        }))),
        "isClosed" => Some(json!(is_closed(
            if a.is_null() { None } else { Some(a.as_str()?) },
            date_arg(args.get(1)?)?
        ))),
        "isValidIsoDate" => Some(json!(is_valid_iso_date(a))),
        _ => None,
    }
}
