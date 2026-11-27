// 개정 기획(PR #7) 비회원 탐색 API. /api/explore/* 와 /api/resources.
// 로그인 없이 쓴다. 첫 쓰기 요청에서 게스트 id + HttpOnly 쿠키 sid 를 만들고, 상태는 KV `explore:<actorId>` 한 곳에 둔다.
import type { Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
  CONDITION_NOTE, CONTEXTS, activeResources, EXPLORE_DATA_VERSION, INDUSTRY_TAGS, LOCAL_AI_HEADER, LOCAL_AI_TASKS, buildFieldQuestions, INTEREST_EXTRA, PROBLEMS, READINESS_OPTIONS, RESOURCES, RESOURCE_TYPES,
  REVIEW_REGIONS, SESSION_COOKIE, applySummaryEdit, buildPrep, buildRegional, buildSummary, checkConditions, coverageByRegion, coverageNote,
  problemOf, problemsFor, reasonFor, recommendResources, validateStart,
  type Exploration, type ExploreResultResponse, type FieldQuestion, type LocalAiTask, type ExploreSession, type PrepItem, type ReadinessStage,
  type RegionalContextCard, type Resource, type ResourceCard, type StartProfile, type SummaryEdit, type SummaryV2, type UserConditions,
} from '@gil/shared';
import { createLimiter, exploreAi, problemContext } from './ai';
import { CLOSING, MAX_QUESTIONS, OPENING, QUESTIONS, planQuestions, ruleSuggestions } from './chat';
import type { ExploreState } from '../db/schema';
import { HttpError, type AppEnv } from '../http';
import type { Store } from '../store';
import { exemptQuota, limitMessage, quotaConfig, quotaKeys, quotaStatus, recordConsult, type QuotaConfig } from './quota';

type Ctx = Context<AppEnv>;
const bad = (m: string, fields?: { field: string; message: string }[]) =>
  fields ? new HttpError(400, 'validation', m, fields as never) : new HttpError(400, 'bad_request', m);
const GUEST_RE = /^g-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EVENT_TYPES = ['start', 'chat_done', 'result', 'resource_link', 'regional_expand', 'feedback'] as const;
/** 사람(기기)당 한 번만 세는 이벤트 */
const ONCE_EVENTS = new Set(['start', 'chat_done', 'result']);

async function body(c: Ctx, required = true): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json();
    if (b && typeof b === 'object' && !Array.isArray(b)) return b as Record<string, unknown>;
  } catch { /* 아래에서 처리 */ }
  if (required) throw bad('JSON 본문이 필요해요');
  return {};
}
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const optStr = (v: unknown, max: number): string | undefined => str(v, max) ?? undefined;

const emptyState = (now: Date, kind: 'guest' | 'user'): ExploreState => ({
  kind, createdAt: now.toISOString(), updatedAt: null, step: 'start', start: {}, exploration: null, messages: [], questionIndex: 0,
  plan: [], answers: [], finished: false, summary: null, regional: null, prepDone: {}, ai: null, rejected: [], lastBody: null,
  feedback: null, events: { start: 1 }, counted: false, fieldQ: null,
});

const asSummary = (s: ExploreState['summary']) => s as SummaryV2 | null;
const sessionBase = (s: ExploreState): ExploreSession => ({
  step: s.step, start: s.start as StartProfile, exploration: s.exploration as Exploration | null, messages: s.messages,
  questionIndex: s.questionIndex, maxQuestions: MAX_QUESTIONS, summary: asSummary(s.summary), regional: s.regional as RegionalContextCard | null,
  updatedAt: s.updatedAt,
});

/** 웹이 로컬 AI 로 다듬을 수 있다고 알린 작업 (x-local-ai: mentor,reason,field). */
const localTasks = (c: Ctx): Set<LocalAiTask> => {
  const out = new Set<LocalAiTask>();
  for (const t of (c.req.header(LOCAL_AI_HEADER) ?? '').split(',')) {
    const v = t.trim().toLowerCase();
    if ((LOCAL_AI_TASKS as readonly string[]).includes(v)) out.add(v as LocalAiTask);
  }
  return out;
};

const fieldSig = (s: ExploreState) => [s.exploration?.problemId ?? '', s.exploration?.origin ?? '', s.exploration?.customProblem ?? '', s.exploration?.direction ?? ''].join('|');
const ruleFieldQuestions = (s: ExploreState, summary: SummaryV2 | null): FieldQuestion[] => {
  const ex = s.exploration as Exploration | null;
  const p = problemOf(ex?.problemId);
  return buildFieldQuestions(p, ex, summary, p?.unknowns ?? []);
};

const newExploration = (): Exploration => ({ problemId: null, origin: 'hold', customProblem: null, selectionReason: null, direction: null, directionStatus: 'hold', dataVersion: EXPLORE_DATA_VERSION, suggestions: [] });

/** 요약·추천 입력이 같은지 알리는 서명. 같을 때만 저장해 둔 AI 이유를 쓴다. */
const aiSig = (s: ExploreState) => [s.start.readiness, s.exploration?.problemId, s.exploration?.direction].join('|');

/** 대화에서 사용자가 쓴 글 (AI 사실 검사에서 허용하는 원문). */
const userTexts = (s: ExploreState): string[] => [
  s.start.idea ?? '', s.start.interestNote ?? '', s.exploration?.customProblem ?? '', s.exploration?.selectionReason ?? '', s.exploration?.direction ?? '',
  ...s.answers.map((a) => a.text ?? ''),
].filter(Boolean);

function aiContext(s: ExploreState): string {
  const p = problemOf(s.exploration?.problemId);
  return [
    `준비 상태: ${READINESS_OPTIONS.find((o) => o.value === s.start.readiness)?.label ?? '미정'}`,
    `하고 싶은 일: ${s.start.idea ?? '미정'}`,
    `관심: ${(s.start.interests ?? []).join(', ') || '미정'} ${s.start.interestNote ?? ''}`,
    `검토 지역: ${s.start.reviewRegion ?? '미정'}`,
    problemContext(p), s.exploration?.customProblem ? `직접 쓴 문제(외부 검증 전): ${s.exploration.customProblem}` : '',
    `사용자 답변: ${s.answers.filter((a) => a.text).map((a) => `${a.key}=${a.text}`).join(' / ') || '없음'}`,
  ].filter(Boolean).join('\n');
}

// ---- 결과 계산 (규칙 기반, 저장된 AI 이유가 서명과 맞으면 사용) ----
function computeResult(s: ExploreState, now: Date, resources: Resource[]): ExploreResultResponse {
  const ex = s.exploration as Exploration | null;
  const summary = asSummary(s.summary) ?? buildSummary({ start: s.start as StartProfile, exploration: ex, answers: s.answers });
  const rec = recommendResources({ readiness: s.start.readiness, problemId: ex?.problemId, direction: ex?.direction, reviewRegion: s.start.reviewRegion, conditions: s.start.conditions as UserConditions | undefined, now, resources });
  const sig = aiSig(s);
  const cards: ResourceCard[] = rec.items.map((r) => {
    const rule = reasonFor(r.resource, s.start.readiness, r.linked);
    const aiText = s.ai?.sig === sig ? s.ai.reasons[r.resource.id] : undefined;
    return {
      resource: r.resource, reason: aiText ?? rule, reasonProvenance: aiText ? 'ai' : 'rule',
      condition: { status: r.condition.status, checks: r.condition.checks }, regionMatch: r.regionMatch,
    };
  });
  const built = s.regional ? null : buildRegional({ start: s.start as StartProfile, exploration: ex, now });
  const regional = (s.regional as RegionalContextCard | null) ?? built?.card ?? null;
  const contexts = regional ? CONTEXTS.filter((c) => regional.sourceIds.includes(c.id)) : [];
  const prep = buildPrep(s.start.readiness, summary, ex, rec.items.map((x) => x.resource));
  const mark = (p: Omit<PrepItem, 'done'>): PrepItem => ({ ...p, done: s.prepDone[p.id] === true });
  return {
    summary, regional, contexts,
    prep: { primary: mark(prep.primary), followUps: prep.followUps.map(mark) },
    resources: cards, noMatchReason: rec.noMatchReason,
    coverageNote: coverageNote(s.start.reviewRegion, PROBLEMS, activeResources(resources, now), CONTEXTS),
    conditionNote: CONDITION_NOTE,
    // 저장된 AI 문장은 문제·방향 서명이 같을 때만 쓴다. 문제가 바뀌면 규칙 질문으로 다시 만든다.
    fieldQuestions: s.fieldQ?.sig === fieldSig(s) ? s.fieldQ.items as FieldQuestion[] : ruleFieldQuestions(s, summary),
  };
}

function cardFor(r: Resource, s: ExploreState | undefined, now: Date): ResourceCard {
  const cond = checkConditions(r, s?.start.conditions as UserConditions | undefined, now);
  const reg = s?.start.reviewRegion;
  return {
    resource: r, reason: `${r.content}${r.target ? ` (대상: ${r.target})` : ''}`, reasonProvenance: 'rule',
    condition: { status: cond.status, checks: cond.checks }, regionMatch: !!reg && reg !== '미정' && r.regions.some((x) => x === reg || x === '부울경'),
  };
}

/** 관리자 통계: 비회원(기기·쿠키 세션 1개 = 1)과 회원(계정 1개 = 1)을 따로 센다. 실제 사람 수가 아니다. */
export function exploreStats(store: Store) {
  const team = new Set(store.allUsers().filter((u) => u.isTeam).map((u) => u.id));
  const tally = (kind: 'guest' | 'user') => {
    const rows = store.allExplores().filter(([id, s]) => s.kind === kind && !team.has(id)).map(([, s]) => s);
    const fb = rows.filter((s) => s.feedback?.helpful !== undefined);
    const helpful = fb.filter((s) => s.feedback!.helpful).length;
    return {
      sessions: rows.length,
      chatDone: rows.filter((s) => (s.events.chat_done ?? 0) > 0).length,
      resultReached: rows.filter((s) => (s.events.result ?? 0) > 0).length,
      feedback: fb.length,
      helpfulRate: fb.length ? helpful / fb.length : null,
      resourceLinks: rows.reduce((n, s) => n + (s.events.resource_link ?? 0), 0),
    };
  };
  return { unit: '비회원은 기기(쿠키) 세션 1개, 회원은 계정 1개. 실제 사람 수가 아니에요.', guests: tally('guest'), accounts: tally('user'), limitHits: store.limitHits() };
}

export function mountExplore(app: Hono<AppEnv>, opts: { clock: () => Date; resources?: () => Resource[]; aiLimit?: number; consultLimit?: { count?: number; windowDays?: number }; env?: { IP_HASH_SALT?: string } }) {
  const allow = createLimiter(opts.aiLimit ?? 40);
  const cfg: QuotaConfig = quotaConfig(opts.consultLimit);
  /** 팀 검수 자료 + 수집한 실제 지원사업. */
  const resourcesNow = (): Resource[] => opts.resources?.() ?? RESOURCES;

  // ---- 행위자 ----
  const readActor = (c: Ctx): { id: string; kind: 'guest' | 'user' } | null => {
    const u = c.get('user');
    if (u) return { id: u.id, kind: 'user' };
    const t = getCookie(c, SESSION_COOKIE);
    return t && GUEST_RE.test(t) ? { id: t, kind: 'guest' } : null;
  };
  const writeActor = (c: Ctx) => {
    const a = readActor(c);
    if (a) return a;
    const id = `g-${crypto.randomUUID()}`;
    setCookie(c, SESSION_COOKIE, id, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 60 * 60 * 24 * 14, secure: new URL(c.req.url).protocol === 'https:' });
    return { id, kind: 'guest' as const };
  };
  /** 읽기: 기록이 없으면 저장하지 않는 빈 상태. */
  const peek = (c: Ctx): ExploreState => {
    const a = readActor(c);
    return (a && c.get('store').explore(a.id)) || emptyState(c.get('now'), a?.kind ?? 'guest');
  };
  /** 쓰기: 기록이 없으면 만든다. */
  const open = (c: Ctx) => {
    const a = writeActor(c);
    const store = c.get('store');
    let s = store.explore(a.id);
    if (!s) { s = emptyState(c.get('now'), a.kind); store.setExplore(a.id, s); }
    s.updatedAt = c.get('now').toISOString();
    return { actor: a, s };
  };
  // ---- 상담 횟수 ----
  const saltOf = (c: Ctx) => ({ IP_HASH_SALT: (c.env as { IP_HASH_SALT?: string } | undefined)?.IP_HASH_SALT ?? opts.env?.IP_HASH_SALT });
  const keysOf = (c: Ctx, a: { id: string; kind: 'guest' | 'user' } | null) => quotaKeys(c, a, saltOf(c));
  const isExempt = (c: Ctx) => c.get('user')?.isTeam === true;
  const quotaOf = async (c: Ctx, a: { id: string; kind: 'guest' | 'user' } | null) =>
    isExempt(c) ? exemptQuota(cfg) : (({ blocked: _b, ...q }) => q)(quotaStatus(c.get('store'), await keysOf(c, a), c.get('now'), cfg));
  /** 세션 응답: 상담 횟수(quota)와 이 세션의 집계 여부(counted)를 항상 붙인다. */
  const view = async (c: Ctx, s: ExploreState, a: { id: string; kind: 'guest' | 'user' } | null = readActor(c)): Promise<ExploreSession> =>
    ({ ...sessionBase(s), quota: await quotaOf(c, a), counted: s.counted });
  const touch = (s: ExploreState, c: Ctx) => { s.updatedAt = c.get('now').toISOString(); };
  const bump = (s: ExploreState, type: string) => { s.events[type] = ONCE_EVENTS.has(type) ? 1 : (s.events[type] ?? 0) + 1; };
  const requireStart = (s: ExploreState) => {
    const errors = validateStart(s.start as StartProfile);
    if (errors.length) throw bad('시작 정보를 먼저 입력해 주세요', errors);
  };

  // ---- 시작 전 자료 ----
  app.get('/api/explore/options', (c) => c.json({
    readiness: READINESS_OPTIONS,
    interests: [...INDUSTRY_TAGS, ...INTEREST_EXTRA],
    regions: REVIEW_REGIONS,
    coverage: coverageByRegion(PROBLEMS, activeResources(resourcesNow(), c.get('now')), CONTEXTS),
    dataVersion: EXPLORE_DATA_VERSION,
    privacy: '입력한 내용은 이 서비스 서버에 저장되고, 문장 정리를 위해 외부 AI(Upstage Solar)로 전송될 수 있어요. 이 기기의 쿠키로만 이어지며 기기·브라우저가 바뀌면 이어지지 않아요. "처음부터 다시"를 누르면 서버에 저장된 내 기록과 쿠키가 지워지고, 익명 집계(횟수)만 남아요.',
  }));

  app.get('/api/explore/problems', (c) => {
    const interests = (c.req.query('interests') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const { items, emptyReason } = problemsFor(interests, c.req.query('region'));
    return c.json({ items, dataVersion: EXPLORE_DATA_VERSION, emptyReason });
  });

  // ---- 세션 ----
  app.get('/api/explore/session', async (c) => c.json(await view(c, peek(c))));

  app.delete('/api/explore/session', async (c) => {
    const a = readActor(c);
    if (a) c.get('store').deleteExplore(a.id);
    // 회원의 로그인 쿠키는 지우지 않는다 (탐색 기록만 삭제).
    if (a?.kind !== 'user' && getCookie(c, SESSION_COOKIE)) deleteCookie(c, SESSION_COOKIE, { path: '/' });
    // 이미 쓴 상담 횟수는 돌려주지 않는다 (횟수는 쿠키·IP 키에 따로 있다).
    return c.json({ ok: true, session: await view(c, emptyState(c.get('now'), a?.kind ?? 'guest'), a) });
  });

  // ---- F1 시작 정보 ----
  app.put('/api/explore/start', async (c) => {
    const b = await body(c);
    const patch = b.start;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw bad('start가 필요해요');
    const p = patch as Record<string, unknown>;
    const { actor, s } = open(c);
    const prev = JSON.stringify([s.start.readiness, s.start.idea, s.start.interests, s.start.interestNote]);
    const prevRegion = JSON.stringify([s.start.reviewRegion, s.start.district, s.start.conditions]);
    const errors: { field: string; message: string }[] = [];
    const cur = { ...s.start } as Record<string, unknown>;
    const setOrClear = (k: string, v: unknown) => { if (v === undefined) delete cur[k]; else cur[k] = v; };

    if ('readiness' in p) {
      if (p.readiness === null || p.readiness === '') setOrClear('readiness', undefined);
      else if (READINESS_OPTIONS.some((o) => o.value === p.readiness)) cur.readiness = p.readiness;
      else errors.push({ field: 'readiness', message: '준비 상태 값이 올바르지 않아요' });
    }
    if ('idea' in p) {
      const raw = typeof p.idea === 'string' ? p.idea.trim() : '';
      if (raw.length > 200) errors.push({ field: 'idea', message: '해보고 싶은 일은 200자 이내로 적어 주세요' });
      else setOrClear('idea', raw || undefined);
    }
    if ('interests' in p) {
      const arr = Array.isArray(p.interests) ? p.interests.filter((x): x is string => typeof x === 'string') : [];
      const allowed: readonly string[] = [...INDUSTRY_TAGS, ...INTEREST_EXTRA];
      if (arr.some((x) => !allowed.includes(x))) errors.push({ field: 'interests', message: '목록에 없는 관심 분야는 "직접 적기"에 써 주세요' });
      setOrClear('interests', arr.length ? [...new Set(arr.filter((x) => allowed.includes(x)))] : undefined);
    }
    if ('interestNote' in p) setOrClear('interestNote', optStr(p.interestNote, 200));
    if ('district' in p) setOrClear('district', optStr(p.district, 20));
    if ('reviewRegion' in p) {
      if (p.reviewRegion === null || p.reviewRegion === '') setOrClear('reviewRegion', undefined);
      else if ((REVIEW_REGIONS as readonly string[]).includes(p.reviewRegion as string)) cur.reviewRegion = p.reviewRegion;
      else errors.push({ field: 'reviewRegion', message: '창업 검토 지역 값이 올바르지 않아요' });
    }
    if ('conditions' in p) setOrClear('conditions', sanitizeConditions(p.conditions));
    s.start = cur as ExploreState['start'];

    if (JSON.stringify([s.start.readiness, s.start.idea, s.start.interests, s.start.interestNote]) !== prev) s.summary = null; // 입력이 바뀌면 요약을 다시 만든다
    if (JSON.stringify([s.start.reviewRegion, s.start.district, s.start.conditions]) !== prevRegion || s.summary === null) s.regional = null;
    if (s.step === 'start' && validateStart(s.start as StartProfile).length === 0) s.step = 'chat';
    touch(s, c);
    return c.json({ ...(await view(c, s, actor)), errors: [...errors, ...validateStart(s.start as StartProfile).filter((e) => !errors.some((x) => x.field === e.field))] });
  });

  // ---- 문제 선택·방향 ----
  app.put('/api/explore/exploration', async (c) => {
    const b = await body(c);
    const { actor, s } = open(c);
    const cur = s.exploration as Exploration | null;
    const next: Exploration = cur ? { ...cur } : newExploration();

    if ('origin' in b || 'problemId' in b || 'customProblem' in b) {
      const origin = (b.origin as string | undefined) ?? (b.problemId ? 'card' : b.customProblem ? 'custom' : cur?.origin ?? 'hold');
      if (origin === 'card') {
        const id = typeof b.problemId === 'string' ? b.problemId : cur?.problemId;
        if (!id || !PROBLEMS.some((p) => p.id === id)) throw bad('없거나 바뀐 문제 카드예요. 다른 카드를 고르거나 직접 입력해 주세요');
        next.origin = 'card'; next.problemId = id; next.customProblem = null;
      } else if (origin === 'custom') {
        const text = 'customProblem' in b ? str(b.customProblem, 300) : cur?.customProblem ?? null;
        if (!text) throw bad('직접 입력할 문제를 적어 주세요');
        next.origin = 'custom'; next.problemId = null; next.customProblem = text;
      } else if (origin === 'hold') {
        next.origin = 'hold'; next.problemId = null; next.customProblem = null;
      } else throw bad('origin 값이 올바르지 않아요');
    }
    if ('selectionReason' in b) next.selectionReason = b.selectionReason === null ? null : str(b.selectionReason, 300);

    const status = b.directionStatus;
    if (status !== undefined && !['user', 'user_selected', 'hold'].includes(status as string)) throw bad('directionStatus 는 user, user_selected, hold 만 보낼 수 있어요');
    if ('direction' in b) {
      next.direction = b.direction === null ? null : str(b.direction, 300);
      if (status === undefined) next.directionStatus = next.direction ? 'user' : 'hold';
    }
    if (status !== undefined) {
      next.directionStatus = status as Exploration['directionStatus'];
      if (status === 'hold' && !('direction' in b)) { next.direction = null; }
    }
    if ((next.directionStatus === 'user_selected' || next.directionStatus === 'user') && !next.direction) throw bad('방향을 선택하려면 방향 내용이 필요해요');
    if (next.directionStatus === 'hold' && cur && cur.suggestions.length) s.rejected = [...new Set([...s.rejected, ...cur.suggestions])].slice(-20); // 거절한 제안은 다시 내지 않는다
    if (next.directionStatus === 'user_selected' || next.directionStatus === 'user' || next.directionStatus === 'hold') next.suggestions = [];

    const problemChanged = !!cur && (cur.problemId !== next.problemId || cur.origin !== next.origin || cur.customProblem !== next.customProblem);
    s.exploration = next;
    if (problemChanged) {
      // 사용자 입력(대화·이유·방향)은 보존하고, 이전 문제에서 만든 결과는 모두 버린다.
      next.dataVersion = EXPLORE_DATA_VERSION;
      s.summary = null; s.regional = null; s.prepDone = {}; s.ai = null; s.lastBody = null; s.fieldQ = null;
      if (s.step === 'result' || s.step === 'summary') s.step = 'summary';
    } else if (s.summary) {
      // 같은 문제에서 이유·방향만 바뀌면 요약의 해당 칸만 맞춘다.
      s.summary = { ...s.summary, exploration: { ...s.summary.exploration,
        reason: next.selectionReason ? { text: next.selectionReason, provenance: 'user' } : { text: '미정', provenance: 'unknown' },
        direction: next.direction ? { text: next.direction, provenance: 'user', status: next.directionStatus } : { text: '아직 탐색 중', provenance: 'unknown', status: 'hold' } } };
    }
    touch(s, c);
    return c.json({ ...(await view(c, s, actor)), problemChanged });
  });

  // ---- F2 대화 ----
  app.post('/api/explore/chat', async (c) => {
    const b = await body(c, false);
    // 상담 횟수: 아직 세지 않은 빈 대화의 첫 질문 요청이면 열기 전에 한도를 본다 (초과면 세션을 바꾸지 않는다).
    const prior = readActor(c);
    const prev = prior ? c.get('store').explore(prior.id) : undefined;
    if (prev && !prev.counted && prev.messages.length === 0 && validateStart(prev.start as StartProfile).length === 0 && !isExempt(c)) {
      const q = quotaStatus(c.get('store'), await keysOf(c, prior), c.get('now'), cfg);
      if (q.blocked) {
        c.get('store').addLimitHit();
        const { blocked: _b, ...quota } = q;
        throw new HttpError(429, 'limit', limitMessage(quota, cfg), undefined, quota);
      }
    }
    const { actor, s } = open(c);
    requireStart(s);
    const message = typeof b.message === 'string' ? b.message.trim() : '';
    if (message.length > 1000) throw bad('메시지는 1000자 이하로 써 주세요');
    const skip = b.skip === true, unknown = b.unknown === true, finish = b.finish === true, want = b.wantSuggestions === true;
    const claimed = typeof b.questionIndex === 'number' ? b.questionIndex : undefined; // 선택: 화면이 보고 있던 질문 번호 (재전송 판별)
    const now = c.get('now');
    const at = now.toISOString();
    const ai = exploreAi(c.get('ai').raw, allow, actor.id, now.getTime(), localTasks(c));
    let failed = false;
    const hasAnswer = !!message || skip || unknown;
    const sig = JSON.stringify([message, skip, unknown]);
    const lastBody = s.lastBody;
    const done0 = s.finished || s.questionIndex >= MAX_QUESTIONS;
    const duplicate = hasAnswer && ((claimed !== undefined && claimed < s.questionIndex)
      || (!!message && lastBody?.sig === sig && now.getTime() - Date.parse(lastBody.at) < 2000));

    const ask = async (key: string, last: string) => {
      const q = await ai.question(QUESTIONS[key]!, last);
      if (q.failed) failed = true;
      s.messages.push({ role: 'mentor', text: q.text, at, questionIndex: s.questionIndex });
    };
    const opening = async () => {
      if (s.plan.length === 0) s.plan = planQuestions({ start: s.start as StartProfile, exploration: s.exploration as Exploration | null, answers: s.answers });
      s.messages.push({ role: 'mentor', text: OPENING, at });
      await ask(s.plan[0]!, '');
    };

    if (!done0 && !duplicate) {
      if (s.messages.length === 0) {
        if (!s.counted) {
          if (!isExempt(c)) recordConsult(c.get('store'), await keysOf(c, actor), now, cfg);
          s.counted = true;
        }
        await opening();
      }
      if (hasAnswer) {
        const key = s.plan[s.questionIndex]!;
        const how = unknown ? 'unknown' : skip && !message ? 'skipped' : 'answered';
        s.messages.push({ role: 'user', text: how === 'answered' ? message : how === 'unknown' ? '아직 모르겠어요' : '', at, questionIndex: s.questionIndex, ...(how === 'skipped' ? { skipped: true } : {}) });
        s.answers.push({ key, text: how === 'answered' ? message : null, how });
        s.questionIndex += 1;
        s.lastBody = { sig, at };
        if (!finish && s.questionIndex < MAX_QUESTIONS) await ask(s.plan[s.questionIndex]!, message);
      }
      if (finish || s.questionIndex >= MAX_QUESTIONS) {
        s.finished = true;
        s.messages.push({ role: 'mentor', text: CLOSING, at });
        bump(s, 'chat_done');
        s.step = 'summary';
      } else s.step = 'chat';
    }

    if (want) {
      const ex = (s.exploration as Exploration | null) ?? newExploration();
      const r = await ai.suggestions(aiContext(s), userTexts(s), s.rejected);
      if (r.failed) failed = true;
      const rules = ruleSuggestions(s.start as StartProfile, ex, [...s.rejected, ...r.items]);
      ex.suggestions = [...r.items, ...rules].slice(0, 2);
      // 제안은 사용자의 선택이 아니다. 이미 사용자가 고른 방향은 덮지 않는다.
      if (ex.directionStatus === 'hold' || ex.directionStatus === 'ai_suggested') ex.directionStatus = 'ai_suggested';
      s.exploration = ex;
    }
    touch(s, c);
    const ex = s.exploration as Exploration | null;
    return c.json({ messages: s.messages, questionIndex: s.questionIndex, done: s.finished || s.questionIndex >= MAX_QUESTIONS, suggestions: ex?.suggestions ?? [], failed });
  });

  // ---- F3 요약 ----
  app.post('/api/explore/summary', async (c) => {
    const { actor, s } = open(c);
    requireStart(s);
    const now = c.get('now');
    const ai = exploreAi(c.get('ai').raw, allow, actor.id, now.getTime(), localTasks(c));
    const ex = s.exploration as Exploration | null;
    const base = buildSummary({ start: s.start as StartProfile, exploration: ex, answers: s.answers });
    const ctx = aiContext(s);
    const filled = await ai.fill(ctx, userTexts(s), { target: base.target.provenance === 'unknown', value: base.value.provenance === 'unknown' });
    const summary = buildSummary({ start: s.start as StartProfile, exploration: ex, answers: s.answers, aiFill: filled.fill });
    const reg = buildRegional({ start: s.start as StartProfile, exploration: ex, now, aiHypothesis: filled.regionalHypothesis });
    const hadSummary = s.summary !== null;
    const prepReset = hadSummary && Object.keys(s.prepDone).length > 0;
    if (hadSummary) s.prepDone = {};
    s.summary = summary;
    s.regional = reg?.card ?? null;
    // 추천 이유는 규칙 결과에 대해서만 AI 문장으로 다듬는다.
    const rec = recommendResources({ readiness: s.start.readiness, problemId: ex?.problemId, direction: ex?.direction, reviewRegion: s.start.reviewRegion, conditions: s.start.conditions as UserConditions | undefined, now, resources: resourcesNow() });
    const reasons: Record<string, string> = {};
    await Promise.all(rec.items.map(async (r) => {
      const t = await ai.reason(r.resource, reasonFor(r.resource, s.start.readiness, r.linked), ctx);
      if (t) reasons[r.resource.id] = t;
    }));
    s.ai = { sig: aiSig(s), reasons };
    s.step = 'summary';
    touch(s, c);
    return c.json({ summary, regional: s.regional, prepReset, failed: filled.failed });
  });

  app.put('/api/explore/summary', async (c) => {
    const b = await body(c);
    if (!b.summary || typeof b.summary !== 'object' || Array.isArray(b.summary)) throw bad('summary가 필요해요');
    const { s } = open(c);
    const now = c.get('now');
    const base = asSummary(s.summary) ?? buildSummary({ start: s.start as StartProfile, exploration: s.exploration as Exploration | null, answers: s.answers });
    const edit = cleanEdit(b.summary as Record<string, unknown>);
    const { summary, changed } = applySummaryEdit(base, edit);
    s.summary = summary;
    if (changed) {
      const exEdit = edit.exploration;
      if (exEdit?.direction || exEdit?.reason) {
        const ex = (s.exploration as Exploration | null) ?? newExploration();
        if (exEdit.reason) ex.selectionReason = summary.exploration.reason.provenance === 'user' ? summary.exploration.reason.text : null;
        if (exEdit.direction) {
          ex.direction = summary.exploration.direction.provenance === 'user' ? summary.exploration.direction.text : null;
          ex.directionStatus = ex.direction ? 'user' : 'hold';
          ex.suggestions = [];
        }
        s.exploration = ex;
      }
      s.regional = buildRegional({ start: s.start as StartProfile, exploration: s.exploration as Exploration | null, now })?.card ?? null;
      s.ai = null; // 이전 입력 기준의 AI 이유는 버린다
    }
    const prepReset = changed && Object.keys(s.prepDone).length > 0;
    if (changed) s.prepDone = {};
    touch(s, c);
    return c.json({ summary, regional: s.regional, prepReset });
  });

  // ---- 결과 ----
  app.get('/api/explore/result', async (c) => {
    const a = readActor(c);
    const s = (a && c.get('store').explore(a.id)) || emptyState(c.get('now'), a?.kind ?? 'guest');
    const saved = !!a && !!c.get('store').explore(a.id);
    if (saved) { bump(s, 'result'); s.step = 'result'; touch(s, c); }
    const result = computeResult(s, c.get('now'), resourcesNow());
    // 현장 질문 문장 다듬기 (선택). 로컬 AI 가 'field' 를 맡으면 Solar 를 부르지 않는다. 저장된 문장이 서명과 맞으면 다시 부르지 않는다.
    if (saved && a && s.fieldQ?.sig !== fieldSig(s) && !localTasks(c).has('field')) {
      const now = c.get('now');
      const ai = exploreAi(c.get('ai').raw, allow, a.id, now.getTime(), localTasks(c));
      const rules = ruleFieldQuestions(s, result.summary);
      const r = await ai.field(rules, aiContext(s));
      if (r.changed) { s.fieldQ = { sig: fieldSig(s), items: r.items }; result.fieldQuestions = r.items; }
    }
    return c.json(result);
  });

  app.put('/api/explore/conditions', async (c) => {
    const b = await body(c);
    if (!b.conditions || typeof b.conditions !== 'object' || Array.isArray(b.conditions)) throw bad('conditions가 필요해요');
    const { s } = open(c);
    const cond = sanitizeConditions(b.conditions);
    if (cond) s.start = { ...s.start, conditions: cond }; else { const { conditions: _x, ...rest } = s.start; s.start = rest; }
    s.regional = null;
    touch(s, c);
    return c.json(computeResult(s, c.get('now'), resourcesNow()));
  });

  app.put('/api/explore/prep', async (c) => {
    const b = await body(c);
    if (typeof b.id !== 'string' || typeof b.done !== 'boolean') throw bad('id와 done이 필요해요');
    const { s } = open(c);
    const prep = computeResult(s, c.get('now'), resourcesNow()).prep;
    const ids = [prep.primary, ...prep.followUps].map((p) => p.id);
    if (!ids.includes(b.id)) throw new HttpError(404, 'not_found', '지금 준비 안내에 없는 항목이에요');
    s.prepDone[b.id] = b.done; // '준비 완료 표시'일 뿐 실제 수행의 증거가 아니다
    touch(s, c);
    return c.json({ prep: computeResult(s, c.get('now'), resourcesNow()).prep });
  });

  // ---- 피드백·이벤트 ----
  app.post('/api/explore/feedback', async (c) => {
    const b = await body(c);
    const { s } = open(c);
    const score = (v: unknown) => (typeof v === 'number' && v >= 1 && v <= 5 ? v : undefined);
    const pair = (v: unknown) => {
      const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
      const r = { before: score(o.before), after: score(o.after) };
      return r.before === undefined && r.after === undefined ? undefined : r;
    };
    s.feedback = {
      ...(typeof b.helpful === 'boolean' ? { helpful: b.helpful } : {}),
      ...(str(b.reason, 500) ? { reason: str(b.reason, 500)! } : {}),
      ...(typeof b.directionClear === 'boolean' ? { directionClear: b.directionClear } : {}),
      ...(str(b.wantToExplore, 500) ? { wantToExplore: str(b.wantToExplore, 500)! } : {}),
      ...(typeof b.foundRegionalPath === 'boolean' ? { foundRegionalPath: b.foundRegionalPath } : {}),
      ...(str(b.pathName, 200) ? { pathName: str(b.pathName, 200)! } : {}),
      ...(pair(b.knowWhatToPrepare) ? { knowWhatToPrepare: pair(b.knowWhatToPrepare) } : {}),
      ...(pair(b.regionIntent) ? { regionIntent: pair(b.regionIntent) } : {}),
      at: c.get('now').toISOString(),
    };
    bump(s, 'feedback');
    touch(s, c);
    return c.json({ ok: true });
  });

  app.post('/api/explore/events', async (c) => {
    const b = await body(c);
    if (!(EVENT_TYPES as readonly string[]).includes(b.type as string)) throw bad('type 값이 올바르지 않아요');
    const { s } = open(c);
    bump(s, b.type as string); // 횟수만 센다. 원문 대화·자유 입력은 받지 않는다.
    touch(s, c);
    return c.json({ ok: true });
  });

  // ---- F18 목록·상세 ----
  app.get('/api/resources', (c) => {
    const type = c.req.query('type'), stage = c.req.query('stage'), q = c.req.query('q')?.trim().toLowerCase();
    if (type && !(RESOURCE_TYPES as readonly string[]).includes(type)) throw bad('type 값이 올바르지 않아요');
    if (stage && !READINESS_OPTIONS.some((o) => o.value === stage)) throw bad('stage 값이 올바르지 않아요');
    const a = readActor(c);
    const s = a ? c.get('store').explore(a.id) : undefined;
    const items = resourcesNow()
      .filter((r) => (!type || r.type === type) && (!stage || r.stages.includes(stage as ReadinessStage))
        && (!q || [r.title, r.agency, r.content, ...r.capabilityTags].some((x) => x.toLowerCase().includes(q))))
      .map((r) => cardFor(r, s, c.get('now')));
    return c.json({ items });
  });

  app.get('/api/resources/:id', (c) => {
    const r = resourcesNow().find((x) => x.id === c.req.param('id'));
    if (!r) throw new HttpError(404, 'not_found', '경로를 찾을 수 없어요');
    const a = readActor(c);
    return c.json(cardFor(r, a ? c.get('store').explore(a.id) : undefined, c.get('now')));
  });
}

function sanitizeConditions(v: unknown): UserConditions | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const out: UserConditions = {};
  if (o.age === 'unknown') out.age = 'unknown';
  else if (typeof o.age === 'number' && Number.isInteger(o.age) && o.age >= 0 && o.age <= 120) out.age = o.age;
  for (const k of ['residence', 'affiliation'] as const) {
    if (o[k] === 'unknown') out[k] = 'unknown';
    else { const t = str(o[k], 40); if (t) out[k] = t; }
  }
  if (o.hasBusiness === 'unknown') out.hasBusiness = 'unknown';
  else if (typeof o.hasBusiness === 'boolean') out.hasBusiness = o.hasBusiness;
  return Object.keys(out).length ? out : undefined;
}

function cleanEdit(raw: Record<string, unknown>): SummaryEdit {
  const t = (v: unknown) => (v && typeof v === 'object' && typeof (v as { text?: unknown }).text === 'string' ? { text: ((v as { text: string }).text).slice(0, 1000) } : undefined);
  const ex = (raw.exploration && typeof raw.exploration === 'object' ? raw.exploration : {}) as Record<string, unknown>;
  const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) as T;
  return clean({
    interest: t(raw.interest), target: t(raw.target), value: t(raw.value), unknowns: t(raw.unknowns),
    exploration: clean({ reason: t(ex.reason), direction: t(ex.direction), hypotheses: t(ex.hypotheses) }),
  });
}
