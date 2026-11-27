import { ROUTES } from '@gil/shared';
import { LOCAL_AI_HEADER } from '@gil/shared';
import type { ApiError, ConsultQuota, ErrorCode, FieldError } from '@gil/shared';
import { localAiHeaderValue } from '../lib/localAi';
import type {
  AuthResponse, ExploreChatRequest, ExploreChatResponse, ExploreEventType, ExploreFeedbackRequest, ExploreOptionsResponse,
  ExploreResultResponse, ExploreSession, ExplorationRequest, LoginRequest, ProblemsResponse, SignupRequest, SignupResponse, StartRequest,
  BasicProfile, BufsFeedbackResponse, VerifyEmailRequest, ChangePasswordRequest, TypeTestRequest, TypeTestResponse,
} from '@gil/shared';
import type { LikesResponse, RegionalContextCard, ResourceCard, ResourceSort, ResourceType, ReadinessStage, Stats, SummaryV2, User, UserConditions } from '@gil/shared';

export const AUTH_GATE_EVENT = 'gil:auth-gate';

export class ApiClientError extends Error {
  code: ErrorCode | 'network';
  fields: FieldError[];
  status: number;
  quota?: ConsultQuota;
  constructor(status: number, code: ErrorCode | 'network', message: string, fields: FieldError[] = [], quota?: ConsultQuota) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.quota = quota;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (path.startsWith('/api/explore')) {
    const tasks = await localAiHeaderValue();
    if (tasks) headers[LOCAL_AI_HEADER] = tasks;
  }
  try {
    res = await fetch(path, {
      method,
      credentials: 'include',
      headers: Object.keys(headers).length ? headers : undefined,
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
    const code = err?.code ?? 'bad_request';
    // 로그인·인증 상태가 서버와 어긋나면 화면이 같은 방식으로 안내하도록 알린다.
    if (path.startsWith('/api/explore') && (code === 'unauthorized' || code === 'email_unverified' || code === 'password_change_required')) {
      window.dispatchEvent(new CustomEvent(AUTH_GATE_EVENT, { detail: code }));
    }
    throw new ApiClientError(res.status, code, err?.message ?? `요청에 실패했어요 (${res.status})`, err?.fields, err?.quota);
  }
  return data as T;
}

const get = <T>(p: string) => request<T>('GET', p);
const post = <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {});
const put = <T>(p: string, b: unknown) => request<T>('PUT', p, b);
const del = <T>(p: string) => request<T>('DELETE', p);

export interface ResourceQuery { type?: ResourceType; stage?: ReadinessStage; q?: string; sort?: ResourceSort }
const qs = (o: Record<string, string | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : '';
};

export const api = {
  signup: (b: SignupRequest) => post<SignupResponse>(ROUTES.signup, b),
  verifyEmail: (b: VerifyEmailRequest) => post<AuthResponse>(ROUTES.verifyEmail, b),
  resendVerification: (email: string) => post<{ ok: true }>(ROUTES.resendVerification, { email }),
  forgotPassword: (email: string) => post<{ ok: true; message: string }>(ROUTES.forgotPassword, { email }),
  changePassword: (b: ChangePasswordRequest) => post<{ ok: true }>(ROUTES.changePassword, b),
  myProfile: () => get<{ profile: BasicProfile }>(ROUTES.myProfile),
  saveMyProfile: (profile: Partial<BasicProfile>) => put<{ profile: BasicProfile }>(ROUTES.myProfile, { profile }),
  bufsLogin: (password: string) => post<{ ok: true }>(ROUTES.bufsLogin, { password }),
  bufsLogout: () => post<{ ok: true }>(ROUTES.bufsLogout),
  bufsMe: () => get<{ admin: boolean }>(ROUTES.bufsMe),
  bufsFeedback: (limit: number, offset: number) => get<BufsFeedbackResponse>(ROUTES.bufsFeedback + qs({ limit: String(limit), offset: String(offset) })),
  typeTest: (b: TypeTestRequest) => post<TypeTestResponse>(ROUTES.typeTest, b),
  login: (b: LoginRequest) => post<AuthResponse>(ROUTES.login, b),
  logout: () => post<{ ok: true }>(ROUTES.logout),
  me: () => get<{ user: User | null }>(ROUTES.me),
  deleteAccount: () => del<{ ok: true }>(ROUTES.account),
  stats: () => get<Stats>(ROUTES.stats),

  // 비회원 탐색 흐름 (/api/explore/*)
  exploreOptions: () => get<ExploreOptionsResponse>(ROUTES.exploreOptions),
  problems: (interests: string[], region?: string) => get<ProblemsResponse>(ROUTES.problems + qs({ interests: interests.join(','), region })),
  exploreSession: () => get<ExploreSession>(ROUTES.explore),
  resetExplore: () => del<unknown>(ROUTES.explore),
  saveStart: (b: StartRequest) => put<ExploreSession>(ROUTES.start, b),
  saveExploration: (b: ExplorationRequest) => put<ExploreSession>(ROUTES.exploration, b),
  exploreChat: (b: ExploreChatRequest) => post<ExploreChatResponse>(ROUTES.exploreChat, b),
  createSummary: () => post<{ summary: SummaryV2; regional: RegionalContextCard | null }>(ROUTES.exploreSummary),
  saveSummary: (summary: SummaryV2) => put<{ summary: SummaryV2; regional?: RegionalContextCard | null }>(ROUTES.exploreSummary, { summary }),
  exploreResult: () => get<ExploreResultResponse>(ROUTES.exploreResult),
  saveConditions: (conditions: UserConditions) => put<ExploreResultResponse>(ROUTES.conditions, { conditions }),
  setPrepDone: (id: string, done: boolean) => put<unknown>(ROUTES.prepDone, { id, done }),
  exploreFeedback: (b: ExploreFeedbackRequest) => post<{ ok: true }>(ROUTES.exploreFeedback, b),
  /** 통계용 이벤트. 실패해도 화면 흐름을 막지 않는다. 대화 원문은 보내지 않는다. */
  track: (type: ExploreEventType, resourceId?: string) => { post<{ ok: true }>(ROUTES.events, { type, resourceId }).catch(() => {}); },

  resources: (q: ResourceQuery) => get<{ items: ResourceCard[] }>(ROUTES.resources + qs({ ...q })),
  resource: (id: string) => get<ResourceCard>(ROUTES.resource(id)),
  likes: () => get<LikesResponse>(ROUTES.likes),
  like: (id: string, liked: boolean) => put<LikesResponse>(ROUTES.like(id), { liked }),
};
