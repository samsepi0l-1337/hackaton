// API 계약. 경로·요청·응답 모양은 여기서만 정한다. API와 웹이 이 파일을 같이 쓴다.
// 모든 경로 앞에 /api. 인증은 HttpOnly 세션 쿠키 `sid`. 오류는 ApiError 모양, 상태 코드는 아래 주석.
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
  | 'approval_required'; // 409 승인 없이 제출

export interface ApiError {
  error: { code: ErrorCode; message: string; fields?: FieldError[] };
}

export const ROUTES = {
  health: '/api/health', // GET → { ok: true }
  home: '/api/home', // GET → HomeResponse
  programs: '/api/programs', // GET ?ProgramListQuery → ProgramListResponse
  program: (id: string) => `/api/programs/${encodeURIComponent(id)}`, // GET → ProgramDetailResponse
  categories: '/api/programs/categories', // GET → { categories: string[] }

  signup: '/api/auth/signup', // POST SignupRequest → AuthResponse (201)
  login: '/api/auth/login', // POST LoginRequest → AuthResponse
  logout: '/api/auth/logout', // POST → { ok: true }
  me: '/api/auth/me', // GET → { user: User | null }
  account: '/api/me', // DELETE → { ok: true } 계정과 모든 데이터 삭제

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
} as const;

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
export interface SignupRequest { email: string; password: string; consent: boolean }
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
