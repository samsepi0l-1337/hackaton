//! 함수 골든 진입점. TS 테스트가 기록한 (함수, 입력) 을 각 모듈의 `golden` 으로 넘긴다.
//! 입력 값 규칙: {"$date": iso} = Date, {"$undef": true} = undefined, {"$set": [..]}/{"$map": [[k,v]..]} = Set/Map.
//! 모듈의 `golden(f, args)` 은 옮긴 함수를 부르고 TS 와 같은 JSON 출력을 낸다 (Date 는 {"$date": iso}, undefined 는 {"$undef": true}).
//! 아직 옮기지 않은 함수는 None.
use serde_json::Value;

pub fn call(module: &str, f: &str, args: &[Value]) -> Option<Value> {
    match module {
        "account" => crate::shared::account::golden(f, args),
        "data" => crate::shared::data::golden(f, args),
        "date" => crate::shared::date::golden(f, args),
        "eligibility" => crate::shared::eligibility::golden(f, args),
        "explore-rules" => crate::shared::explore_rules::golden(f, args),
        "guard" => crate::shared::guard::golden(f, args),
        "kstartup-resource" => crate::shared::kstartup_resource::golden(f, args),
        "kstartup" => crate::shared::kstartup::golden(f, args),
        "likes" => crate::shared::likes::golden(f, args),
        "mentor" => crate::shared::mentor::golden(f, args),
        "profile" => crate::shared::profile::golden(f, args),
        "query" => crate::shared::query::golden(f, args),
        "recommend" => crate::shared::recommend::golden(f, args),
        "seed" => crate::shared::seed::golden(f, args),
        "typeTest" => crate::shared::type_test::golden(f, args),
        _ => None,
    }
}
