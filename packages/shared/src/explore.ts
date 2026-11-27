// 개정 기획(PR #7, 기준 커밋 380dc60) 계약: 창업 입문자의 자기주도 탐색 + 부울경 준비 경로.
// 원칙: 사용자 입력과 AI 제안·미검증을 구분한다. 지역 자료가 없으면 지어내지 않고 '확인 필요'로 둔다.
// 기존 계약(api.ts)은 지우지 않는다. 지원서·자동 제출·유형 테스트는 P2(후속)로 남는다.

// ---- F1 시작 정보 ----
export const READINESS_OPTIONS = [
  { value: 'no_idea', label: '관심은 있지만 아이디어가 없어요' },
  { value: 'has_idea', label: '생각해둔 아이디어가 있어요' },
  { value: 'preparing', label: '구체적으로 준비 중이에요' },
] as const;
export type ReadinessStage = (typeof READINESS_OPTIONS)[number]['value'];

/** 관심 산업 태그. UI·추천 데이터가 같은 이름을 쓴다. AI 와 2차전지는 따로다. */
export const INDUSTRY_TAGS = ['조선·해양', '자동차', '항공', '방산', '수소·에너지', '데이터센터', 'AI', '2차전지'] as const;
export type IndustryTag = (typeof INDUSTRY_TAGS)[number];
export const INTEREST_EXTRA = ['아직 모름', '기타'] as const;

/** 창업 검토 지역 (선택). 거주지·자격과 같은 값으로 쓰지 않는다. */
export const REVIEW_REGIONS = ['부산', '울산', '경남', '미정'] as const;
export type ReviewRegion = (typeof REVIEW_REGIONS)[number];
export const ACTIVITY_UNDECIDED = '미정';
export const IDEA_MAX_V2 = 200;

// ---- 출처·근거 표시 ----
/** 요약 항목의 출처: 직접 입력 / AI 제안·미검증 / 미정 */
export type Provenance = 'user' | 'ai' | 'unknown';
export const PROVENANCE_LABEL: Record<Provenance, string> = { user: '직접 입력', ai: 'AI 제안·미검증', unknown: '미정' };

export const EVIDENCE_LEVELS = ['인터뷰에서 확인', '기사·공식 자료에 보고', '조사 후보'] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

// ---- F21 데이터 (packages/shared/data/*.json, 팀이 검수해서 고친다) ----
export interface ProblemCard {
  id: string;
  region: ReviewRegion | '부울경';
  industryTags: IndustryTag[];
  title: string;
  affectedUser: string;
  situation: string;
  currentWorkaround: string | null; // 모르면 null = 미확인
  sourceType: '인터뷰' | '기사' | '공식 자료' | '조사 후보';
  sourceRef: string | null; // 공개 가능한 원문 URL 또는 기록 ID
  sourceExcerpt: string | null;
  evidenceLevel: EvidenceLevel;
  sourceDate: string | null; // YYYY-MM-DD
  checkedAt: string | null;
  currentStatus: 'confirmed' | 'unconfirmed';
  unknowns: string[];
  contextIds: string[];
  resourceIds: string[];
  test: boolean; // true = 팀 검수 전 테스트 자료
}

/** 지역 맥락 자료: 산업 배경 사실. 창업 수요·계약 가능성의 증거가 아니다. */
export interface RegionalContext {
  id: string;
  region: ReviewRegion | '부울경';
  industry: IndustryTag;
  background: string;
  url: string | null;
  excerpt: string | null;
  checkedAt: string | null;
  test: boolean;
}

export const RESOURCE_TYPES = ['교육', '상담', '공간', '지원사업'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type RecruitStatus = 'open' | 'closed' | 'always' | 'unknown';
export const RECRUIT_STATUS_LABEL: Record<RecruitStatus, string> = { open: '모집 중', closed: '종료', always: '상시 안내', unknown: '확인 필요' };

/** 지역 준비 경로 (교육·상담·공간·지원사업). */
export interface Resource {
  id: string;
  type: ResourceType;
  title: string;
  agency: string;
  url: string | null; // 공식 URL
  target: string | null; // 대상 설명
  stages: ReadinessStage[]; // 맞는 준비 단계
  content: string; // 얻을 도움 (실제 제공 범위)
  procedure: string | null; // 신청·문의 절차
  prep: string | null; // 사전 준비
  regions: (ReviewRegion | '부울경' | '전국')[]; // 이용 가능 지역
  affiliationLimit: string | null; // 소속 제한 (예: 재학생)
  costPeriod: string | null; // 기간·비용, 모르면 null
  recruitStatus: RecruitStatus; // 상시는 명시 근거가 있을 때만
  endDate: string | null; // YYYY-MM-DD, 시각 없음
  startDate?: string | null; // YYYY-MM-DD, 접수 시작·등록일. 모르면 null·없음
  checkedAt: string | null;
  sourceExcerpt: string | null;
  industryTags: IndustryTag[]; // 실제 지원 분야 (명시 근거 있을 때만)
  capabilityTags: string[]; // 교육·상담·시제품 등
  contextIds: string[];
  conditions: { ageMin?: number; ageMax?: number; ageAny?: boolean; residence?: string; business?: 'pre' | 'any' | 'registered' } | null; // null = 원문 조건 미확인
  test: boolean;
}

// ---- F4 조건 대조 ----
export type ConditionStatus = 'match' | 'check' | 'mismatch';
export const CONDITION_STATUS_LABEL: Record<ConditionStatus, string> = { match: '입력 조건 부합', check: '추가 확인 필요', mismatch: '명시 조건 불일치' };
export const CONDITION_NOTE = '입력 조건 부합은 수집·검수한 조건 범위의 비교이며 최종 신청 자격을 보장하지 않아요.';

/** '내 조건 확인'을 눌렀을 때만 받는다. 'unknown' 허용. */
export interface UserConditions {
  age?: number | 'unknown';
  residence?: string | 'unknown'; // 거주지 (구·군/지역)
  affiliation?: string | 'unknown';
  hasBusiness?: boolean | 'unknown';
}

export interface ConditionCheck { key: 'age' | 'residence' | 'business' | 'period'; label: string; status: ConditionStatus; detail: string }

// ---- F2·F3 탐색 ----
export type ExplorationOrigin = 'card' | 'custom' | 'hold';
export type DirectionStatus = 'user' | 'ai_suggested' | 'user_selected' | 'hold';
export const DIRECTION_STATUS_LABEL: Record<DirectionStatus, string> = { user: '사용자 입력', ai_suggested: 'AI 제안·미채택', user_selected: '사용자 선택', hold: '아직 탐색 중' };

export interface Exploration {
  problemId: string | null; // 직접 입력·보류면 null
  origin: ExplorationOrigin;
  customProblem: string | null; // 직접 적은 문제 (사용자 작성·외부 검증 전)
  selectionReason: string | null; // 사용자가 말한 관심 이유, AI 추정 금지
  direction: string | null;
  directionStatus: DirectionStatus;
  dataVersion: string; // 문제 카드 자료 버전 (data/version)
  suggestions: string[]; // AI 가 제안한 방향 (사용자가 요청했을 때만, 최대 2개)
}

/** F1 입력 (비회원). 기존 ConsultProfile 은 F4 조건용으로 남는다. */
export interface StartProfile {
  focusResourceId?: string;
  readiness?: ReadinessStage;
  idea?: string; // has_idea·preparing
  interests?: string[]; // INDUSTRY_TAGS + INTEREST_EXTRA, 복수
  interestNote?: string; // 직접 적기
  district?: string; // 활동 지역: 부산 구·군 또는 '미정'
  reviewRegion?: ReviewRegion; // 창업 검토 지역 (선택)
  conditions?: UserConditions; // F4 (선택)
}

export interface SummaryItem { text: string; provenance: Provenance }

/** F3 요약 v2. 원래 입력은 그대로, AI 가 채운 칸은 provenance='ai'. 출처 표시는 코드가 붙인다. */
export interface SummaryV2 {
  interest: SummaryItem; // 관심 분야와 하고 싶은 일
  target: SummaryItem; // 도움을 주고 싶은 대상
  value: SummaryItem; // 해결해보고 싶은 불편 또는 제공할 가치
  unknowns: SummaryItem; // 아직 확인하지 않은 사항
  exploration: {
    problem: { title: string; source: string | null; evidenceLevel: EvidenceLevel | '사용자 작성·외부 검증 전' | null } | null;
    reason: SummaryItem;
    direction: SummaryItem & { status: DirectionStatus };
    hypotheses: SummaryItem; // 확인할 고객·시장 가설
  };
}

export type RegionalStatus = 'has_basis' | 'needs_check' | 'weak';
export const REGIONAL_STATUS_LABEL: Record<RegionalStatus, string> = {
  has_basis: '검토할 근거 있음', needs_check: '추가 확인 필요', weak: '현재 자료로 연결 어려움',
};

/** 지역 검토 카드 (선택 필드). 없으면 웹은 카드만 생략한다. */
export interface RegionalContextCard {
  region: ReviewRegion;
  basis: string; // 지역 배경과 구상의 접점 (사실과 사용자 관심 연결을 분리해 설명)
  sourceIds: string[]; // RegionalContext id, 없으면 빈 배열 (사실 주장 생성 금지)
  customerHypothesis: SummaryItem; // provenance 'ai' = 미검증
  resourceIds: string[]; // 검수된 경로, 없으면 빈 배열
  status: RegionalStatus;
}

// ---- F12 준비 안내 ----
export interface PrepItem {
  id: string;
  title: string; // 무엇을 준비할지
  why: string; // 지금 필요한 이유
  how: string; // 진행 방법
  output: string; // 준비 결과로 남길 것
  resourceId?: string; // 연결된 실제 기관·교육 (운영 범위 안에서)
  source: 'rule' | 'ai'; // 규칙 템플릿 또는 AI 문장 (AI 는 'AI 제안·미검증' 표시)
  done: boolean; // '준비 완료 표시' (실제 수행 증거 아님)
}

// ---- F5·F6 추천 ----
export interface ResourceCard {
  resource: Resource;
  reason: string; // 구상의 어떤 준비를 돕는지 (지역이라서만 쓰지 않음)
  reasonProvenance: 'rule' | 'ai';
  condition: { status: ConditionStatus; checks: ConditionCheck[] };
  regionMatch: boolean; // 사용자 검토 지역과 연결 (동순위 정렬에만 사용)
  views?: number; // 많이 본 공모 순서에 쓰는 조회 수 (목록·상세 응답에만 붙는다)
  liked?: boolean; // 로그인 사용자가 관심 표시(하트)한 자료
  fit?: number; // '나에게 맞는 순' 점수 (하트 비슷함 + 내 정보 조건 + 준비 단계). 목록 응답에만
}

/** 지원 목록 정렬: 나에게 맞는 순 / 최근 공모 / 많이 본 공모 / 마감 임박. */
export const RESOURCE_SORTS = ['fit', 'recent', 'popular', 'deadline'] as const;
export type ResourceSort = (typeof RESOURCE_SORTS)[number];
export const RESOURCE_SORT_LABEL: Record<ResourceSort, string> = { fit: '나에게 맞는 순', recent: '최근 공모', popular: '많이 본 공모', deadline: '마감 임박' };

/** 데이터 버전. 문제 카드가 바뀌면 올린다. */
export const EXPLORE_DATA_VERSION = '2026-11-27.no-test-data';

// ---- 상담 횟수 제한 ----
/**
 * 상담 1회 = 탐색 세션에서 첫 질문을 받는 순간 (POST /api/explore/chat, 대화가 비어 있을 때).
 * 1인당 7일(연속 168시간) 3회. 사람 단위: 로그인 사용자 id, 게스트는 기기 쿠키 + 접속 IP 해시를 함께 센다
 * (초기화·쿠키 삭제로 횟수가 돌아오지 않게). 초기화해도 이미 쓴 횟수는 돌려주지 않는다.
 */
export const CONSULT_LIMIT = { count: 3, windowDays: 7 } as const;
export interface ConsultQuota {
  used: number;
  limit: number;
  remaining: number;
  resetAt: string | null; // 가장 오래된 상담이 7일이 지나 1회가 돌아오는 시각 (ISO), 남은 횟수가 있으면 null 가능
}

// ---- 브라우저 로컬 AI (Chrome 내장 Prompt API) ----
/**
 * 웹이 로컬 AI 로 문장을 다듬을 수 있으면 이 헤더에 작업 이름을 쉼표로 보낸다 (예: 'mentor,reason,field').
 * 서버는 그 작업에서 Solar 를 부르지 않고 규칙 문장만 돌려준다. 웹은 shared guardText 로 같은 사실 검사를 한다.
 * 로컬 AI 는 Chrome LanguageModel.availability({ ko }) 가 'available' 일 때만 쓴다 (다운로드를 시작하지 않는다).
 */
export const LOCAL_AI_HEADER = 'x-local-ai';
export const LOCAL_AI_TASKS = ['mentor', 'reason', 'field'] as const;
export type LocalAiTask = (typeof LOCAL_AI_TASKS)[number];

// ---- F12 선택 보완: 현장에 확인할 질문 (P1, PR #7 d6eb693) ----
export interface FieldQuestion {
  id: string;
  question: string; // 현재 방식·실제 경험을 먼저 묻는 일반 질문. 어려움·구매 의향을 전제하지 않는다
  purpose: string; // 질문 의도
  source: 'rule' | 'ai';
}
/** 상태는 항상 '현장 확인 전'. AI 가 응답자·답변·검증 결과를 만들지 않는다. */
export const FIELD_STATUS_LABEL = '현장 확인 전';
