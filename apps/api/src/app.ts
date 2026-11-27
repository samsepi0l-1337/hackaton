import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
  MENTOR_PROGRAM_DEFLECT, MENTOR_QUESTION_COUNT, MOCK_FORM_FIELDS, PASSWORD_MIN, SESSION_COOKIE, STAGES,
  asksAboutPrograms, buildPlan, draftSummary, homeSummary, isClosed, isProfileComplete, listPrograms,
  mentorOpening, parseVerdict, pickAgencies, pickMentorQuestions, recommend, relevanceCandidates, scoreTypeTest, toCard,
  validateProfile, PROGRAM_CATEGORIES, TYPE_QUESTIONS,
  type ApiError, type Application, type ApplicationStatus, type ApplicationView, type ChatMessage,
  type ConsultProfile, type ErrorCode, type FieldError, type FormField, type IdeaSummary, type MentorSession,
  type Program, type ProgramListQuery, type Stats, type User,
} from '@gil/shared';
import { hashPassword, randomToken, verifyPassword } from './password';
import type { Bindings } from './env';
import { createAiTasks } from './ai/tasks';
import { readAnnouncementForm, type DocWorkerClient } from './docs/pipeline';
import { createStore, emptyMentor, type MentorState, type Store, type UserRecord } from './store';

export interface AppOptions {
  now?: () => Date;
  /** 테스트·데모용: true를 돌려주면 첫 제출 시도가 실패한다. */
  failSubmit?: (a: Application) => boolean;
  /** 테스트용: 바인딩을 직접 넣는다. 실제 실행에서는 요청의 c.env 가 우선한다. */
  env?: Bindings;
  /** 테스트용: AI 호출에 쓸 fetch. */
  fetch?: typeof fetch;
  /** 공고 양식을 읽을 doc-worker 클라이언트. 없으면 모의 양식. (Workers: DOC_WORKER Durable Object) */
  docWorkerFor?: (env: Bindings) => DocWorkerClient | null;
  /** 저장소. 기본은 메모리. Workers 에서는 Durable Object KV. */
  store?: () => Promise<Store>;
}

type Env = { Bindings: Bindings; Variables: { store: Store; user: UserRecord | null; now: Date; ai: ReturnType<typeof createAiTasks> } };
type Ctx = Context<Env>;

class HttpError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409, public code: ErrorCode, message: string, public fields?: FieldError[]) { super(message); }
}
const bad = (m: string) => new HttpError(400, 'bad_request', m);
const notFound = (m = '찾을 수 없어요') => new HttpError(404, 'not_found', m);

const FORM_TIMEOUT_MS = 30_000;
/** 신원 정보 항목: AI가 채우지 않는다. */
const IDENTITY_RE = /(성명|이름|대표자|연락처|전화|휴대|이메일|e-?mail|주소|생년월일)/i;
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function json(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json();
    if (b && typeof b === 'object' && !Array.isArray(b)) return b as Record<string, unknown>;
  } catch { /* fallthrough */ }
  throw bad('JSON 본문이 필요해요');
}
async function jsonOrEmpty(c: Ctx): Promise<Record<string, unknown>> {
  try { return await json(c); } catch { return {}; }
}

const publicUser = (u: UserRecord): User => ({ id: u.id, email: u.email, isTeam: u.isTeam, createdAt: u.createdAt });

// ---- 프로필 정리 ----
const ARRAY_FIELDS = new Set(['revenue', 'customerAges', 'needs']);
const STRING_FIELDS = new Set(['openedAt', 'district', 'affiliation', 'teamSize', 'typeCode', 'idea', 'industry', 'bizForm', 'problem', 'readiness', 'customerType', 'customerRegion', 'customerDesc', 'alternative']);
const ALL_FIELDS = new Set(['age', 'stage', ...ARRAY_FIELDS, ...STRING_FIELDS]);

function mergeProfile(base: ConsultProfile, patch: Record<string, unknown>): { profile: ConsultProfile; errors: FieldError[] } {
  const profile: Record<string, unknown> = { ...base };
  const errors: FieldError[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (!ALL_FIELDS.has(k)) continue;
    if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) { delete profile[k]; continue; }
    const ok = k === 'age' ? typeof v === 'number'
      : ARRAY_FIELDS.has(k) ? Array.isArray(v) && v.every((x) => typeof x === 'string')
      : typeof v === 'string';
    if (!ok) { errors.push({ field: k as keyof ConsultProfile, message: '형식이 맞지 않아요' }); continue; }
    profile[k] = v;
  }
  return { profile: profile as ConsultProfile, errors };
}

// ---- 지원서 ----
const trunc = (s: string, max: number | null) => (max !== null ? s.slice(0, max) : s);
function receiptNo(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(6));
  return 'MOCK-' + [...r].map((x) => chars[x % chars.length]).join('');
}

export function createApp(opts: AppOptions = {}) {
  const clock = opts.now ?? (() => new Date());
  const app = new Hono<Env>();
  let storeP: Promise<Store> | null = null;
  const getStore = () => (storeP ??= (opts.store ? opts.store() : createStore(clock())));

  app.use('/api/*', cors({ origin: 'http://localhost:5173', credentials: true }));
  app.use('/api/*', async (c, next) => {
    const store = await getStore();
    c.set('store', store);
    c.set('now', clock());
    c.set('ai', createAiTasks({ ...opts.env, ...(c.env ?? {}) }, { fetch: opts.fetch }));
    const token = getCookie(c, SESSION_COOKIE);
    const uid = token ? store.userIdOfSession(token) : undefined;
    c.set('user', (uid && store.findUser(uid)) || null);
    try {
      await next();
    } finally {
      store.flush(); // 바뀐 레코드를 Zod 로 검사해 저장
    }
  });

  const requireUser = (c: Ctx): UserRecord => {
    const u = c.get('user');
    if (!u) throw new HttpError(401, 'unauthorized', '로그인이 필요해요');
    return u;
  };
  const requireProfile = (m: MentorState): ConsultProfile => {
    const errors = validateProfile(m.profile);
    if (errors.length) throw new HttpError(400, 'validation', '상담 폼을 먼저 끝까지 채워 주세요', errors);
    return m.profile;
  };
  const optionalProfile = (c: Ctx): ConsultProfile | null => {
    const u = c.get('user');
    if (!u) return null;
    const p = c.get('store').mentor(u.id).profile;
    return isProfileComplete(p) ? p : null;
  };

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      const body: ApiError = { error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) } };
      return c.json(body, err.status);
    }
    console.error(err);
    return c.json({ error: { code: 'bad_request', message: '요청을 처리하지 못했어요' } } satisfies ApiError, 400);
  });
  app.notFound((c) => c.json({ error: { code: 'not_found', message: '없는 경로예요' } } satisfies ApiError, 404));

  app.get('/api/health', (c) => c.json({ ok: true }));

  // ---- 공고 ----
  app.get('/api/home', (c) => c.json(homeSummary(c.get('store').programs, c.get('now'))));

  app.get('/api/programs/categories', (c) => {
    const set = new Set<string>(PROGRAM_CATEGORIES);
    for (const p of c.get('store').programs) set.add(p.category);
    return c.json({ categories: [...set] });
  });

  app.get('/api/programs', (c) => {
    const raw = c.req.query();
    const q: ProgramListQuery = {};
    const intOf = (k: string): number | undefined => {
      if (raw[k] === undefined || raw[k] === '') return undefined;
      const n = Number(raw[k]);
      if (!Number.isInteger(n) || n < 0) throw bad(`${k} 값이 올바르지 않아요`);
      return n;
    };
    if (raw.q) q.q = raw.q;
    if (raw.region) { if (raw.region !== '부산' && raw.region !== '전국') throw bad('region 값이 올바르지 않아요'); q.region = raw.region; }
    if (raw.category) q.category = raw.category;
    if (raw.stage) { if (!STAGES.some((s) => s.value === raw.stage)) throw bad('stage 값이 올바르지 않아요'); q.stage = raw.stage as ProgramListQuery['stage']; }
    const age = intOf('age'); if (age !== undefined) q.age = age;
    if (raw.due) { if (!['7', '30', 'always'].includes(raw.due)) throw bad('due 값이 올바르지 않아요'); q.due = raw.due as ProgramListQuery['due']; }
    if (raw.verdict) { const v = parseVerdict(raw.verdict); if (!v) throw bad('verdict 값이 올바르지 않아요'); q.verdict = v; }
    if (raw.sort) { if (raw.sort !== 'deadline' && raw.sort !== 'latest') throw bad('sort 값이 올바르지 않아요'); q.sort = raw.sort; }
    if (raw.includeClosed) q.includeClosed = raw.includeClosed === 'true' || raw.includeClosed === '1';
    const offset = intOf('offset'); if (offset !== undefined) q.offset = offset;
    const limit = intOf('limit'); if (limit !== undefined) q.limit = limit;
    return c.json(listPrograms(c.get('store').programs, q, c.get('now'), optionalProfile(c)));
  });

  app.get('/api/programs/:id', (c) => {
    const p = c.get('store').programs.find((x) => x.id === c.req.param('id'));
    if (!p) throw notFound('공고를 찾을 수 없어요');
    const card = toCard(p, c.get('now'), optionalProfile(c));
    return c.json({ program: p, dDay: card.dDay, eligibility: card.eligibility });
  });

  // ---- 인증 ----
  const startSession = (c: Ctx, userId: string) => {
    const token = randomToken();
    c.get('store').createSession(token, userId);
    setCookie(c, SESSION_COOKIE, token, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 60 * 60 * 24 * 14, secure: new URL(c.req.url).protocol === 'https:' });
  };

  app.post('/api/auth/signup', async (c) => {
    const b = await json(c);
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    if (!EMAIL_RE.test(email)) throw bad('이메일 형식이 올바르지 않아요');
    if (password.length < PASSWORD_MIN) throw bad(`비밀번호는 ${PASSWORD_MIN}자 이상이어야 해요`);
    if (b.consent !== true) throw bad('개인정보 수집·이용에 동의해 주세요');
    const store = c.get('store');
    if (store.findUserByEmail(email)) throw new HttpError(409, 'conflict', '이미 가입한 이메일이에요');
    const user: UserRecord = { id: `u-${crypto.randomUUID()}`, email, isTeam: false, createdAt: c.get('now').toISOString(), passwordHash: await hashPassword(password) };
    store.addUser(user);
    startSession(c, user.id);
    return c.json({ user: publicUser(user) }, 201);
  });

  app.post('/api/auth/login', async (c) => {
    const b = await json(c);
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    const user = c.get('store').findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) throw new HttpError(401, 'unauthorized', '이메일 또는 비밀번호가 맞지 않아요');
    startSession(c, user.id);
    return c.json({ user: publicUser(user) });
  });

  app.post('/api/auth/logout', (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) c.get('store').deleteSession(token);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.get('/api/auth/me', (c) => {
    const u = c.get('user');
    return c.json({ user: u ? publicUser(u) : null });
  });

  app.delete('/api/me', (c) => {
    const u = requireUser(c);
    c.get('store').deleteUser(u.id);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  // ---- 창업 유형 테스트 ----
  app.post('/api/type-test', async (c) => {
    const b = await json(c);
    const answers = b.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw bad('answers가 필요해요');
    const given = answers as Record<string, unknown>;
    const clean: Record<number, string> = {};
    for (const q of TYPE_QUESTIONS) {
      const v = given[String(q.id)];
      if (typeof v !== 'string' || !q.options.some((o) => o.letter === v)) throw bad(`${q.id}번 문항 답이 올바르지 않아요`);
      clean[q.id] = v;
    }
    const result = scoreTypeTest(clean);
    const u = c.get('user');
    let saved = false;
    if (u) {
      const store = c.get('store');
      const m = store.mentor(u.id);
      m.profile = { ...m.profile, typeCode: result.code };
      m.updatedAt = c.get('now').toISOString();
      saved = true;
    }
    return c.json({ result, saved });
  });

  // ---- 상담 ----
  const sessionView = (m: MentorState): MentorSession => ({
    step: m.step, profile: m.profile, profileComplete: isProfileComplete(m.profile),
    messages: m.messages, questionIndex: m.questionIndex, summary: m.summary, updatedAt: m.updatedAt,
  });

  app.get('/api/mentor/session', (c) => c.json(sessionView(c.get('store').mentor(requireUser(c).id))));

  app.delete('/api/mentor/session', (c) => {
    const u = requireUser(c);
    const store = c.get('store');
    const fresh = emptyMentor(store.mentor(u.id).profile);
    store.setMentor(u.id, fresh);
    return c.json(sessionView(fresh));
  });

  app.put('/api/mentor/profile', async (c) => {
    const u = requireUser(c);
    const b = await json(c);
    if (!b.profile || typeof b.profile !== 'object' || Array.isArray(b.profile)) throw bad('profile이 필요해요');
    const m = c.get('store').mentor(u.id);
    const merged = mergeProfile(m.profile, b.profile as Record<string, unknown>);
    const savedAt = c.get('now').toISOString();
    m.profile = merged.profile;
    m.updatedAt = savedAt;
    const errors = [...merged.errors, ...validateProfile(m.profile).filter((e) => !merged.errors.some((x) => x.field === e.field))];
    return c.json({ profile: m.profile, errors, savedAt });
  });

  app.post('/api/mentor/chat', async (c) => {
    const u = requireUser(c);
    const m = c.get('store').mentor(u.id);
    const profile = requireProfile(m);
    const b = await jsonOrEmpty(c);
    const text = typeof b.message === 'string' ? b.message.trim() : '';
    const skip = b.skip === true;
    if (text.length > 1000) throw bad('메시지는 1000자 이하로 써 주세요');
    const at = c.get('now').toISOString();
    const questions = pickMentorQuestions(profile);
    const added: ChatMessage[] = [];
    const ai = c.get('ai');
    const lastAnswer = [...m.messages].reverse().find((x) => x.role === 'user' && x.text)?.text ?? '';
    const ask = async (i: number, answer = lastAnswer) => { added.push({ role: 'mentor', text: await ai.mentorQuestion(questions[i]!, answer, u.id), at, questionIndex: i }); };

    if (m.messages.length === 0 && !text && !skip) {
      added.push({ role: 'mentor', text: mentorOpening(profile), at });
      await ask(0, '');
    } else if (!text && !skip) {
      // 빈 요청, 이미 시작함: 새 메시지 없음
    } else if (m.questionIndex < MENTOR_QUESTION_COUNT) {
      if (m.messages.length === 0) { added.push({ role: 'mentor', text: mentorOpening(profile), at }); await ask(0, ''); }
      added.push(skip ? { role: 'user', text: '', at, questionIndex: m.questionIndex, skipped: true } : { role: 'user', text, at, questionIndex: m.questionIndex });
      m.questionIndex += 1;
      if (m.questionIndex < MENTOR_QUESTION_COUNT) await ask(m.questionIndex, text);
    } else if (text) {
      added.push({ role: 'user', text, at });
      added.push({ role: 'mentor', text: asksAboutPrograms(text) ? MENTOR_PROGRAM_DEFLECT : '좋은 질문이에요. 지금 말씀해 주신 내용은 아이디어 요약에 반영해 둘게요.', at });
    }
    m.messages.push(...added);
    m.step = 'chat';
    m.updatedAt = at;
    return c.json({ messages: m.messages, questionIndex: m.questionIndex, done: m.questionIndex >= MENTOR_QUESTION_COUNT });
  });

  const SUMMARY_KEYS = ['problem', 'customer', 'solution', 'revenue', 'busan'] as const;
  app.post('/api/mentor/summary', async (c) => {
    const u = requireUser(c);
    const m = c.get('store').mentor(u.id);
    const profile = requireProfile(m);
    const answered = m.messages.filter((x) => x.questionIndex !== undefined);
    m.summary = (await c.get('ai').summary(profile, answered.filter((x) => x.role === 'user' && x.text).map((x) => x.text), u.id)) ?? draftSummary(profile, answered);
    m.step = 'summary';
    m.updatedAt = c.get('now').toISOString();
    return c.json({ summary: m.summary });
  });
  app.put('/api/mentor/summary', async (c) => {
    const m = c.get('store').mentor(requireUser(c).id);
    const b = await json(c);
    const s = b.summary as Record<string, unknown> | undefined;
    if (!s || typeof s !== 'object') throw bad('summary가 필요해요');
    const out = {} as IdeaSummary;
    for (const k of SUMMARY_KEYS) {
      const v = s[k];
      if (typeof v !== 'string' || v.length > 1000) throw bad(`summary.${k} 값이 올바르지 않아요`);
      out[k] = v;
    }
    m.summary = out;
    m.step = 'summary';
    m.updatedAt = c.get('now').toISOString();
    return c.json({ summary: out });
  });

  const topOf = async (c: Ctx, m: MentorState) => {
    const store = c.get('store');
    const excluded = Object.entries(m.feedback).filter(([, rel]) => !rel).map(([id]) => id);
    const candidates = relevanceCandidates(store.programs, m.profile, c.get('now'), excluded);
    const relevance = (await c.get('ai').relevance(m.profile, candidates)) ?? undefined; // 후보(자격 불가 제외)만 보내므로 Top3에 불가 공고가 들어갈 수 없다
    return recommend({ programs: store.programs, profile: m.profile, now: c.get('now'), summary: m.summary, excludeIds: excluded, feedback: m.feedback, relevance });
  };

  app.get('/api/mentor/result', async (c) => {
    const u = requireUser(c);
    const m = c.get('store').mentor(u.id);
    requireProfile(m);
    const ai = c.get('ai');
    const ranked = await topOf(c, m);
    // 추천 이유와 7일 계획은 서로 기다리지 않게 동시에 만든다.
    const rule = m.plan ? null : buildPlan(ranked, c.get('now'));
    const [top, plan] = await Promise.all([
      ai.reasons(ranked, m.profile, c.get('now'), u.id),
      rule ? ai.plan(rule, ranked, m.profile, u.id).then((p) => p ?? rule) : Promise.resolve(m.plan),
    ]);
    m.plan = plan;
    m.step = 'result';
    return c.json({ top, agencies: pickAgencies(c.get('store').agencies, m.profile), plan: m.plan, survey: m.survey });
  });

  app.put('/api/mentor/plan', async (c) => {
    const m = c.get('store').mentor(requireUser(c).id);
    const b = await json(c);
    if (!Number.isInteger(b.day) || (b.day as number) < 1 || (b.day as number) > 7 || typeof b.done !== 'boolean') throw bad('day(1~7)와 done이 필요해요');
    if (!m.plan) {
      requireProfile(m);
      m.plan = buildPlan(await topOf(c, m), c.get('now'));
    }
    const item = m.plan.find((p) => p.day === b.day);
    if (!item) throw notFound('계획 항목이 없어요');
    item.done = b.done;
    return c.json({ plan: m.plan });
  });

  app.post('/api/mentor/feedback', async (c) => {
    const m = c.get('store').mentor(requireUser(c).id);
    const b = await json(c);
    if (typeof b.programId !== 'string' || typeof b.relevant !== 'boolean') throw bad('programId와 relevant가 필요해요');
    if (!c.get('store').programs.some((p) => p.id === b.programId)) throw notFound('공고를 찾을 수 없어요');
    m.feedback[b.programId] = b.relevant;
    return c.json({ ok: true });
  });

  app.post('/api/mentor/survey', async (c) => {
    const m = c.get('store').mentor(requireUser(c).id);
    const b = await json(c);
    if (typeof b.discovered !== 'boolean') throw bad('discovered가 필요해요');
    m.survey = b.discovered;
    return c.json({ ok: true });
  });

  // ---- 지원서 ----
  const view = (store: Store, a: Application): ApplicationView => ({ ...a, program: store.programs.find((p) => p.id === a.programId)! });
  const ownApp = (c: Ctx): Application => {
    const u = requireUser(c);
    const a = c.get('store').getApplication(c.req.param('id') ?? '');
    if (!a || a.userId !== u.id) throw notFound('지원서를 찾을 수 없어요');
    return a;
  };
  const closedProgram = (p: Program, now: Date) => !p.recruiting || isClosed(p.endDate, now);
  const push = (a: Application, status: ApplicationStatus, at: string) => {
    a.status = status; a.updatedAt = at; a.history.push({ status, at });
  };

  app.get('/api/applications', (c) => {
    const u = requireUser(c);
    const store = c.get('store');
    return c.json({ items: store.applicationsOf(u.id).map((a) => view(store, a)) });
  });

  app.post('/api/applications', async (c) => {
    const u = requireUser(c);
    const store = c.get('store');
    const b = await json(c);
    if (typeof b.programId !== 'string') throw bad('programId가 필요해요');
    const program = store.programs.find((p) => p.id === b.programId);
    if (!program) throw notFound('공고를 찾을 수 없어요');
    if (closedProgram(program, c.get('now'))) throw new HttpError(409, 'closed', '마감된 공고예요');
    const m = store.mentor(u.id);
    const pr = m.profile;
    const s = m.summary;
    const prefill: Record<string, string> = {
      itemName: pr.idea ?? '',
      problem: s?.problem || pr.problem || '',
      solution: s?.solution || pr.idea || '',
      market: s?.customer || [pr.customerType, pr.customerAges?.join('·'), pr.customerDesc].filter(Boolean).join(' / '),
      plan: '',
    };
    let ruleFields: FormField[] = MOCK_FORM_FIELDS.map((f) => ({ ...f, value: f.identity ? '' : trunc(prefill[f.key] ?? '', f.maxLength) }));
    let channel: Application['channel'] = 'mock';
    let formFileName = `application-form-${program.id}.txt`;
    // F16 단계 1: 공고 첨부 양식을 doc-worker 로 내려받고 Document Parse 로 항목을 읽는다. 실패하면 모의 양식.
    const env = { ...opts.env, ...(c.env ?? {}) } as Bindings;
    const docWorker = program.url ? opts.docWorkerFor?.(env) ?? null : null;
    if (docWorker) {
      const form = await withTimeout(readAnnouncementForm(env, { docWorker, fetch: opts.fetch }, program.url), FORM_TIMEOUT_MS);
      if (form && 'fields' in form && form.fields.length > 0) {
        ruleFields = form.fields.map((x, i) => ({
          key: `f${i + 1}`, label: x.label, maxLength: x.maxLength, required: x.required,
          identity: IDENTITY_RE.test(x.label) || undefined, value: '',
        }));
        channel = 'web';
        formFileName = form.attachment.name;
      } else {
        console.warn(`[form] ${program.id} 양식 읽기 실패, 모의 양식을 씁니다: ${form && 'error' in form ? form.error : '시간 초과'}`);
      }
    }
    const fields = await c.get('ai').draft(ruleFields, pr, program, u.id);
    const at = c.get('now').toISOString();
    const a: Application = {
      id: `app-${crypto.randomUUID()}`, userId: u.id, programId: program.id, status: 'drafting', channel,
      formFileName, fields, approval: null, receiptNo: null, receiptImageUrl: null,
      failReason: null, retries: 0, history: [{ status: 'drafting', at }], createdAt: at, updatedAt: at,
    };
    store.saveApplication(a);
    return c.json(view(store, a), 201);
  });

  app.get('/api/applications/:id', (c) => c.json(view(c.get('store'), ownApp(c))));

  app.put('/api/applications/:id', async (c) => {
    const a = ownApp(c);
    const b = await json(c);
    if (a.status !== 'drafting' && a.status !== 'awaiting_approval') throw new HttpError(409, 'conflict', '지금은 수정할 수 없어요');
    if (!b.values || typeof b.values !== 'object' || Array.isArray(b.values)) throw bad('values가 필요해요');
    const values = b.values as Record<string, unknown>;
    const errors: FieldError[] = [];
    for (const [k, v] of Object.entries(values)) {
      const f = a.fields.find((x) => x.key === k);
      if (!f) { errors.push({ field: k as keyof ConsultProfile, message: '없는 항목이에요' }); continue; }
      if (typeof v !== 'string') { errors.push({ field: k as keyof ConsultProfile, message: '글자만 입력할 수 있어요' }); continue; }
      if (f.maxLength !== null && v.length > f.maxLength) errors.push({ field: k as keyof ConsultProfile, message: `${f.label}은(는) ${f.maxLength}자 이하로 써 주세요` });
    }
    if (errors.length) throw new HttpError(400, 'validation', '입력값을 확인해 주세요', errors);
    for (const f of a.fields) if (typeof values[f.key] === 'string') f.value = values[f.key] as string;
    const at = c.get('now').toISOString();
    if (b.requestApproval === true) {
      const missing = a.fields.filter((f) => f.required && f.value.trim() === '');
      if (missing.length) throw new HttpError(400, 'validation', '필수 항목을 모두 채워 주세요', missing.map((f) => ({ field: f.key as keyof ConsultProfile, message: `${f.label}을(를) 입력해 주세요` })));
      if (a.status !== 'awaiting_approval') push(a, 'awaiting_approval', at);
    } else if (a.status === 'awaiting_approval') {
      push(a, 'drafting', at); // 수정하면 승인이 다시 필요하다
    }
    a.updatedAt = at;
    c.get('store').saveApplication(a);
    return c.json(view(c.get('store'), a));
  });

  const simulate = (a: Application, c: Ctx) => {
    const at = () => c.get('now').toISOString();
    push(a, 'filling', at());
    push(a, 'submitting', at());
    if (opts.failSubmit?.(a) && a.retries === 0) {
      a.failReason = '접수 시스템 응답이 없어요 (모의)';
      push(a, 'failed', at());
      return;
    }
    a.failReason = null;
    a.receiptNo = receiptNo();
    push(a, 'completed', at());
  };

  app.post('/api/applications/:id/approve', async (c) => {
    const a = ownApp(c);
    const store = c.get('store');
    const b = await jsonOrEmpty(c);
    if (b.confirm !== true) throw new HttpError(409, 'approval_required', '승인 확인이 필요해요');
    if (a.status !== 'awaiting_approval') throw new HttpError(409, 'approval_required', '승인 대기 상태가 아니에요');
    const program = store.programs.find((p) => p.id === a.programId)!;
    if (closedProgram(program, c.get('now'))) throw new HttpError(409, 'closed', '마감된 공고예요');
    if (store.applicationsOf(a.userId).some((x) => x.id !== a.id && x.programId === a.programId && x.status === 'completed')) {
      throw new HttpError(409, 'conflict', '이미 제출을 마친 공고예요');
    }
    a.approval = { at: c.get('now').toISOString(), values: Object.fromEntries(a.fields.map((f) => [f.key, f.value])) };
    simulate(a, c);
    store.saveApplication(a);
    return c.json(view(store, a));
  });

  app.post('/api/applications/:id/retry', (c) => {
    const a = ownApp(c);
    const store = c.get('store');
    if (a.status !== 'failed') throw new HttpError(409, 'conflict', '실패한 지원서만 다시 시도할 수 있어요');
    if (a.retries >= 1) throw new HttpError(409, 'conflict', '다시 시도는 1번만 할 수 있어요');
    const program = store.programs.find((p) => p.id === a.programId)!;
    if (closedProgram(program, c.get('now'))) throw new HttpError(409, 'closed', '마감된 공고예요');
    a.retries += 1;
    simulate(a, c);
    store.saveApplication(a);
    return c.json(view(store, a));
  });

  // ---- 통계 ----
  const rate = (n: number, d: number) => (d === 0 ? null : n / d);
  // 팀 점검용: 실제 공고 상세 URL 로 F16 양식 읽기(doc-worker → Document Parse)를 끝까지 돌려 본다.
  app.post('/api/admin/form-probe', async (c) => {
    const u = requireUser(c);
    if (!u.isTeam) throw new HttpError(403, 'forbidden', '팀 계정만 쓸 수 있어요');
    const b = await json(c);
    if (typeof b.pageUrl !== 'string' || !/^https?:\/\//.test(b.pageUrl)) throw bad('pageUrl(http/https)이 필요해요');
    const env = { ...opts.env, ...(c.env ?? {}) } as Bindings;
    const docWorker = opts.docWorkerFor?.(env) ?? null;
    if (!docWorker) throw new HttpError(409, 'conflict', 'doc-worker 가 연결되어 있지 않아요');
    if (b.discoverOnly === true) {
      const res = await docWorker.fetch('/discover', { pageUrl: b.pageUrl });
      return c.json({ status: res.status, body: await res.json().catch(() => null) });
    }
    const started = Date.now();
    const r = await readAnnouncementForm(env, { docWorker, fetch: opts.fetch }, b.pageUrl);
    const ms = Date.now() - started;
    if ('error' in r) return c.json({ ok: false, ms, error: r.error });
    return c.json({ ok: true, ms, attachment: r.attachment, kind: r.parsed.kind, warnings: r.parsed.warnings, fields: r.fields, textPreview: r.parsed.text.slice(0, 1500) });
  });

  app.get('/api/admin/stats', (c) => {
    const u = requireUser(c);
    if (!u.isTeam) throw new HttpError(403, 'forbidden', '팀 계정만 볼 수 있어요');
    const store = c.get('store');
    const mentors = store.allMentors();
    const surveyed = mentors.filter((m) => m.survey !== null);
    const fb = mentors.flatMap((m) => Object.values(m.feedback));
    const apps = store.allApplications();
    const done = apps.filter((a) => a.status === 'completed').length;
    const failed = apps.filter((a) => a.status === 'failed').length;
    const withType = store.allUsers().filter((x) => store.mentor(x.id).profile.typeCode);
    const stats: Stats = {
      users: store.allUsers().filter((x) => !x.isTeam).length,
      consultsCompleted: mentors.filter((m) => m.step === 'result').length,
      discoveryRate: rate(surveyed.filter((m) => m.survey).length, surveyed.length),
      relevanceRate: rate(fb.filter(Boolean).length, fb.length),
      submitSuccessRate: rate(done, done + failed),
      testToConsultRate: rate(withType.filter((x) => store.mentor(x.id).messages.length > 0).length, withType.length),
    };
    return c.json(stats);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
