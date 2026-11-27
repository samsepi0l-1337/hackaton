//! TS 원본: packages/shared/src/explore.ts
use serde::{Deserialize, Deserializer, Serialize};

/// TS: `(typeof READINESS_OPTIONS)[number]`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ReadinessOption {
    pub value: &'static str,
    pub label: &'static str,
}
/// TS: `READINESS_OPTIONS` (준비 단계와 표시 이름).
pub const READINESS_OPTIONS: [ReadinessOption; 3] = [
    ReadinessOption {
        value: "no_idea",
        label: "관심은 있지만 아이디어가 없어요",
    },
    ReadinessOption {
        value: "has_idea",
        label: "생각해둔 아이디어가 있어요",
    },
    ReadinessOption {
        value: "preparing",
        label: "구체적으로 준비 중이에요",
    },
];
/// TS: `type ReadinessStage = (typeof READINESS_OPTIONS)[number]['value']`.
pub type ReadinessStage = String;
/// TS: `INDUSTRY_TAGS` — 관심 산업 태그.
pub const INDUSTRY_TAGS: [&str; 8] = [
    "조선·해양",
    "자동차",
    "항공",
    "방산",
    "수소·에너지",
    "데이터센터",
    "AI",
    "2차전지",
];
/// TS: `type IndustryTag = (typeof INDUSTRY_TAGS)[number]`.
pub type IndustryTag = String;
/// TS: `INTEREST_EXTRA`.
pub const INTEREST_EXTRA: [&str; 2] = ["아직 모름", "기타"];
/// TS: `REVIEW_REGIONS` — 창업 검토 지역.
pub const REVIEW_REGIONS: [&str; 4] = ["부산", "울산", "경남", "미정"];
/// TS: `type ReviewRegion = (typeof REVIEW_REGIONS)[number]`.
pub type ReviewRegion = String;
/// TS: `ACTIVITY_UNDECIDED`.
pub const ACTIVITY_UNDECIDED: &str = "미정";
/// TS: `IDEA_MAX_V2`.
pub const IDEA_MAX_V2: usize = 200;
/// TS: `type Provenance = 'user' | 'ai' | 'unknown'`.
pub type Provenance = String;
/// TS: `PROVENANCE_LABEL: Record<Provenance, string>`.
pub const PROVENANCE_LABEL: [(&str, &str); 3] = [
    ("user", "직접 입력"),
    ("ai", "AI 제안·미검증"),
    ("unknown", "미정"),
];
/// TS: `EVIDENCE_LEVELS`.
pub const EVIDENCE_LEVELS: [&str; 3] = ["인터뷰에서 확인", "기사·공식 자료에 보고", "조사 후보"];
/// TS: `type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number]`.
pub type EvidenceLevel = String;

/// TS: `interface ProblemCard` — 모르면 null = 미확인.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProblemCard {
    pub id: String,
    pub region: String,
    pub industry_tags: Vec<IndustryTag>,
    pub title: String,
    pub affected_user: String,
    pub situation: String,
    pub current_workaround: Option<String>,
    pub source_type: String,
    pub source_ref: Option<String>,
    pub source_excerpt: Option<String>,
    pub evidence_level: EvidenceLevel,
    pub source_date: Option<String>,
    pub checked_at: Option<String>,
    pub current_status: String,
    pub unknowns: Vec<String>,
    pub context_ids: Vec<String>,
    pub resource_ids: Vec<String>,
    pub test: bool,
}
/// TS: `interface RegionalContext` — 산업 배경 사실, 창업 수요의 증거가 아니다.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionalContext {
    pub id: String,
    pub region: String,
    pub industry: IndustryTag,
    pub background: String,
    pub url: Option<String>,
    pub excerpt: Option<String>,
    pub checked_at: Option<String>,
    pub test: bool,
}
/// TS: `RESOURCE_TYPES`.
pub const RESOURCE_TYPES: [&str; 4] = ["교육", "상담", "공간", "지원사업"];
/// TS: `type ResourceType = (typeof RESOURCE_TYPES)[number]`.
pub type ResourceType = String;
/// TS: `type RecruitStatus = 'open' | 'closed' | 'always' | 'unknown'`.
pub type RecruitStatus = String;
/// TS: `RECRUIT_STATUS_LABEL: Record<RecruitStatus, string>`.
pub const RECRUIT_STATUS_LABEL: [(&str, &str); 4] = [
    ("open", "모집 중"),
    ("closed", "종료"),
    ("always", "상시 안내"),
    ("unknown", "확인 필요"),
];

/// TS string union values not otherwise exposed as arrays.
pub const READINESS_STAGES: [&str; 3] = ["no_idea", "has_idea", "preparing"];
/// TS: `Provenance` values.
pub const PROVENANCES: [&str; 3] = ["user", "ai", "unknown"];
/// TS: `RecruitStatus` values.
pub const RECRUIT_STATUSES: [&str; 4] = ["open", "closed", "always", "unknown"];
/// TS: `ConditionStatus` values.
pub const CONDITION_STATUSES: [&str; 3] = ["match", "check", "mismatch"];
/// TS: `ExplorationOrigin` values.
pub const EXPLORATION_ORIGINS: [&str; 3] = ["card", "custom", "hold"];
/// TS: `DirectionStatus` values.
pub const DIRECTION_STATUSES: [&str; 4] = ["user", "ai_suggested", "user_selected", "hold"];
/// TS: `RegionalStatus` values.
pub const REGIONAL_STATUSES: [&str; 3] = ["has_basis", "needs_check", "weak"];

// 선택적 null과 키 없음은 서로 다르다.
fn present_nullable<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}
/// TS: `Resource['conditions']` (null이면 원문 조건 미확인).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceConditions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub age_min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub age_max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub age_any: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub residence: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub business: Option<String>,
}
/// TS: `interface Resource` — 지역 준비 경로.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Resource {
    pub id: String,
    pub r#type: ResourceType,
    pub title: String,
    pub agency: String,
    pub url: Option<String>,
    pub target: Option<String>,
    pub stages: Vec<ReadinessStage>,
    pub content: String,
    pub procedure: Option<String>,
    pub prep: Option<String>,
    pub regions: Vec<String>,
    pub affiliation_limit: Option<String>,
    pub cost_period: Option<String>,
    pub recruit_status: RecruitStatus,
    pub end_date: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present_nullable"
    )]
    pub start_date: Option<Option<String>>,
    pub checked_at: Option<String>,
    pub source_excerpt: Option<String>,
    pub industry_tags: Vec<IndustryTag>,
    pub capability_tags: Vec<String>,
    pub context_ids: Vec<String>,
    pub conditions: Option<ResourceConditions>,
    pub test: bool,
}
/// TS: `type ConditionStatus = 'match' | 'check' | 'mismatch'`.
pub type ConditionStatus = String;
/// TS: `CONDITION_STATUS_LABEL: Record<ConditionStatus, string>`.
pub const CONDITION_STATUS_LABEL: [(&str, &str); 3] = [
    ("match", "입력 조건 부합"),
    ("check", "추가 확인 필요"),
    ("mismatch", "명시 조건 불일치"),
];
/// TS: `CONDITION_NOTE`.
pub const CONDITION_NOTE: &str =
    "입력 조건 부합은 수집·검수한 조건 범위의 비교이며 최종 신청 자격을 보장하지 않아요.";
/// TS: `number | 'unknown'`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AgeOrUnknown {
    Number(f64),
    Unknown(String),
}
/// TS: `boolean | 'unknown'`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum BoolOrUnknown {
    Bool(bool),
    Unknown(String),
}
/// TS: `interface UserConditions` — '내 조건 확인'을 눌렀을 때만 받는다.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserConditions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub age: Option<AgeOrUnknown>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub residence: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub affiliation: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_business: Option<BoolOrUnknown>,
}
/// TS: `interface ConditionCheck { key: 'age' | 'residence' | 'business' | 'period'; label: string; status: ConditionStatus; detail: string }`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConditionCheck {
    pub key: String,
    pub label: String,
    pub status: ConditionStatus,
    pub detail: String,
}
/// TS: `type ExplorationOrigin = 'card' | 'custom' | 'hold'`.
pub type ExplorationOrigin = String;
/// TS: `type DirectionStatus = 'user' | 'ai_suggested' | 'user_selected' | 'hold'`.
pub type DirectionStatus = String;
/// TS: `DIRECTION_STATUS_LABEL: Record<DirectionStatus, string>`.
pub const DIRECTION_STATUS_LABEL: [(&str, &str); 4] = [
    ("user", "사용자 입력"),
    ("ai_suggested", "AI 제안·미채택"),
    ("user_selected", "사용자 선택"),
    ("hold", "아직 탐색 중"),
];
/// TS: `interface Exploration`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Exploration {
    pub problem_id: Option<String>,
    pub origin: ExplorationOrigin,
    pub custom_problem: Option<String>,
    pub selection_reason: Option<String>,
    pub direction: Option<String>,
    pub direction_status: DirectionStatus,
    pub data_version: String,
    pub suggestions: Vec<String>,
}
/// TS: `interface StartProfile` — F1 입력 (비회원).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartProfile {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focus_resource_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub readiness: Option<ReadinessStage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idea: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interests: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interest_note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub district: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_region: Option<ReviewRegion>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conditions: Option<UserConditions>,
}
/// TS: `interface SummaryItem { text: string; provenance: Provenance }`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryItem {
    pub text: String,
    pub provenance: Provenance,
}
/// TS: `SummaryV2['exploration']['problem']`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryProblem {
    pub title: String,
    pub source: Option<String>,
    pub evidence_level: Option<String>,
}
/// TS: `SummaryItem & { status: DirectionStatus }`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryDirection {
    pub text: String,
    pub provenance: Provenance,
    pub status: DirectionStatus,
}
/// TS: `SummaryV2['exploration']`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryExploration {
    pub problem: Option<SummaryProblem>,
    pub reason: SummaryItem,
    pub direction: SummaryDirection,
    pub hypotheses: SummaryItem,
}
/// TS: `interface SummaryV2` — AI 가 채운 칸은 provenance='ai'.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryV2 {
    pub interest: SummaryItem,
    pub target: SummaryItem,
    pub value: SummaryItem,
    pub unknowns: SummaryItem,
    pub exploration: SummaryExploration,
}
/// TS: `type RegionalStatus = 'has_basis' | 'needs_check' | 'weak'`.
pub type RegionalStatus = String;
/// TS: `REGIONAL_STATUS_LABEL: Record<RegionalStatus, string>`.
pub const REGIONAL_STATUS_LABEL: [(&str, &str); 3] = [
    ("has_basis", "검토할 근거 있음"),
    ("needs_check", "추가 확인 필요"),
    ("weak", "현재 자료로 연결 어려움"),
];
/// TS: `interface RegionalContextCard` — 지역 검토 카드.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionalContextCard {
    pub region: ReviewRegion,
    pub basis: String,
    pub source_ids: Vec<String>,
    pub customer_hypothesis: SummaryItem,
    pub resource_ids: Vec<String>,
    pub status: RegionalStatus,
}
/// TS: `interface PrepItem` — 준비 안내.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepItem {
    pub id: String,
    pub title: String,
    pub why: String,
    pub how: String,
    pub output: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_id: Option<String>,
    pub source: String,
    pub done: bool,
}
/// TS: `ResourceCard['condition']`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceCardCondition {
    pub status: ConditionStatus,
    pub checks: Vec<ConditionCheck>,
}
/// TS: `interface ResourceCard`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceCard {
    pub resource: Resource,
    pub reason: String,
    pub reason_provenance: String,
    pub condition: ResourceCardCondition,
    pub region_match: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub views: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub liked: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fit: Option<f64>,
}
/// TS: `RESOURCE_SORTS`.
pub const RESOURCE_SORTS: [&str; 4] = ["fit", "recent", "popular", "deadline"];
/// TS: `type ResourceSort = (typeof RESOURCE_SORTS)[number]`.
pub type ResourceSort = String;
/// TS: `RESOURCE_SORT_LABEL: Record<ResourceSort, string>`.
pub const RESOURCE_SORT_LABEL: [(&str, &str); 4] = [
    ("fit", "나에게 맞는 순"),
    ("recent", "최근 공모"),
    ("popular", "많이 본 공모"),
    ("deadline", "마감 임박"),
];
/// TS: `EXPLORE_DATA_VERSION`.
pub const EXPLORE_DATA_VERSION: &str = "2026-11-27.no-test-data";
/// TS: `CONSULT_LIMIT` 값의 형식.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsultLimit {
    pub count: u32,
    pub window_days: u32,
}
/// TS: `CONSULT_LIMIT = { count: 12, windowDays: 7 }` — 사용자가 보낸 채팅 메시지 7일 12회.
pub const CONSULT_LIMIT: ConsultLimit = ConsultLimit {
    count: 12,
    window_days: 7,
};
/// TS: `interface ConsultQuota`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsultQuota {
    pub used: f64,
    pub limit: f64,
    pub remaining: f64,
    pub reset_at: Option<String>,
}
/// TS: `LOCAL_AI_HEADER`.
pub const LOCAL_AI_HEADER: &str = "x-local-ai";
/// TS: `LOCAL_AI_TASKS`.
pub const LOCAL_AI_TASKS: [&str; 3] = ["mentor", "reason", "field"];
/// TS: `type LocalAiTask = (typeof LOCAL_AI_TASKS)[number]`.
pub type LocalAiTask = String;
/// TS: `interface FieldQuestion` — 현장에 확인할 질문.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldQuestion {
    pub id: String,
    pub question: String,
    pub purpose: String,
    pub source: String,
}
/// TS: `FIELD_STATUS_LABEL` — AI 가 검증 결과를 만들지 않는다.
pub const FIELD_STATUS_LABEL: &str = "현장 확인 전";

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{de::DeserializeOwned, Serialize};
    use serde_json::{json, Value};
    fn round_trip<T: DeserializeOwned + Serialize>(sample: Value) {
        let record: T = serde_json::from_value(sample.clone()).unwrap();
        assert_eq!(serde_json::to_value(record).unwrap(), sample);
    }
    #[test]
    fn constants() {
        assert_eq!(READINESS_OPTIONS[0].value, "no_idea");
        assert_eq!(
            READINESS_OPTIONS[0].label,
            "관심은 있지만 아이디어가 없어요"
        );
        assert_eq!(INDUSTRY_TAGS[6..], ["AI", "2차전지"]);
        assert_eq!(RESOURCE_SORTS, ["fit", "recent", "popular", "deadline"]);
        assert_eq!(CONSULT_LIMIT.window_days, 7);
        assert_eq!(EXPLORE_DATA_VERSION, "2026-11-27.no-test-data");
        assert_eq!(FIELD_STATUS_LABEL, "현장 확인 전");
    }
    #[test]
    fn records_round_trip() {
        round_trip::<ProblemCard>(
            json!({"id":"p","region":"부울경","industryTags":["AI"],"title":"t","affectedUser":"u","situation":"s","currentWorkaround":null,"sourceType":"조사 후보","sourceRef":null,"sourceExcerpt":null,"evidenceLevel":"조사 후보","sourceDate":null,"checkedAt":null,"currentStatus":"unconfirmed","unknowns":[],"contextIds":[],"resourceIds":[],"test":false}),
        );
        round_trip::<RegionalContext>(
            json!({"id":"c","region":"부산","industry":"AI","background":"b","url":null,"excerpt":null,"checkedAt":null,"test":false}),
        );
        let resource = json!({"id":"r","type":"교육","title":"t","agency":"a","url":null,"target":null,"stages":[],"content":"c","procedure":null,"prep":null,"regions":["전국"],"affiliationLimit":null,"costPeriod":null,"recruitStatus":"unknown","endDate":null,"startDate":null,"checkedAt":null,"sourceExcerpt":null,"industryTags":[],"capabilityTags":[],"contextIds":[],"conditions":{"ageMin":20.0},"test":false});
        round_trip::<Resource>(resource.clone());
        let mut absent = resource.clone();
        absent.as_object_mut().unwrap().remove("startDate");
        round_trip::<Resource>(absent);
        round_trip::<UserConditions>(json!({"age":"unknown","hasBusiness":false}));
        round_trip::<ConditionCheck>(
            json!({"key":"age","label":"l","status":"check","detail":"d"}),
        );
        round_trip::<Exploration>(
            json!({"problemId":null,"origin":"hold","customProblem":null,"selectionReason":null,"direction":null,"directionStatus":"hold","dataVersion":"v","suggestions":[]}),
        );
        round_trip::<StartProfile>(
            json!({"readiness":"no_idea","conditions":{"hasBusiness":"unknown"}}),
        );
        let item = json!({"text":"t","provenance":"user"});
        round_trip::<SummaryItem>(item.clone());
        round_trip::<SummaryV2>(
            json!({"interest":item,"target":item,"value":item,"unknowns":item,"exploration":{"problem":{"title":"t","source":null,"evidenceLevel":null},"reason":item,"direction":{"text":"t","provenance":"ai","status":"ai_suggested"},"hypotheses":item}}),
        );
        round_trip::<RegionalContextCard>(
            json!({"region":"부산","basis":"b","sourceIds":[],"customerHypothesis":item,"resourceIds":[],"status":"needs_check"}),
        );
        round_trip::<PrepItem>(
            json!({"id":"i","title":"t","why":"w","how":"h","output":"o","source":"rule","done":false}),
        );
        round_trip::<ResourceCard>(
            json!({"resource":resource,"reason":"r","reasonProvenance":"rule","condition":{"status":"check","checks":[]},"regionMatch":false,"liked":true}),
        );
        round_trip::<ConsultQuota>(json!({"used":1.0,"limit":3.0,"remaining":2.0,"resetAt":null}));
        round_trip::<FieldQuestion>(json!({"id":"i","question":"q","purpose":"p","source":"rule"}));
    }
}
