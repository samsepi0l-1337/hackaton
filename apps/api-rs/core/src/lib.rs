//! 해보까 API 의 플랫폼 독립 로직. 플랫폼 독립 로직을 제공한다.
//! 플랫폼(Workers)은 `gil-worker` 가 맡는다. 여기에는 `worker` 의존이 없어 `cargo test` 로 바로 시험한다.
//!
//! JS 와 다른 점 (반드시 지킨다):
//! - 문자열 길이·자르기는 UTF-16 단위다. `jsstr::len16`·`jsstr::slice16` 을 쓴다 (`str::len` 은 바이트).
//! - 정규식 lookaround 는 `fancy_regex` 로. 정렬은 안정 정렬만, `localeCompare` 는 쓰는 곳마다 확인한다.
//! - 출력 JSON 은 `serde_json::Map`(입력 순서 유지)으로 만든다. `HashMap` 금지. undefined(키 없음)와 null 을 구분한다.
//! - 시각은 ms 정수, 문자열은 `jsstr::iso`(밀리초 포함 Z).
#![allow(clippy::result_large_err)]

pub mod api;
pub mod app;
pub mod http;
pub mod jsstr;
pub mod kv;
pub mod ports;
pub mod router;
pub mod shared;
pub mod testkit;
pub mod time;
