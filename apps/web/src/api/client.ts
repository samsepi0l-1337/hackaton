import { ROUTES } from '@gil/shared';
import type { ApiError, ErrorCode, FieldError, ProgramListQuery } from '@gil/shared';
import type {
  ApplicationView, ApproveRequest, AuthResponse, ChatRequest, ChatResponse, CreateApplicationRequest, FeedbackRequest,
  HomeResponse, LoginRequest, MentorResultResponse, MentorSession, PlanUpdateRequest, ProfileUpdateRequest,
  ProfileUpdateResponse, ProgramDetailResponse, ProgramListResponse, SignupRequest, SurveyRequest, TypeTestRequest,
  TypeTestResponse, UpdateApplicationRequest,
} from '@gil/shared';
import type { IdeaSummary, PlanItem, Stats, User } from '@gil/shared';

export class ApiClientError extends Error {
  code: ErrorCode | 'network';
  fields: FieldError[];
  status: number;
  constructor(status: number, code: ErrorCode | 'network', message: string, fields: FieldError[] = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiClientError(0, 'network', '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* 본문이 JSON이 아님 */ }
  if (!res.ok) {
    const err = (data as ApiError | null)?.error;
    throw new ApiClientError(res.status, err?.code ?? 'bad_request', err?.message ?? `요청에 실패했어요 (${res.status})`, err?.fields);
  }
  return data as T;
}

const get = <T>(p: string) => request<T>('GET', p);
const post = <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {});
const put = <T>(p: string, b: unknown) => request<T>('PUT', p, b);
const del = <T>(p: string) => request<T>('DELETE', p);

/** 값이 있는 항목만 쿼리 문자열로 만든다. 웹 URL과 API가 같은 이름을 쓴다. */
export function buildQuery(q: ProgramListQuery): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === '' || v === false) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const api = {
  home: () => get<HomeResponse>(ROUTES.home),
  programs: (q: ProgramListQuery) => get<ProgramListResponse>(ROUTES.programs + buildQuery(q)),
  program: (id: string) => get<ProgramDetailResponse>(ROUTES.program(id)),
  categories: () => get<{ categories: string[] }>(ROUTES.categories),

  signup: (b: SignupRequest) => post<AuthResponse>(ROUTES.signup, b),
  login: (b: LoginRequest) => post<AuthResponse>(ROUTES.login, b),
  logout: () => post<{ ok: true }>(ROUTES.logout),
  me: () => get<{ user: User | null }>(ROUTES.me),
  deleteAccount: () => del<{ ok: true }>(ROUTES.account),

  session: () => get<MentorSession>(ROUTES.session),
  newSession: () => del<unknown>(ROUTES.session),
  saveProfile: (b: ProfileUpdateRequest) => put<ProfileUpdateResponse>(ROUTES.profile, b),
  chat: (b: ChatRequest) => post<ChatResponse>(ROUTES.chat, b),
  createSummary: () => post<{ summary: IdeaSummary }>(ROUTES.summary),
  saveSummary: (summary: IdeaSummary) => put<{ summary: IdeaSummary }>(ROUTES.summary, { summary }),
  result: () => get<MentorResultResponse>(ROUTES.result),
  updatePlan: (b: PlanUpdateRequest) => put<{ plan: PlanItem[] }>(ROUTES.plan, b),
  feedback: (b: FeedbackRequest) => post<{ ok: true }>(ROUTES.feedback, b),
  survey: (b: SurveyRequest) => post<{ ok: true }>(ROUTES.survey, b),

  typeTest: (b: TypeTestRequest) => post<TypeTestResponse>(ROUTES.typeTest, b),

  applications: () => get<{ items: ApplicationView[] }>(ROUTES.applications),
  createApplication: (b: CreateApplicationRequest) => post<ApplicationView>(ROUTES.applications, b),
  application: (id: string) => get<ApplicationView>(ROUTES.application(id)),
  updateApplication: (id: string, b: UpdateApplicationRequest) => put<ApplicationView>(ROUTES.application(id), b),
  approve: (id: string, b: ApproveRequest) => post<ApplicationView>(ROUTES.approve(id), b),
  retry: (id: string) => post<ApplicationView>(ROUTES.retry(id)),

  stats: () => get<Stats>(ROUTES.stats),
};
