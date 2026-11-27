import type {
  AFFILIATIONS, BIZ_FORMS, CUSTOMER_AGES, CUSTOMER_REGIONS, CUSTOMER_TYPES, INDUSTRIES,
  READINESS, REVENUE_MODELS, STAGES, SUPPORT_NEEDS, TEAM_SIZES, APPLICATION_STATUS_LABEL,
} from './constants';

export type Stage = (typeof STAGES)[number]['value'];
export type Affiliation = (typeof AFFILIATIONS)[number];
export type TeamSize = (typeof TEAM_SIZES)[number];
export type Industry = (typeof INDUSTRIES)[number];
export type BizForm = (typeof BIZ_FORMS)[number];
export type Readiness = (typeof READINESS)[number];
export type RevenueModel = (typeof REVENUE_MODELS)[number];
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export type CustomerAge = (typeof CUSTOMER_AGES)[number];
export type CustomerRegion = (typeof CUSTOMER_REGIONS)[number];
export type SupportNeed = (typeof SUPPORT_NEEDS)[number];

/** 날짜는 한국 시간 기준 'YYYY-MM-DD' 문자열. */
export type IsoDate = string;

/**
 * 지원사업 공고. K-Startup `getAnnouncementInformation02` 필드를 옮긴 모양.
 * 원본 필드 이름은 kstartup.ts 의 fromKStartup 참고.
 */
export interface Program {
  id: string; // pbanc_sn
  title: string; // biz_pbanc_nm
  agency: string; // pbanc_ntrp_nm
  category: string; // supt_biz_clsfc
  region: string | null; // supt_regin (예: '부산', '전국', '경남')
  startDate: IsoDate | null; // pbanc_rcpt_bgng_dt
  endDate: IsoDate | null; // pbanc_rcpt_end_dt, null = 상시
  recruiting: boolean; // rcrt_prgs_yn === 'Y'
  target: string | null; // aply_trgt
  bizYears: string | null; // biz_enyy (예: '예비창업자,1년미만,3년미만')
  targetAge: string | null; // biz_trgt_age (예: '만 20세 이상 ~ 만 39세 이하')
  content: string; // support_ctnt
  url: string; // detl_pg_url
  registeredAt: IsoDate;
  tags: string[]; // 검색·관련도용 키워드 (팀이 붙임)
}

export type Verdict = 'eligible' | 'check' | 'ineligible';
export type CheckStatus = 'pass' | 'fail' | 'unknown';
export type CheckKey = 'deadline' | 'region' | 'age' | 'years';

export interface EligibilityCheck {
  key: CheckKey;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface Eligibility {
  programId: string;
  verdict: Verdict;
  checks: EligibilityCheck[];
}

/** 사전 상담 폼(F1). 자동 저장 때문에 대부분 선택값이다. 필수 검사는 validateProfileSection. */
export interface ConsultProfile {
  // A. 나에 대해
  age?: number;
  stage?: Stage;
  openedAt?: IsoDate;
  district?: string; // BUSAN_DISTRICTS 또는 OUTSIDE_BUSAN
  affiliation?: Affiliation;
  teamSize?: TeamSize;
  typeCode?: string; // F19 결과
  // B. 하고 싶은 사업
  idea?: string;
  industry?: Industry;
  bizForm?: BizForm;
  problem?: string;
  readiness?: Readiness;
  revenue?: RevenueModel[];
  // C. 타겟 고객
  customerType?: CustomerType;
  customerAges?: CustomerAge[];
  customerRegion?: CustomerRegion;
  customerDesc?: string;
  alternative?: string;
  needs?: SupportNeed[];
}

export type ProfileSection = 'me' | 'business' | 'customer';

export interface FieldError {
  field: keyof ConsultProfile;
  message: string;
}

export interface ChatMessage {
  role: 'mentor' | 'user';
  text: string;
  at: string; // ISO 시각
  questionIndex?: number; // 멘토 질문이면 0..2
  skipped?: boolean;
}

/** 아이디어 1장 요약(F3). */
export interface IdeaSummary {
  problem: string;
  customer: string;
  solution: string;
  revenue: string;
  busan: string;
}

export interface ProgramCard {
  program: Program;
  dDay: number | null; // null = 상시
  eligibility: Eligibility | null; // 로그인+프로필 있을 때만
}

export interface Recommendation extends ProgramCard {
  score: number;
  reason: string; // F6, 데이터에 있는 내용만
  feedback: boolean | null; // F10 관련 있음/없음
}

export interface Agency {
  id: string;
  name: string;
  address: string;
  role: string;
  url: string;
  districts: string[]; // 가까운 구. 빈 배열 = 부산 전체
  forAffiliations: string[]; // 빈 배열 = 누구나
}

export interface PlanItem {
  day: number; // 1..7
  task: string;
  programId?: string;
  done: boolean;
}

export interface User {
  id: string;
  email: string;
  isTeam: boolean;
  createdAt: string;
  /** 이메일 인증을 마쳤는지. 창업 준비는 인증 후에만 쓸 수 있다. 없으면 false 로 본다 */
  emailVerified?: boolean;
  /** 복구 비밀번호로 로그인했으면 true → 새 비밀번호를 정할 때까지 다른 기능을 막는다 */
  mustChangePassword?: boolean;
}

export type ApplicationStatus = keyof typeof APPLICATION_STATUS_LABEL;

export interface FormField {
  key: string;
  label: string;
  maxLength: number | null;
  required: boolean;
  identity?: boolean; // 신원 정보: AI가 채우지 않는다
  value: string;
}

export interface Approval {
  at: string;
  values: Record<string, string>;
}

export interface Application {
  id: string;
  userId: string;
  programId: string;
  status: ApplicationStatus;
  channel: 'web' | 'email' | 'mock';
  formFileName: string;
  fields: FormField[];
  approval: Approval | null;
  receiptNo: string | null;
  receiptImageUrl: string | null;
  failReason: string | null;
  retries: number;
  history: { status: ApplicationStatus; at: string }[];
  createdAt: string;
  updatedAt: string;
}

export type TypeAxis = 'AP' | 'ST' | 'DH' | 'CK';

export interface TypeQuestion {
  id: number;
  axis: TypeAxis;
  text: string;
  options: [{ letter: string; text: string }, { letter: string; text: string }];
}

export interface TypeResult {
  code: string; // 예: 'APDC'
  name: string;
  oneLine: string;
  strengths: [string, string];
  caution: string;
  industries: string[];
  categories: string[]; // 먼저 볼 지원 분야
  axisScores: Record<TypeAxis, { left: number; right: number }>;
}

export interface Stats {
  users: number;
  consultsCompleted: number;
  discoveryRate: number | null; // 0..1
  relevanceRate: number | null;
  submitSuccessRate: number | null;
  testToConsultRate: number | null;
}
