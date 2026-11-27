//! TS 원본: packages/shared/src/constants.ts

/// TS: export const TIMEZONE = 'Asia/Seoul';
pub const TIMEZONE: &str = "Asia/Seoul";
/// TS: export const AGE_MIN = 15;
pub const AGE_MIN: i64 = 15;
/// TS: export const AGE_MAX = 34;
pub const AGE_MAX: i64 = 34;
/// TS: export const IDEA_MAX = 200;
pub const IDEA_MAX: i64 = 200;
/// TS: export const PROBLEM_MAX = 300;
pub const PROBLEM_MAX: i64 = 300;
/// TS: export const CUSTOMER_DESC_MAX = 200;
pub const CUSTOMER_DESC_MAX: i64 = 200;
/// TS: export const PASSWORD_MIN = 8;
pub const PASSWORD_MIN: i64 = 8;
/// TS: export const MENTOR_QUESTION_COUNT = 3;
pub const MENTOR_QUESTION_COUNT: i64 = 3;
/// TS: export const TOP_N = 3;
pub const TOP_N: i64 = 3;
/// TS: export const PAGE_SIZE = 20;
pub const PAGE_SIZE: i64 = 20;
/// TS: export const DUE_SOON_DAYS = 7;
pub const DUE_SOON_DAYS: i64 = 7;
/// TS: export const STAGES: readonly { value: string; label: string }[];
pub const STAGES: &[(&str, &str)] = &[
    ("pre", "예비(사업자 없음)"),
    ("lt1", "1년 미만"),
    ("1to3", "1~3년"),
    ("3to7", "3~7년"),
];
/// TS: export const BUSAN_DISTRICTS: readonly string[];
pub const BUSAN_DISTRICTS: &[&str] = &[
    "중구",
    "서구",
    "동구",
    "영도구",
    "부산진구",
    "동래구",
    "남구",
    "북구",
    "해운대구",
    "사하구",
    "금정구",
    "강서구",
    "연제구",
    "수영구",
    "사상구",
    "기장군",
];
/// TS: export const OUTSIDE_BUSAN = '부산 외';
pub const OUTSIDE_BUSAN: &str = "부산 외";
/// TS: export const AFFILIATIONS: readonly string[];
pub const AFFILIATIONS: &[&str] = &["대학생", "대학원생", "직장인", "무직", "기타"];
/// TS: export const TEAM_SIZES: readonly string[];
pub const TEAM_SIZES: &[&str] = &["혼자", "2~3명", "4명 이상"];
/// TS: export const INDUSTRIES: readonly string[];
pub const INDUSTRIES: &[&str] = &[
    "IT·플랫폼",
    "제조",
    "식품·외식",
    "관광·문화",
    "교육",
    "헬스케어",
    "해양·물류",
    "친환경",
    "커머스",
    "기타",
];
/// TS: export const BIZ_FORMS: readonly string[];
pub const BIZ_FORMS: &[&str] = &[
    "앱·웹 서비스",
    "제품 판매",
    "오프라인 매장",
    "대행·용역",
    "기타",
];
/// TS: export const READINESS: readonly string[];
pub const READINESS: &[&str] = &["아이디어만", "조사 중", "시제품 있음", "매출 있음"];
/// TS: export const REVENUE_MODELS: readonly string[];
pub const REVENUE_MODELS: &[&str] = &["판매", "구독", "수수료", "광고", "아직 모름"];
/// TS: export const CUSTOMER_TYPES: readonly string[];
pub const CUSTOMER_TYPES: &[&str] = &["B2C", "B2B", "B2G"];
/// TS: export const CUSTOMER_AGES: readonly string[];
pub const CUSTOMER_AGES: &[&str] = &["10대", "20대", "30대", "40대", "50대 이상", "무관"];
/// TS: export const CUSTOMER_REGIONS: readonly string[];
pub const CUSTOMER_REGIONS: &[&str] = &["부산", "동남권", "전국", "해외"];
/// TS: export const SUPPORT_NEEDS: readonly string[];
pub const SUPPORT_NEEDS: &[&str] = &[
    "자금",
    "공간",
    "멘토링·교육",
    "판로·마케팅",
    "시제품 제작",
    "네트워킹",
];
/// K-Startup 지원 분야 `supt_biz_clsfc` 값. TS: export const PROGRAM_CATEGORIES: readonly string[];
pub const PROGRAM_CATEGORIES: &[&str] = &[
    "사업화",
    "창업교육",
    "시설·공간·보육",
    "멘토링·컨설팅",
    "판로·해외진출",
    "행사·네트워크",
    "기술개발(R&D)",
    "융자",
];
/// 지원 분야 → 필요한 지원. TS: export const CATEGORY_TO_NEEDS: Record<string, readonly string[]>;
pub const CATEGORY_TO_NEEDS: &[(&str, &[&str])] = &[
    ("사업화", &["자금", "시제품 제작"]),
    ("창업교육", &["멘토링·교육"]),
    ("시설·공간·보육", &["공간"]),
    ("멘토링·컨설팅", &["멘토링·교육"]),
    ("판로·해외진출", &["판로·마케팅"]),
    ("행사·네트워크", &["네트워킹"]),
    ("기술개발(R&D)", &["자금", "시제품 제작"]),
    ("융자", &["자금"]),
];
/// TS: export const VERDICT_LABEL: { eligible: string; check: string; ineligible: string };
pub const VERDICT_LABEL: &[(&str, &str)] = &[
    ("eligible", "가능"),
    ("check", "확인 필요"),
    ("ineligible", "불가"),
];
/// 추천 점수(F5). TS: export const SCORE: { relevancePerKeyword: 10; relevanceMax: 40; industryMatch: 15; needMatch: 20; dueSoonBonus: 10; checkPenalty: -15 };
pub const SCORE: &[(&str, i64)] = &[
    ("relevancePerKeyword", 10),
    ("relevanceMax", 40),
    ("industryMatch", 15),
    ("needMatch", 20),
    ("dueSoonBonus", 10),
    ("checkPenalty", -15),
];
/// TS: export const APPLICATION_STATUS_LABEL: Record<string, string>;
pub const APPLICATION_STATUS_LABEL: &[(&str, &str)] = &[
    ("preparing", "양식 준비"),
    ("drafting", "작성 중"),
    ("awaiting_approval", "승인 대기"),
    ("filling", "입력 중"),
    ("action_required", "사용자 조치 필요"),
    ("submitting", "제출 중"),
    ("completed", "완료"),
    ("failed", "실패"),
];
