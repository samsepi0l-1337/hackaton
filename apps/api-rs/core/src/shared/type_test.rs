//! TS 원본: packages/shared/src/typeTest.ts
use serde_json::{json, Map, Value};
/// `TYPE_AXES: { axis: TypeAxis; left: string; right: string; leftName: string; rightName: string }[]`
pub const TYPE_AXES: [(&str, &str, &str, &str, &str); 4] = [
    ("AP", "A", "P", "먼저 해 본다", "먼저 계획한다"),
    ("ST", "S", "T", "혼자 빠르게", "함께 크게"),
    ("DH", "D", "H", "기술·제품", "사람·서비스"),
    ("CK", "C", "K", "도전", "안정"),
];
/// `TYPE_QUESTIONS: TypeQuestion[]`
pub const TYPE_QUESTIONS: [(u32, &str, &str, &str, &str); 12] = [
    (
        1,
        "AP",
        "새 아이디어가 떠오르면?",
        "일단 작게 만들어 본다",
        "자료부터 찾아 정리한다",
    ),
    (
        2,
        "AP",
        "해커톤 첫 1시간에 나는?",
        "바로 화면부터 그린다",
        "기능 목록과 일정을 짠다",
    ),
    (
        3,
        "AP",
        "계획이 틀어지면?",
        "그 자리에서 방향을 바꾼다",
        "계획을 다시 세운다",
    ),
    (
        4,
        "ST",
        "일이 몰릴 때 나는?",
        "혼자 밤새 끝낸다",
        "사람을 모아 나눈다",
    ),
    (
        5,
        "ST",
        "창업 파트너는?",
        "없어도 된다, 빠른 게 좋다",
        "꼭 있어야 한다",
    ),
    (
        6,
        "ST",
        "네트워킹 행사는?",
        "필요할 때만 간다",
        "자주 가서 사람을 만난다",
    ),
    (
        7,
        "DH",
        "더 끌리는 일은?",
        "제품 기능을 다듬는 일",
        "고객을 만나 이야기 듣는 일",
    ),
    (
        8,
        "DH",
        "좋은 서비스의 기준은?",
        "기술이 뛰어나다",
        "쓰는 사람이 편하다",
    ),
    (
        9,
        "DH",
        "주말에 보는 콘텐츠는?",
        "신기술·제품 리뷰",
        "사람·브랜드 이야기",
    ),
    (
        10,
        "CK",
        "안정적인 월급 vs 큰 가능성?",
        "큰 가능성",
        "안정적인 월급",
    ),
    (
        11,
        "CK",
        "첫 자금은?",
        "투자를 받아 빠르게 키운다",
        "작게 벌면서 키운다",
    ),
    (
        12,
        "CK",
        "실패할 확률 50%인 기회라면?",
        "해 본다",
        "더 확실한 기회를 기다린다",
    ),
];
fn traits(c: char) -> Option<(&'static str, &'static str, &'static str, &'static str)> {
    match c {
        'A' => Some(("실행가", "빠른 시제품 제작", "앱·웹 서비스", "사업화")),
        'P' => Some(("설계자", "꼼꼼한 사업 계획", "교육", "창업교육")),
        'S' => Some(("솔로", "빠른 의사결정", "커머스", "시설·공간·보육")),
        'T' => Some(("팀빌더", "사람을 모으는 힘", "관광·문화", "행사·네트워크")),
        'D' => Some(("메이커", "제품 완성도", "IT·플랫폼", "기술개발(R&D)")),
        'H' => Some(("커넥터", "고객 공감", "식품·외식", "멘토링·컨설팅")),
        'C' => Some(("챌린저", "과감한 도전", "해양·물류", "사업화")),
        'K' => Some(("키퍼", "안정적인 운영", "친환경", "융자")),
        _ => None,
    }
}
fn unique<'a>(a: &'a str, b: &'a str) -> Vec<&'a str> {
    if a == b {
        vec![a]
    } else {
        vec![a, b]
    }
}
/// `describeType(code: string, axisScores?: TypeResult['axisScores']): TypeResult`
pub fn describe_type(code: &str, axis_scores: Option<&Value>) -> Option<Value> {
    let c: Vec<char> = code.chars().collect();
    if c.len() < 4 {
        return None;
    }
    let a = traits(c[0])?;
    let b = traits(c[1])?;
    let d = traits(c[2])?;
    let k = traits(c[3])?;
    let scores = axis_scores
        .cloned()
        .filter(|v| !v.is_null())
        .unwrap_or_else(|| {
            let mut m = Map::new();
            for (axis, _, _, _, _) in TYPE_AXES {
                m.insert(axis.into(), json!({"left":0,"right":0}));
            }
            Value::Object(m)
        });
    let mut out = json!({"code":code,"name":format!("{}형 {}",a.0,d.0),"oneLine":format!("{}, {} 움직이는 {} 창업가",if c[0]=='A' {"먼저 해 보고"} else {"먼저 계획하고"},if c[1]=='S' {"혼자 빠르게"} else {"함께 크게"},if c[3]=='C' {"도전형"} else {"안정형"}),"strengths":[a.1,d.1],"industries":unique(d.2,b.2),"categories":unique(a.3,k.3),"axisScores":scores});
    if let Some(caution) = match c[0] {
        'A' => Some("계획 없이 달리다 서류 마감을 놓칠 수 있어요"),
        'P' => Some("준비만 하다 시작이 늦어질 수 있어요"),
        _ => None,
    } {
        out["caution"] = json!(caution);
    }
    Some(out)
}
/// `scoreTypeTest(answers: Record<number, string>): TypeResult`
pub fn score_type_test(answers: &Value) -> Option<Value> {
    let mut scores = Map::new();
    let mut code = String::new();
    for (axis, left, right, _, _) in TYPE_AXES {
        let mut l = 0;
        let mut r = 0;
        for (id, a, _, _, _) in TYPE_QUESTIONS {
            if a == axis {
                let v = answers.get(id.to_string()).and_then(Value::as_str);
                if v == Some(left) {
                    l += 1;
                }
                if v == Some(right) {
                    r += 1;
                }
            }
        }
        scores.insert(axis.into(), json!({"left":l,"right":r}));
        code.push_str(if l >= r { left } else { right });
    }
    describe_type(&code, Some(&Value::Object(scores)))
}
/// `isValidTypeCode(code: unknown): code is string`
pub fn is_valid_type_code(code: &Value) -> bool {
    let Some(s) = code.as_str() else { return false };
    let c: Vec<char> = s.chars().collect();
    c.len() == 4
        && "AP".contains(c[0])
        && "ST".contains(c[1])
        && "DH".contains(c[2])
        && "CK".contains(c[3])
}
/// 함수 골든.
pub fn golden(f: &str, args: &[Value]) -> Option<Value> {
    match f {
        "isValidTypeCode" => Some(json!(is_valid_type_code(
            args.first().unwrap_or(&Value::Null)
        ))),
        "describeType" => describe_type(args.first()?.as_str()?, args.get(1)),
        "scoreTypeTest" => score_type_test(args.first()?),
        _ => None,
    }
}
