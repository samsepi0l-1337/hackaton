//! TS 원본: packages/shared/src/data.ts

/// 함수 골든 (golden.rs 참고). 옮긴 함수마다 이름으로 분기한다.
pub fn golden(_f: &str, _args: &[serde_json::Value]) -> Option<serde_json::Value> {
    None
}

/// 테스트용 자료(packages/shared/test/fixtures: 문제 카드·지역 배경·경로)로 바꾼다. TS 의 bunfig preload(setup-fixtures.ts)와 같다.
/// TestApp 과 TEST_MODE=1 워커가 부른다. 운영 자료는 packages/shared/data/*.json.
pub fn use_test_fixtures() {}
