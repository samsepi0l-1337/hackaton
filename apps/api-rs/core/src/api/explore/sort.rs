//! 지원 목록 정렬. 페이지 나누기 전에 쓴다.
use crate::shared::date::d_day;
use serde_json::Value;
use std::cmp::Ordering;

fn group(c: &Value, now: i64) -> u8 {
    let r = &c["resource"];
    if r["recruitStatus"] == "closed" {
        2
    } else if r["endDate"].is_null() {
        1
    } else if d_day(r["endDate"].as_str(), now).unwrap_or(0.0) >= 0.0 {
        0
    } else {
        2
    }
}
fn id(c: &Value) -> &str {
    c["resource"]["id"].as_str().unwrap_or("")
}
fn end(c: &Value) -> Option<&str> {
    c["resource"]["endDate"].as_str()
}
fn deadline(a: &Value, b: &Value, now: i64) -> Ordering {
    let ga = group(a, now);
    let gb = group(b, now);
    ga.cmp(&gb)
        .then_with(|| match (end(a), end(b)) {
            (Some(x), Some(y)) if ga == 2 && x != y => y.cmp(x),
            (Some(x), Some(y)) => x.cmp(y),
            (Some(_), None) => Ordering::Less,
            (None, Some(_)) => Ordering::Greater,
            (None, None) => Ordering::Equal,
        })
        .then_with(|| id(a).cmp(id(b)))
}
/// 안정 정렬로 마감, 최신, 인기, 적합 순서를 만든다.
pub fn sort_cards(cards: &mut [Value], sort: &str, now: i64) {
    cards.sort_by(|a, b| match sort {
        "recent" => match (
            a["resource"]["startDate"].as_str(),
            b["resource"]["startDate"].as_str(),
        ) {
            (Some(x), Some(y)) => y.cmp(x),
            (Some(_), None) => Ordering::Less,
            (None, Some(_)) => Ordering::Greater,
            (None, None) => Ordering::Equal,
        }
        .then_with(|| id(a).cmp(id(b))),
        "popular" => b["views"]
            .as_f64()
            .unwrap_or(0.0)
            .total_cmp(&a["views"].as_f64().unwrap_or(0.0))
            .then_with(|| deadline(a, b, now)),
        "fit" => (group(a, now) == 2)
            .cmp(&(group(b, now) == 2))
            .then_with(|| {
                b["fit"]
                    .as_f64()
                    .unwrap_or(0.0)
                    .total_cmp(&a["fit"].as_f64().unwrap_or(0.0))
            })
            .then_with(|| deadline(a, b, now)),
        _ => deadline(a, b, now),
    });
}
