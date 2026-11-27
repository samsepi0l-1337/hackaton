// API 계약. 경로·요청·응답 모양은 여기서만 정한다. API와 웹이 이 파일을 같이 쓴다.
// 모든 경로 앞에 /api. 인증은 HttpOnly 세션 쿠키 `sid`. 오류는 ApiError 모양, 상태 코드는 아래 주석.
import type {
  ExplorationOrigin, DirectionStatus, Exploration, ProblemCard, RegionalContext, RegionalContextCard, PrepItem,
  ResourceCard, StartProfile, SummaryV2, ConsultQuota, FieldQuestion,
} from './explore';
import type { READINESS_OPTIONS } from './explore';
import type {
  Agency, Application, ChatMessage, ConsultProfile, Eligibility, FieldError, IdeaSummary, PlanItem,
  Program, ProgramCard, Recommendation, Stage, Stats, TypeResult, User, Verdict,
} from './types';

export const SESSION_COOKIE = 'sid';

export type ErrorCode =
  | 'bad_request' // 400
  | 'validation' // 400, fields 포함
  | 'unauthorized' // 401 로그인 필요
  | 'forbidden' // 403 팀 계정 아님 등
  | 'not_found' // 404
  | 'conflict' // 409 이미 가입한 이메일, 중복 제출
  | 'closed' // 409 마감 지남
  | 'approval_required' // 409 승인 없이 제출
  | 'limit' // 429 상담 횟수 초과 (error.quota 포함)
  | 'email_unverified' // 403 이메일 인증 전 (창업 준비 불가)
  | 'password_change_required' // 403 복구 비밀번호로 로그인함 → 새 비밀번호를 먼저 정해야 함
  | 'too_many'; // 429 인증 메일·복구 메일 요청이 너무 잦음

export interface ApiError {
  error: { code: ErrorCode; message: string; fields?: FieldError[]; quota?: ConsultQuota };
}

export const ROUTES = {
  health: '/api/health', // GET → { ok: true }
  home: '/api/home', // GET → HomeResponse
  programs: '/api/programs', // GET ?ProgramListQuery → ProgramListResponse
  program: (id: string) => `/api/programs/${encodeURIComponent(id)}`, // GET → ProgramDetailResponse
  categories: '/api/programs/categories', // GET → { categories: string[] }

  signup: '/api/auth/signup', // POST SignupRequest → SignupResponse (201). 로그인은 인증 후
  login: '/api/auth/login', // POST LoginRequest → AuthResponse
  logout: '/api/auth/logout', // POST → { ok: true }
  me: '/api/auth/me', // GET → { user: User | null }
  account: '/api/me', // DELETE → { ok: true } 계정과 모든 데이터 삭제
  verifyEmail: '/api/auth/verify', // POST VerifyEmailRequest → AuthResponse (인증 후 로그인 상태)
  resendVerification: '/api/auth/verify/resend', // POST { email } → { ok: true } (1분 1회, 계정 존재를 드러내지 않음)
  forgotPassword: '/api/auth/forgot', // POST { email } → { ok: true, message: FORGOT_PASSWORD_NOTICE } (항상 같은 응답)
  changePassword: '/api/auth/password', // POST ChangePasswordRequest → { ok: true } (다른 세션 종료)
  myProfile: '/api/me/profile', // GET → { profile: BasicProfile }, PUT { profile: Partial<BasicProfile> } → { profile } (로그인 필요)
  bufsLogin: '/api/bufs/login', // POST { password } → { ok: true } + 쿠키 BUFS_COOKIE (5회 실패 시 10분 잠금)
  bufsLogout: '/api/bufs/logout', // POST → { ok: true }
  bufsMe: '/api/bufs/me', // GET → { admin: boolean }
  bufsFeedback: '/api/bufs/feedback', // GET ?limit=&offset= → BufsFeedbackResponse (관리자만, 원문 대화 없음)
  kstartupSync: '/api/admin/kstartup/sync', // POST → KStartupSyncResponse (팀 계정, 실제 공고 수집)

  session: '/api/mentor/session', // GET → MentorSession, DELETE → 새 상담 시작
  profile: '/api/mentor/profile', // PUT ProfileUpdateRequest → ProfileUpdateResponse (자동 저장)
  chat: '/api/mentor/chat', // POST ChatRequest → ChatResponse
  summary: '/api/mentor/summary', // POST → { summary } 생성, PUT { summary } → { summary } 수정
  result: '/api/mentor/result', // GET → MentorResultResponse (Top3·기관·계획)
  plan: '/api/mentor/plan', // PUT PlanUpdateRequest → { plan }
  feedback: '/api/mentor/feedback', // POST FeedbackRequest → { ok: true }
  survey: '/api/mentor/survey', // POST SurveyRequest → { ok: true }

  typeTest: '/api/type-test', // POST TypeTestRequest → TypeTestResponse (로그인 시 계정에 저장)

  applications: '/api/applications', // GET → { items: ApplicationView[] }, POST CreateApplicationRequest → ApplicationView (201)
  application: (id: string) => `/api/applications/${encodeURIComponent(id)}`, // GET → ApplicationView, PUT UpdateApplicationRequest → ApplicationView
  approve: (id: string) => `/api/applications/${encodeURIComponent(id)}/approve`, // POST ApproveRequest → ApplicationView
  retry: (id: string) => `/api/applications/${encodeURIComponent(id)}/retry`, // POST → ApplicationView (실패 시 1회)

  stats: '/api/admin/stats', // GET → Stats (팀 계정만)

  // ---- 개정 기획(PR #7): 비회원 탐색 흐름 ----
  // 2026-11-27 변경: 로그인(이메일 인증 완료) 필요. 미로그인 401 unauthorized, 미인증 403 email_unverified.
  // options·problems·resources 는 로그인 없이 읽을 수 있다. 상담 횟수는 계정 id 로만 센다.
  exploreOptions: '/api/explore/options', // GET → ExploreOptionsResponse
  problems: '/api/explore/problems', // GET ?interests=AI,조선·해양&region=부산 → ProblemsResponse (최대 3개)
  explore: '/api/explore/session', // GET → ExploreSession, DELETE → 초기화 (서버 기록·쿠키 삭제)
  start: '/api/explore/start', // PUT StartRequest → ExploreSession (F1 자동 저장, 최소 입력만 검사)
  exploration: '/api/explore/exploration', // PUT ExplorationRequest → ExploreSession (문제 선택·변경·보류, 방향 선택)
  exploreChat: '/api/explore/chat', // POST ExploreChatRequest → ExploreChatResponse (최대 3문항). 첫 질문 요청이 상담 1회 → 초과 시 429 limit
  exploreSummary: '/api/explore/summary', // POST → { summary, regional } 생성, PUT { summary } → 수정 (준비 완료 표시 초기화)
  exploreResult: '/api/explore/result', // GET → ExploreResultResponse
  conditions: '/api/explore/conditions', // PUT { conditions: UserConditions } → ExploreResultResponse ('모름' 허용)
  prepDone: '/api/explore/prep', // PUT { id, done } → { prep }
  exploreFeedback: '/api/explore/feedback', // POST ExploreFeedbackRequest → { ok: true }
  events: '/api/explore/events', // POST { type: ExploreEventType, resourceId? } → { ok: true } (원문 대화 넣지 않음)
  resources: '/api/resources', // GET ?type=&stage=&q= → { items: ResourceCard[] } (F18)
  resource: (id: string) => `/api/resources/${encodeURIComponent(id)}`, // GET → ResourceCard
} as const;

// ---- 개정 기획 요청·응답 ----
export interface ExploreOptionsResponse {
  readiness: typeof READINESS_OPTIONS;
  interests: string[]; // INDUSTRY_TAGS + INTEREST_EXTRA
  regions: readonly string[];
  coverage: Record<string, { problems: number; resources: number; contexts: number }>; // 지역별 실제 자료 수 (정직하게 표시)
  dataVersion: string;
  privacy: string; // 시작 전 안내: 서버·외부 AI(Upstage) 전송, 기기 저장, 초기화 범위
}
export interface ProblemsResponse { items: ProblemCard[]; dataVersion: string; emptyReason: string | null }

export type ExploreStep = 'start' | 'chat' | 'summary' | 'result';
export interface ExploreSession {
  step: ExploreStep;
  start: StartProfile;
  exploration: Exploration | null;
  messages: ChatMessage[];
  questionIndex: number; // 0..3
  maxQuestions: number; // 3
  summary: SummaryV2 | null;
  regional: RegionalContextCard | null;
  updatedAt: string | null;
  quota?: ConsultQuota; // 상담 횟수 (1인당 7일 3회). API 는 항상 채운다
  counted?: boolean; // 이 세션이 이미 상담 1회로 세어졌는지
}
export interface StartRequest { start: Partial<StartProfile> }
export interface ExplorationRequest {
  problemId?: string | null;
  origin?: ExplorationOrigin;
  customProblem?: string | null;
  selectionReason?: string | null;
  direction?: string | null;
  directionStatus?: DirectionStatus;
}
export interface ExploreChatRequest {
  message?: string;
  skip?: boolean; // 건너뛰기
  unknown?: boolean; // 아직 모르겠어요 → 미정으로 저장
  wantSuggestions?: boolean; // 방향 예시 요청 (사용자가 원할 때만, 최대 2개)
  finish?: boolean; // 지금까지 내용 정리 (일찍 결과로)
}
export interface ExploreChatResponse {
  messages: ChatMessage[]; // 누적 전체
  questionIndex: number;
  done: boolean;
  suggestions: string[]; // AI 제안 (선택 전까지 사용자 선택 아님)
  failed: boolean; // AI 장애 → 웹은 재시도·직접 정리 양식을 보여준다
}
export interface ExploreResultResponse {
  summary: SummaryV2 | null;
  regional: RegionalContextCard | null; // 선택 필드
  contexts: RegionalContext[]; // regional.sourceIds 의 실제 자료
  prep: { primary: PrepItem; followUps: PrepItem[] }; // 후속 최대 2개
  resources: ResourceCard[]; // 최대 3개, 억지로 채우지 않음
  noMatchReason: string | null; // 맞는 경로가 없을 때
  coverageNote: string; // 실제 제공 지역·자료 범위 안내
  conditionNote: string; // CONDITION_NOTE
  fieldQuestions?: FieldQuestion[]; // 현장에 확인할 질문 최대 3개 (상태: 현장 확인 전). 문제가 바뀌면 다시 만든다
}
export type ExploreEventType = 'start' | 'chat_done' | 'result' | 'resource_link' | 'regional_expand' | 'feedback';
export interface ExploreFeedbackRequest {
  helpful?: boolean;
  reason?: string;
  directionClear?: boolean; // 더 알아보고 싶은 창업 방향을 정리할 수 있었다
  wantToExplore?: string; // 선택한 문제에서 더 알아보고 싶은 부분
  knowWhatToPrepare?: { before?: number; after?: number }; // 1~5
  regionIntent?: { before?: number; after?: number }; // 1~5, 부울경 검토 의향
  foundRegionalPath?: boolean;
  pathName?: string;
}

// ---- 공고 ----
export interface ProgramListQuery {
  q?: string;
  region?: '부산' | '전국';
  category?: string;
  stage?: Stage;
  age?: number;
  due?: '7' | '30' | 'always';
  verdict?: Verdict; // 로그인 + 완성된 프로필일 때만 적용
  sort?: 'deadline' | 'latest';
  includeClosed?: boolean;
  offset?: number;
  limit?: number;
}
export interface ProgramListResponse {
  total: number;
  items: ProgramCard[];
  nextOffset: number | null;
}
export interface ProgramDetailResponse {
  program: Program;
  dDay: number | null;
  eligibility: Eligibility | null;
}
export interface HomeResponse {
  openCount: number;
  closingThisWeek: number;
  closingSoon: ProgramCard[];
}

// ---- 인증 ----
/** 2회 입력한 비밀번호가 같고 규칙(checkPassword)을 지켜야 한다. 가입 후 인증 메일을 보낸다 (아직 로그인 아님). */
export interface SignupRequest { email: string; password: string; passwordConfirm?: string /* 서버가 필수로 검사 */; consent: boolean }
export interface SignupResponse { ok: true; email: string; verificationSent: boolean }
/** 메일의 링크(token) 또는 이메일 + 6자리 code */
export interface VerifyEmailRequest { token?: string; email?: string; code?: string }
/** 복구 비밀번호로 로그인한 직후에는 currentPassword 대신 그 복구 비밀번호를 넣는다 */
export interface ChangePasswordRequest { currentPassword: string; newPassword: string; newPasswordConfirm: string }
export interface KStartupSyncResponse { ok: boolean; fetchedAt: string; added: number; updated: number; closed: number; total: number; error: string | null }
export interface LoginRequest { email: string; password: string }
export interface AuthResponse { user: User }

// ---- 상담 ----
export type MentorStep = 'form' | 'chat' | 'summary' | 'result';
export interface MentorSession {
  step: MentorStep;
  profile: ConsultProfile;
  profileComplete: boolean;
  messages: ChatMessage[];
  questionIndex: number; // 다음에 할 질문 번호 0..3, 3 = 질문 끝
  summary: IdeaSummary | null;
  updatedAt: string | null;
}
export interface ProfileUpdateRequest { profile: Partial<ConsultProfile> }
export interface ProfileUpdateResponse { profile: ConsultProfile; errors: FieldError[]; savedAt: string }
export interface ChatRequest { message?: string; skip?: boolean } // 빈 요청 = 첫 메시지 받기
/** messages = 지금까지의 전체 대화(누적). 웹은 이 목록으로 화면을 바꾼다. */
export interface ChatResponse { messages: ChatMessage[]; questionIndex: number; done: boolean }
export interface MentorResultResponse {
  top: Recommendation[]; // 최대 3개, 3개 미만이면 공고 모음으로 안내
  agencies: Agency[];
  plan: PlanItem[];
  survey: boolean | null;
}
export interface PlanUpdateRequest { day: number; done: boolean }
export interface FeedbackRequest { programId: string; relevant: boolean }
export interface SurveyRequest { discovered: boolean }

// ---- 창업 유형 테스트 ----
export interface TypeTestRequest { answers: Record<number, string> }
export interface TypeTestResponse { result: TypeResult; saved: boolean }

// ---- 지원서 (F13·F16 목업: 모의 양식, 실제 제출 없음) ----
export interface ApplicationView extends Application { program: Program }
export interface CreateApplicationRequest { programId: string }
export interface UpdateApplicationRequest { values: Record<string, string>; requestApproval?: boolean }
export interface ApproveRequest { confirm: true }

export type { Stats };
