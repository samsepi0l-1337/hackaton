// 개정 기획(PR #7) 규칙: 순수 함수만 둔다 (입출력·AI 없음). API 와 웹이 같이 쓸 수 있다.
// 원칙: 모르면 '확인 필요', 사용자가 말하지 않은 것은 만들지 않는다, 출처 표시는 코드가 붙인다.
import { BUSAN_DISTRICTS } from './constants';
import { CONTEXTS, PROBLEMS, RESOURCES } from './data';
import { kstDate } from './date';
import { likeSimilarity, type LikeProfile } from './likes';
import {
  IDEA_MAX_V2, INDUSTRY_TAGS, INTEREST_EXTRA, REVIEW_REGIONS,
  type ConditionCheck, type ConditionStatus, type Exploration, type FieldQuestion, type IndustryTag, type PrepItem, type ProblemCard,
  type ReadinessStage, type RegionalContext, type RegionalContextCard, type RegionalStatus, type Resource,
  type ReviewRegion, type SummaryItem, type SummaryV2, type StartProfile, type UserConditions,
} from './explore';

export const UNDECIDED_TEXT = '미정';
const END_TIME_NOTE = '정확한 종료 시각 확인 필요';
const isInterestIndustry = (s: string): s is IndustryTag => (INDUSTRY_TAGS as readonly string[]).includes(s);
export const industriesOf = (interests: readonly string[] | undefined): IndustryTag[] => (interests ?? []).filter(isInterestIndustry);
const realRegion = (r: string | undefined | null): ReviewRegion | null => (r && r !== '미정' && (REVIEW_REGIONS as readonly string[]).includes(r) ? (r as ReviewRegion) : null);

// ---- F1 최소 검증 ----
export interface StartError { field: 'readiness' | 'idea' | 'interests' | 'reviewRegion' | 'district'; message: string }

/** 준비 상태는 필수. 있음·준비 중은 아이디어 또는 관심 1개, 없음은 관심·직접 적기 1개. 그 밖에는 요구하지 않는다. */
export function validateStart(s: Partial<StartProfile>): StartError[] {
  const errors: StartError[] = [];
  const idea = s.idea?.trim() ?? '';
  const hasInterest = (s.interests ?? []).length > 0 || !!s.interestNote?.trim();
  if (!s.readiness) { errors.push({ field: 'readiness', message: '지금 상태를 골라 주세요' }); return errors; }
  if (idea.length > IDEA_MAX_V2) errors.push({ field: 'idea', message: `해보고 싶은 일은 ${IDEA_MAX_V2}자 이내로 적어 주세요` });
  if (s.readiness === 'no_idea') { if (!hasInterest) errors.push({ field: 'interests', message: '관심 분야나 경험을 하나 이상 골라 주세요' }); }
  else if (!idea && !hasInterest) errors.push({ field: 'idea', message: '해보고 싶은 일을 적거나 관심 분야를 골라 주세요' });
  return errors;
}

// ---- F21 문제 카드 ----
export const PROBLEMS_EMPTY_REASON = '현재 확인된 문제 자료가 없습니다. 직접 입력하거나 탐색을 보류하고 진행할 수 있어요.';

/** 지역 일치: 카드·경로의 지역이 '부울경'이면 모든 지역과 맞는다. */
export const regionFits = (cardRegion: string, region: string | null | undefined): boolean => {
  const r = realRegion(region);
  return !r || cardRegion === '부울경' || cardRegion === r;
};

export function problemsFor(interests: readonly string[] | undefined, region?: string | null, problems: ProblemCard[] = PROBLEMS): { items: ProblemCard[]; emptyReason: string | null } {
  const tags = industriesOf(interests);
  const items = tags.length === 0 ? [] : problems.filter((p) => p.industryTags.some((t) => tags.includes(t)) && regionFits(p.region, region)).slice(0, 3);
  return { items, emptyReason: items.length ? null : PROBLEMS_EMPTY_REASON };
}

// ---- F4 조건 대조 ----
/** 지역 이름을 부울경 세 권역으로 줄인다. 모르면 null. */
export function regionOfText(s: string | undefined | null): ReviewRegion | null {
  const t = (s ?? '').trim();
  if (!t) return null;
  if (t.includes('울산')) return '울산';
  if (/경남|경상남도|창원|김해|양산|진주|거제|통영/.test(t)) return '경남';
  if (t.includes('부산') || (BUSAN_DISTRICTS as readonly string[]).includes(t)) return '부산';
  return null;
}

const mk = (key: ConditionCheck['key'], label: string, status: ConditionStatus, detail: string): ConditionCheck => ({ key, label, status, detail });

export interface ConditionResult {
  status: ConditionStatus;
  checks: ConditionCheck[];
  /** 현재 모집 중이 아님 (종료·마감일 지남). 추천에서 뺀다. */
  closed: boolean;
  /** 마감일만 있고 시각이 없을 때 등의 안내. */
  notes: string[];
}

/**
 * 원문에 거주 조건이 없을 때: 자료의 이용·지원 지역과 입력한 거주지를 비교한다.
 * 지원 지역은 사업장 소재지 기준일 수 있어서 달라도 '불일치'로 정하지 않는다 (추천에서 빠지지 않게).
 */
/** 받침이 있으면 '이에요', 없으면 '예요'. */
const copula = (w: string) => { const c = w.charCodeAt(w.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? '이에요' : '예요'; };

function regionCheck(r: Resource, userRes: string | null): ConditionCheck {
  if (r.regions.includes('전국')) return mk('residence', '거주지', 'match', userRes ? `전국 대상이에요 (입력한 거주지 ${userRes})` : '전국 대상이에요');
  const area = r.regions.join('·');
  if (!area) return mk('residence', '거주지', 'check', '원문의 거주 조건을 확인하지 못했어요');
  if (!userRes) return mk('residence', '거주지', 'check', `지원 지역은 ${area}${copula(area)}. 거주지를 입력하지 않아 비교하지 못했어요`);
  const have = regionOfText(userRes);
  const inArea = have !== null && r.regions.some((x) => x === have || x === '부울경');
  return inArea
    ? mk('residence', '거주지', 'match', `입력한 거주지(${userRes})가 지원 지역(${area})에 속해요. 사업장 소재지 조건은 공식 안내로 확인해 주세요`)
    : mk('residence', '거주지', 'check', `지원 지역(${area})과 입력한 거주지(${userRes})가 달라요. 사업장 소재지 기준인지 공식 안내로 확인해 주세요`);
}

/** 대화에서 입력한 조건이 먼저, 비었거나 '모름'인 칸은 내 정보 값으로 채운다. */
export function mergeConditions(session: UserConditions | undefined, profile: UserConditions | undefined): UserConditions | undefined {
  if (!session) return profile;
  if (!profile) return session;
  const out: UserConditions = { ...profile };
  for (const k of ['age', 'residence', 'affiliation', 'hasBusiness'] as const) {
    const v = session[k];
    if (v !== undefined && v !== 'unknown' && v !== '') (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export function checkConditions(r: Resource, user: UserConditions | undefined, now: Date): ConditionResult {
  const u = user ?? {};
  const c = r.conditions;
  const checks: ConditionCheck[] = [];
  const notes: string[] = [];

  // 나이
  const age = typeof u.age === 'number' ? u.age : null;
  if (c?.ageAny) checks.push(mk('age', '나이', 'match', age === null ? '나이 제한이 없다고 명시돼 있어요' : `나이 제한이 없다고 명시돼 있어요 (입력한 나이 ${age}세)`));
  else if (!c || (c.ageMin === undefined && c.ageMax === undefined)) checks.push(mk('age', '나이', 'check', age === null ? '원문의 나이 조건을 확인하지 못했어요' : `입력한 나이는 ${age}세예요. 원문에 나이 조건이 없어 공식 안내로 확인해 주세요`));
  else if (age === null) checks.push(mk('age', '나이', 'check', '나이를 입력하지 않아 비교하지 못했어요'));
  else if ((c.ageMin !== undefined && age < c.ageMin) || (c.ageMax !== undefined && age > c.ageMax)) checks.push(mk('age', '나이', 'mismatch', `입력한 나이 ${age}세가 명시 조건(${c.ageMin ?? ''}~${c.ageMax ?? ''}세)과 달라요`));
  else checks.push(mk('age', '나이', 'match', `입력한 나이 ${age}세가 명시 조건(${c.ageMin ?? ''}~${c.ageMax ?? ''}세) 범위예요`));

  // 거주지
  const userRes = typeof u.residence === 'string' && u.residence !== 'unknown' ? u.residence : null;
  if (!c?.residence) checks.push(regionCheck(r, userRes));
  else if (!userRes) checks.push(mk('residence', '거주지', 'check', '거주지를 입력하지 않아 비교하지 못했어요'));
  else {
    const need = regionOfText(c.residence) ?? c.residence;
    const have = regionOfText(userRes) ?? userRes;
    if (c.residence.includes('부울경') || need === have || userRes.includes(c.residence) || c.residence.includes(userRes)) {
      const bue = c.residence.includes('부울경') && regionOfText(userRes) === null;
      checks.push(bue ? mk('residence', '거주지', 'check', '입력한 거주지가 부울경에 속하는지 확인하지 못했어요') : mk('residence', '거주지', 'match', `입력한 거주지(${userRes})가 명시 조건(${c.residence})과 같아요`));
    } else if (regionOfText(userRes) && regionOfText(c.residence)) checks.push(mk('residence', '거주지', 'mismatch', `입력한 거주지(${userRes})가 명시 조건(${c.residence})과 달라요`));
    else checks.push(mk('residence', '거주지', 'check', '거주지 조건을 비교하지 못했어요'));
  }

  // 사업자 여부
  const biz = typeof u.hasBusiness === 'boolean' ? u.hasBusiness : null;
  if (!c?.business) checks.push(mk('business', '사업자 여부', 'check', biz === null ? '원문의 사업자 조건을 확인하지 못했어요' : `입력한 정보는 ${biz ? '사업자 있음' : '사업자 없음(예비창업자)'}이에요. 원문에 사업자 조건이 없어 공식 안내로 확인해 주세요`));
  else if (c.business === 'any') checks.push(mk('business', '사업자 여부', 'match', '사업자 여부와 상관없다고 명시돼 있어요'));
  else if (biz === null) checks.push(mk('business', '사업자 여부', 'check', '사업자 여부를 입력하지 않아 비교하지 못했어요'));
  else if ((c.business === 'pre') === biz) checks.push(mk('business', '사업자 여부', 'mismatch', c.business === 'pre' ? '예비창업자(사업자 없음) 대상이라고 명시돼 있어요' : '사업자 등록자 대상이라고 명시돼 있어요'));
  else checks.push(mk('business', '사업자 여부', 'match', c.business === 'pre' ? '예비창업자 대상 조건과 같아요' : '사업자 등록자 대상 조건과 같아요'));

  // 모집 기간 (한국 시간 기준 날짜)
  const today = kstDate(now);
  const pastEnd = r.endDate !== null && r.endDate < today;
  let closed = false;
  if (r.recruitStatus === 'closed') { closed = true; checks.push(mk('period', '모집 기간', 'mismatch', '모집이 종료됐어요')); }
  else if (pastEnd) { closed = true; checks.push(mk('period', '모집 기간', 'mismatch', `마감일(${r.endDate})이 지났어요`)); }
  else if (r.recruitStatus === 'open') {
    checks.push(mk('period', '모집 기간', 'match', r.endDate ? `모집 중이고 마감일은 ${r.endDate}예요` : '모집 중이에요'));
    if (r.endDate) notes.push(END_TIME_NOTE);
  } else if (r.recruitStatus === 'always') checks.push(mk('period', '모집 기간', 'match', '상시 안내로 명시돼 있어요'));
  else {
    checks.push(mk('period', '모집 기간', 'check', '모집 상태를 확인하지 못했어요'));
    if (r.endDate) notes.push(END_TIME_NOTE);
  }
  const status: ConditionStatus = checks.some((x) => x.status === 'mismatch') ? 'mismatch' : checks.some((x) => x.status === 'check') ? 'check' : 'match';
  return { status, checks, closed, notes };
}

// ---- F5 추천 ----
export const REGION_NOTHING = '조건에 맞는 검수된 경로가 아직 없어요. 아래 준비 안내를 먼저 해 보고, 공식 문의 경로를 확인해 보세요.';
const STAGE_GOAL: Record<ReadinessStage, string> = {
  no_idea: '관심 분야를 구체적인 문제로 좁히는 준비',
  has_idea: '생각해 둔 아이디어를 이용할 사람의 관점에서 확인하는 준비',
  preparing: '준비 중인 구상을 실제로 확인하고 다듬는 준비',
};
const WANT_CAPS: Record<ReadinessStage, string[]> = {
  no_idea: ['교육', '상담'],
  has_idea: ['상담', '교육'],
  preparing: ['시제품', '공간', '상담'],
};
const CAP_HELP: Record<string, string> = {
  교육: '기초 지식을 익히는 교육', 상담: '방향을 점검하는 상담', 공간: '작업·시험 공간 이용', 시제품: '시제품을 만들어 보는 일', 자금: '자금 지원 안내',
};

/** 사용자가 고른 방향의 글에서 원하는 도움의 종류를 읽는다 (키워드, 확정 아님). */
export function directionCaps(direction: string | null | undefined): string[] {
  const d = direction ?? '';
  const out: string[] = [];
  if (/시제품|제작|만들/.test(d)) out.push('시제품', '공간');
  if (/배우|교육|공부|익히/.test(d)) out.push('교육');
  if (/상담|조언|물어|점검/.test(d)) out.push('상담');
  return out;
}

export interface ExploreRecommendInput {
  readiness?: ReadinessStage;
  problemId?: string | null;
  direction?: string | null;
  reviewRegion?: string | null;
  conditions?: UserConditions;
  now: Date;
  resources?: Resource[];
  problems?: ProblemCard[];
  /** 관심 표시(하트)한 자료의 특징. 후보를 늘리지 않고, 같은 점수 묶음 안의 순서에만 쓴다. */
  likes?: LikeProfile | null;
  /**
   * Solar Decide 관련도 (자료 id → 0..1, 가장 높은 것이 1). 있으면 decideCandidates 후보 안에서 관련도 순으로 고른다.
   * 규칙은 후보 거르기(마감·명시 조건 불일치·단계)에만 쓴다. 관련도가 RELEVANCE_MIN 보다 낮으면 억지로 채우지 않는다.
   */
  relevance?: Record<string, number> | null;
}
export interface Recommended { resource: Resource; condition: ConditionResult; regionMatch: boolean; linked: boolean; capMatch: boolean }

const resourceRegionMatch = (r: Resource, region: string | null | undefined): boolean => {
  const reg = realRegion(region);
  return !!reg && r.regions.some((x) => x === reg || x === '부울경');
};

/** 이유 (규칙 문장): 구상의 어떤 준비를 돕는지. '이 지역이라서'로 쓰지 않는다. */
export function reasonFor(r: Resource, readiness: ReadinessStage | undefined, linked: boolean): string {
  const goal = readiness ? STAGE_GOAL[readiness] : '구상을 정리하는 준비';
  const caps = r.capabilityTags.map((t) => CAP_HELP[t]).filter(Boolean);
  const help = caps.length ? `${caps.join('·')}을(를) 안내하는 경로로 보여요` : '어떤 도움을 받을 수 있는지 공식 안내에서 확인해야 해요';
  return `${linked ? '선택한 문제와 연결된 경로예요. ' : ''}${goal}에 쓸 수 있어요. ${help}. 실제 운영 범위와 대상은 공식 안내로 확인해 주세요.`;
}

/** Decide 관련도가 가장 높은 후보 대비 이 비율보다 낮으면 추천하지 않는다. */
export const RELEVANCE_MIN = 0.2;
/** Decide 에 보낼 최대 후보 수 (cloudflare.ts DECIDE_MAX_CHOICES 와 같다). */
export const DECIDE_CANDIDATES_MAX = 26;

/**
 * 준비 단계로 받는 자료 단계. '아이디어 없음'은 실제 공고에 단계가 없어서(평가 2026-11-27) 예비창업자 대상(has_idea)도 받는다.
 */
const stagesFor = (readiness: ReadinessStage | undefined): ReadinessStage[] | null =>
  !readiness ? null : readiness === 'no_idea' ? ['no_idea', 'has_idea'] : [readiness];

/**
 * Decide 후보: 마감·명시 조건 불일치를 빼고, 단계가 맞는 자료를 규칙 점수(문제 연결·도움 종류·하트·지역) 순으로 최대 26건.
 * 도움 종류가 맞지 않아도 후보에는 넣는다 (Decide 가 사용자의 글을 읽고 고른다).
 */
export function decideCandidates(input: ExploreRecommendInput): Resource[] {
  const resources = input.resources ?? RESOURCES;
  const problems = input.problems ?? PROBLEMS;
  const linkedIds = new Set(problems.find((p) => p.id === input.problemId)?.resourceIds ?? []);
  const caps = new Set([...(input.readiness ? WANT_CAPS[input.readiness] : []), ...directionCaps(input.direction)]);
  const stages = stagesFor(input.readiness);
  const rows: { r: Resource; score: number }[] = [];
  for (const r of resources) {
    if (stages && !r.stages.some((s) => stages.includes(s))) continue;
    const c = checkConditions(r, input.conditions, input.now);
    if (c.closed || c.status === 'mismatch') continue;
    const score = (linkedIds.has(r.id) ? 2 : 0) + (r.capabilityTags.some((t) => caps.has(t)) ? 1 : 0) + 0.9 * likeSimilarity(r, input.likes)
      + (resourceRegionMatch(r, input.reviewRegion) ? 0.3 : 0);
    rows.push({ r, score });
  }
  rows.sort((a, b) => b.score - a.score || a.r.id.localeCompare(b.r.id));
  return rows.slice(0, DECIDE_CANDIDATES_MAX).map((x) => x.r);
}

/** Decide 질문 지시문 (운영·평가 공통). */
export const DECIDE_INSTRUCTIONS = '이 사람이 지금 준비 단계에서 가장 먼저 이용하면 도움이 될 지원을 고르세요. 사용자가 원하는 도움의 종류와 하고 싶은 일에 맞는지를 보고, 나이·거주지·사업자 여부 조건에 맞지 않는 것은 고르지 마세요.';

/** Decide 선택지 글: 유형·도움 종류·대상·제공 내용. 기관 이름은 넣지 않는다 (이름이 아니라 내용으로 고르게). */
export function decideChoiceText(r: Resource): string {
  return [`[${r.type}] ${r.title}`, r.capabilityTags.length ? `도움: ${r.capabilityTags.join('·')}` : '', r.target ? `대상: ${r.target}` : '', r.content].filter(Boolean).join(' / ');
}

export function recommendResources(input: ExploreRecommendInput): { items: Recommended[]; noMatchReason: string | null } {
  if (input.relevance && Object.keys(input.relevance).length) return recommendByRelevance(input, input.relevance);
  const resources = input.resources ?? RESOURCES;
  const problems = input.problems ?? PROBLEMS;
  const linkedIds = new Set(problems.find((p) => p.id === input.problemId)?.resourceIds ?? []);
  const caps = new Set([...(input.readiness ? WANT_CAPS[input.readiness] : []), ...directionCaps(input.direction)]);
  const rows: (Recommended & { fit: number })[] = [];
  const stages = stagesFor(input.readiness);
  for (const r of resources) {
    if (stages && !r.stages.some((s) => stages.includes(s))) continue;
    const condition = checkConditions(r, input.conditions, input.now);
    if (condition.closed || condition.status === 'mismatch') continue;
    const linked = linkedIds.has(r.id);
    const capMatch = r.capabilityTags.some((t) => caps.has(t));
    const base = (linked ? 2 : 0) + (capMatch ? 1 : 0);
    if (base === 0 && input.readiness) continue; // 억지로 채우지 않는다 (하트만으로는 후보가 되지 않음)
    // 하트 비슷함(0..1)은 0.9 배로 더해서 문제 연결(2)·도움 종류(1) 차이를 뒤집지 않는다.
    const fit = base + 0.9 * likeSimilarity(r, input.likes);
    rows.push({ resource: r, condition, regionMatch: resourceRegionMatch(r, input.reviewRegion), linked, capMatch, fit });
  }
  // 지역은 동등한 후보 사이의 순서에만 쓴다. 마감 임박 가산점 없음.
  rows.sort((a, b) => b.fit - a.fit || Number(b.regionMatch) - Number(a.regionMatch) || a.resource.id.localeCompare(b.resource.id));
  const items = rows.slice(0, 3).map(({ fit: _fit, ...x }) => x);
  return { items, noMatchReason: items.length ? null : REGION_NOTHING };
}

/** Decide 관련도로 고른다. 후보 밖 자료와 관련도가 낮은 자료는 넣지 않는다. 같은 관련도면 하트·지역 순. */
function recommendByRelevance(input: ExploreRecommendInput, rel: Record<string, number>): { items: Recommended[]; noMatchReason: string | null } {
  const problems = input.problems ?? PROBLEMS;
  const linkedIds = new Set(problems.find((p) => p.id === input.problemId)?.resourceIds ?? []);
  const caps = new Set([...(input.readiness ? WANT_CAPS[input.readiness] : []), ...directionCaps(input.direction)]);
  const rows = decideCandidates(input)
    .filter((r) => (rel[r.id] ?? 0) >= RELEVANCE_MIN)
    .map((r) => ({ r, p: rel[r.id]!, like: likeSimilarity(r, input.likes), regionMatch: resourceRegionMatch(r, input.reviewRegion) }))
    .sort((a, b) => b.p - a.p || b.like - a.like || Number(b.regionMatch) - Number(a.regionMatch) || a.r.id.localeCompare(b.r.id));
  const items = rows.slice(0, 3).map(({ r, regionMatch }) => ({
    resource: r, condition: checkConditions(r, input.conditions, input.now), regionMatch,
    linked: linkedIds.has(r.id), capMatch: r.capabilityTags.some((t) => caps.has(t)),
  }));
  return { items, noMatchReason: items.length ? null : REGION_NOTHING };
}

// ---- F3 요약 v2 ----
export const item = (text: string | null | undefined, provenance: SummaryItem['provenance'] = 'user'): SummaryItem => {
  const t = (text ?? '').trim();
  return t ? { text: t, provenance } : { text: UNDECIDED_TEXT, provenance: 'unknown' };
};

export interface ChatAnswer { key: string; text: string | null; how: 'answered' | 'unknown' | 'skipped' }
/** AI 가 채운 칸. 있는 칸만, 사용자가 말하지 않은 칸에만 쓴다. 출처 'ai' 는 여기서 코드가 붙인다. */
export interface AiFill { target?: string; value?: string; hypotheses?: string }

export interface SummaryInput {
  start: Partial<StartProfile>;
  exploration: Exploration | null;
  answers: ChatAnswer[];
  problems?: ProblemCard[];
  aiFill?: AiFill;
}

export const problemOf = (id: string | null | undefined, problems: ProblemCard[] = PROBLEMS) => (id ? problems.find((p) => p.id === id) : undefined);
const answerOf = (answers: ChatAnswer[], key: string) => answers.find((a) => a.key === key && a.how === 'answered' && a.text?.trim())?.text?.trim() ?? null;

export function buildSummary(input: SummaryInput): SummaryV2 {
  const { start, exploration: ex, answers } = input;
  const problem = problemOf(ex?.problemId, input.problems);
  const ai = input.aiFill ?? {};
  const aiOr = (user: string | null, aiText: string | undefined): SummaryItem => (user ? item(user) : aiText?.trim() ? item(aiText, 'ai') : item(null));

  const interestWords = [...(start.interests ?? []).filter((x) => !INTEREST_EXTRA.includes(x as never)), start.interestNote?.trim() ?? ''].filter(Boolean).join(', ');
  const interest = item([start.idea?.trim(), interestWords && `관심: ${interestWords}`].filter(Boolean).join(' / '));

  const target = aiOr(answerOf(answers, 'target'), ai.target);
  const reasonText = ex?.selectionReason?.trim() || answerOf(answers, 'reason') || answerOf(answers, 'trigger');
  // 값 칸: 사용자가 말한 방향·직접 쓴 문제·고른 문제 카드(사용자의 선택)만 사용자 출처로 쓴다.
  const pickedProblem = problem ? `선택한 문제: ${problem.title}` : ex?.origin === 'custom' ? ex.customProblem : null;
  const valueFinal = aiOr(answerOf(answers, 'direction') ?? pickedProblem ?? null, ai.value);

  const unknownLabels: string[] = [];
  if (target.provenance !== 'user') unknownLabels.push('도움을 주고 싶은 대상');
  if (valueFinal.provenance !== 'user') unknownLabels.push('해결해보고 싶은 불편·제공할 가치');
  if (!ex?.direction) unknownLabels.push('접근 방향');
  const unknownText = [...unknownLabels, ...(problem?.unknowns ?? [])].join(', ');

  let prob: SummaryV2['exploration']['problem'] = null;
  if (problem) prob = { title: problem.title, source: problem.sourceRef ?? problem.sourceType, evidenceLevel: problem.evidenceLevel };
  else if (ex?.origin === 'custom' && ex.customProblem?.trim()) prob = { title: ex.customProblem.trim(), source: null, evidenceLevel: '사용자 작성·외부 검증 전' };

  const direction = ex?.direction?.trim();
  const dirStatus = ex?.directionStatus ?? 'hold';
  const dirItem: SummaryV2['exploration']['direction'] = direction
    ? { text: direction, provenance: dirStatus === 'ai_suggested' ? 'ai' : 'user', status: dirStatus }
    : { text: '아직 탐색 중', provenance: 'unknown', status: 'hold' };

  const ruleHypo = problem
    ? `${problem.affectedUser}에게 "${problem.situation}"가 지금도 있는지, 지금은 어떻게 해결하는지 직접 물어봐서 확인해야 해요.`
    : null;
  const hypotheses: SummaryItem = ai.hypotheses?.trim() ? item(ai.hypotheses, 'ai') : ruleHypo ? item(ruleHypo, 'ai') : item(null);

  return {
    interest,
    target,
    value: valueFinal,
    unknowns: unknownText ? { text: unknownText, provenance: 'unknown' } : { text: '표시된 미확인 사항이 없어요. 그래도 실제 이용자에게 확인해야 해요.', provenance: 'unknown' },
    exploration: { problem: prob, reason: item(reasonText), direction: dirItem, hypotheses },
  };
}

/** 사용자 수정: 글이 바뀐 칸은 provenance 'user'(직접 입력), 비우면 미정. 검증된 사실이 되는 것은 아니다. */
export type SummaryEdit = Partial<{
  interest: { text: string }; target: { text: string }; value: { text: string }; unknowns: { text: string };
  exploration: Partial<{ reason: { text: string }; direction: { text: string }; hypotheses: { text: string } }>;
}>;

export function applySummaryEdit(base: SummaryV2, edit: SummaryEdit): { summary: SummaryV2; changed: boolean } {
  let changed = false;
  const upd = (cur: SummaryItem, e?: { text: string }): SummaryItem => {
    if (!e || typeof e.text !== 'string' || e.text.trim() === cur.text.trim()) return cur;
    changed = true;
    return item(e.text);
  };
  const ex = base.exploration;
  const dirEdit = edit.exploration?.direction;
  const dir = upd(ex.direction, dirEdit);
  const direction: SummaryV2['exploration']['direction'] = dir === ex.direction ? ex.direction
    : dir.provenance === 'unknown' ? { text: '아직 탐색 중', provenance: 'unknown', status: 'hold' } : { ...dir, status: 'user' };
  const summary: SummaryV2 = {
    interest: upd(base.interest, edit.interest),
    target: upd(base.target, edit.target),
    value: upd(base.value, edit.value),
    unknowns: upd(base.unknowns, edit.unknowns),
    exploration: { ...ex, reason: upd(ex.reason, edit.exploration?.reason), direction, hypotheses: upd(ex.hypotheses, edit.exploration?.hypotheses) },
  };
  return { summary, changed };
}

// ---- 지역 검토 카드 ----
export interface RegionalInput {
  start: Partial<StartProfile>;
  exploration: Exploration | null;
  now: Date;
  contexts?: RegionalContext[];
  resources?: Resource[];
  problems?: ProblemCard[];
  aiHypothesis?: string;
}

/** 검토 지역이 없거나 '미정'이면 null. 근거 id 는 실제 자료에서만 가져온다. */
export function buildRegional(input: RegionalInput): { card: RegionalContextCard; contexts: RegionalContext[] } | null {
  const region = realRegion(input.start.reviewRegion);
  if (!region) return null;
  const problem = problemOf(input.exploration?.problemId, input.problems);
  const industries = [...new Set([...industriesOf(input.start.interests), ...(problem?.industryTags ?? [])])];
  const contexts = (input.contexts ?? CONTEXTS).filter((c) => regionFits(c.region, region) && industries.includes(c.industry));
  const ctxIds = new Set(contexts.map((c) => c.id));
  const resourceIds = (input.resources ?? RESOURCES)
    .filter((r) => r.regions.some((x) => x === region || x === '부울경') && (r.contextIds.some((id) => ctxIds.has(id)) || (problem?.resourceIds ?? []).includes(r.id)) && !checkConditions(r, undefined, input.now).closed)
    .map((r) => r.id);

  // '검토할 근거 있음'은 공식 URL·확인일이 있는 검수 자료가 있을 때만. 테스트 자료는 '추가 확인 필요'.
  const verified = contexts.filter((c) => !c.test && !!c.url && !!c.checkedAt);
  const status: RegionalStatus = verified.length > 0 && resourceIds.length > 0 ? 'has_basis' : industries.length === 0 ? 'weak' : 'needs_check';
  const want = industries.length ? industries.join('·') : '아직 고르지 않은 분야';
  let basis: string;
  if (contexts.length) {
    basis = `[확인된 배경] ${contexts.map((c) => c.background).join(' ')} [내 관심과의 연결] ${want}에 관심이 있어 ${region}에서 살펴볼 수 있어요. 산업 배경은 창업 수요나 계약 가능성의 근거가 아니에요.${resourceIds.length ? '' : ' 이용할 수 있는 지원 경로는 아직 확인하지 못했어요.'}`;
  } else if (industries.length === 0) {
    basis = `${region}과 연결할 관심 분야가 아직 없어서 지역과의 연관성을 판단하기 어려워요. 구상은 바꾸지 않고 그대로 두었어요.`;
  } else {
    basis = `${region}의 ${want} 분야에 대해 검수된 배경 자료가 아직 없어요. 지역 배경과 지원 경로는 확인이 필요해요.`;
  }
  const hypo = input.aiHypothesis?.trim()
    ? item(input.aiHypothesis, 'ai')
    : problem
      ? item(`${problem.affectedUser}가 ${region}에서도 같은 어려움을 겪는지 직접 물어보고 확인해야 해요. (미검증)`, 'ai')
      : item(null);
  return { card: { region, basis, sourceIds: [...ctxIds], customerHypothesis: hypo, resourceIds, status }, contexts };
}

// ---- F12 준비 안내 ----
export interface PrepDraft extends Omit<PrepItem, 'done'> {}
const P = (id: string, title: string, why: string, how: string, output: string, resourceId?: string): PrepDraft => ({
  id, title, why, how, output, source: 'rule', ...(resourceId ? { resourceId } : {}),
});

/** 기관 문의 준비: 실제 경로가 있을 때만. 상담 예약·응답을 약속하지 않는다. */
function contactPrep(r: Resource, readiness: ReadinessStage | undefined): PrepDraft {
  const edu = r.capabilityTags.includes('교육');
  return P(
    `prep-contact-${r.id}`,
    edu ? `${r.agency}의 ${r.type} 안내 살펴보기` : `${r.agency}에 문의할 내용 한 장 정리하기`,
    '공식 안내를 보고 대상과 운영 범위를 알면, 나에게 맞는지 스스로 가늠할 수 있어요.',
    `공식 안내${r.url ? `(${r.url})` : ''}에서 대상·절차를 읽고, ${readiness === 'preparing' ? '준비한 내용' : '지금까지 정리한 내용'}과 궁금한 점을 적어 가요. 이용 가능 여부와 응답은 기관이 정해요.`,
    '문의 전 메모 (궁금한 점 3개)', r.id,
  );
}

const byCap = (rs: Resource[], cap: string) => rs.find((r) => r.capabilityTags.includes(cap) && !checkConditions(r, undefined, new Date(0)).closed);

export function buildPrep(
  readiness: ReadinessStage | undefined, summary: SummaryV2 | null, exploration: Exploration | null, resources: Resource[],
  problems: ProblemCard[] = PROBLEMS,
): { primary: PrepDraft; followUps: PrepDraft[] } {
  const stage: ReadinessStage = readiness ?? 'no_idea';
  const targetKnown = !!summary && summary.target.provenance === 'user';
  const problem = problemOf(exploration?.problemId, problems);
  const userDirection = exploration?.directionStatus === 'user_selected' || exploration?.directionStatus === 'user' ? exploration.direction : null;
  const list: PrepDraft[] = [];

  if (!targetKnown) {
    const how: Record<ReadinessStage, string> = {
      no_idea: '관심 있는 분야에서 불편해 보였던 장면 하나를 떠올리고, 그 장면에 있던 사람이 누구인지, 언제 어떤 일을 겪는지 세 줄로 적어요.',
      has_idea: '아이디어를 쓸 것 같은 사람 한 명을 정하고, 그 사람이 하루 중 언제 이 문제를 겪는지 세 줄로 적어요.',
      preparing: '지금 준비한 내용이 맞는 사람이 누구인지 한 문장으로 쓰고, 그 사람을 직접 본 적이 있는지 구분해서 적어요.',
    };
    list.push(P('prep-target', '이용할 사람의 상황 구체화', '대상이 아직 정해지지 않았어요. 누가 언제 불편한지 알아야 다음 준비를 고를 수 있어요.', how[stage], '대상·상황 메모 3줄 (아직 모르는 것은 미정으로 표시)'));
  } else if (userDirection) {
    list.push(P('prep-direction', '선택한 방향의 가설 확인하기', `직접 고른 방향("${userDirection}")이 맞는지는 아직 확인되지 않았어요.`, '이 방향이 맞다면 이용할 사람이 무엇을 말할지 가설 한 줄과, 그것을 확인할 질문 3개를 적어요.', '가설 1줄 + 확인 질문 3개'));
  } else {
    const how: Record<ReadinessStage, [string, string, string]> = {
      no_idea: ['prep-problem', '문제가 생기는 상황 알아보기', '해결책은 정하지 않고, 선택한 문제가 누구에게 어떤 상황에서 생기는지부터 알아봐요.'],
      has_idea: ['prep-idea-check', '아이디어를 이용할 사람 눈으로 점검하기', '생각해 둔 아이디어가 실제 상황과 맞는지 질문으로 확인할 차례예요.'],
      preparing: ['prep-assumptions', '준비한 내용 중 가정 표시하기', '준비한 내용 중 직접 확인한 것과 가정을 구분하면 남은 준비가 보여요.'],
    };
    const [id, title, why] = how[stage];
    list.push(P(id, title, why, stage === 'preparing' ? '준비한 내용을 한 장으로 쓰고, 확인한 것에는 근거를, 가정에는 표시를 붙여요.' : '이용할 사람에게 물어볼 질문을 3개 만들고, 가능하면 한 사람에게 물어봐요.', '질문 3개 + 들은 내용 메모'));
  }

  if (problem && stage !== 'preparing') list.push(P('prep-unknowns', '문제 카드의 미확인 사항 확인하기', '선택한 문제 자료에는 아직 확인되지 않은 부분이 남아 있어요.', `자료에 적힌 미확인 사항(${problem.unknowns.slice(0, 3).join(' / ') || '없음'})을 현장 사람에게 하나씩 물어봐요.`, '미확인 사항별 확인 결과 (확인 못 한 것은 미확인으로 유지)'));
  if (stage === 'preparing') list.push(P('prep-interview', '이용할 사람에게 확인할 질문 정리', '준비 중인 구상도 실제 이용할 사람의 이야기로 한 번 확인해야 해요.', '이용할 사람 2~3명에게 물어볼 질문을 쓰고 대화 후 들은 말을 그대로 적어요.', '질문 목록 + 들은 말 기록'));
  if (stage === 'has_idea') list.push(P('prep-oneline', '아이디어 한 줄과 모르는 것 적기', '한 줄로 쓰면 아직 모르는 부분이 눈에 보여요.', '"누구의 어떤 불편을 어떻게 돕고 싶다" 한 줄과, 모르는 것 3개를 적어요.', '한 줄 정리 + 모르는 것 목록'));
  if (stage === 'no_idea') list.push(P('prep-interest-scan', '관심 분야에서 본 불편 적어 보기', '관심은 있어도 문제를 아직 못 정했다면 본 것을 적어 두면 길이 보여요.', '관심 분야에서 직접 보거나 들은 불편을 세 가지 적어요. 없으면 없다고 적어도 돼요.', '불편 목록 (0~3개)'));

  const first = stage === 'preparing' ? byCap(resources, '공간') ?? byCap(resources, '상담') : stage === 'no_idea' ? byCap(resources, '교육') ?? byCap(resources, '상담') : byCap(resources, '상담') ?? byCap(resources, '교육');
  if (first) list.push(contactPrep(first, readiness));

  const seen = new Set<string>();
  const uniq = list.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
  return { primary: uniq[0]!, followUps: uniq.slice(1, 3) };
}

// ---- 자료 범위 안내 ----
export function coverageByRegion(problems = PROBLEMS, resources = RESOURCES, contexts = CONTEXTS): Record<string, { problems: number; resources: number; contexts: number }> {
  const out: Record<string, { problems: number; resources: number; contexts: number }> = {};
  for (const reg of REVIEW_REGIONS.filter((r) => r !== '미정')) {
    out[reg] = {
      problems: problems.filter((p) => p.region === reg || p.region === '부울경').length,
      resources: resources.filter((r) => r.regions.some((x) => x === reg || x === '부울경')).length,
      contexts: contexts.filter((c) => c.region === reg || c.region === '부울경').length,
    };
  }
  return out;
}

export function coverageNote(reviewRegion?: string | null, problems = PROBLEMS, resources = RESOURCES, contexts = CONTEXTS): string {
  const cov = coverageByRegion(problems, resources, contexts);
  const have = Object.entries(cov).filter(([, v]) => v.problems + v.resources + v.contexts > 0).map(([k, v]) => `${k}(문제 ${v.problems}·경로 ${v.resources}·배경 ${v.contexts})`);
  const none = Object.entries(cov).filter(([, v]) => v.problems + v.resources + v.contexts === 0).map(([k]) => k);
  const nation = resources.filter((r) => r.regions.includes('전국')).length;
  const test = [...problems, ...resources, ...contexts].some((x) => x.test);
  const reg = realRegion(reviewRegion);
  const parts = [
    `현재 검수 자료가 있는 지역: ${have.join(', ') || '없음'}.`,
    none.length ? `${none.join('·')}은(는) 아직 자료가 없어요.` : '',
    nation ? `전국 대상 경로 ${nation}개도 있어요.` : '',
    reg && none.includes(reg) ? `검토 지역으로 고른 ${reg}은(는) 자료가 없어서 지역 안내는 확인이 필요해요.` : '',
    test ? '일부 자료는 팀 검수 전 테스트 자료예요.' : '',
  ];
  return parts.filter(Boolean).join(' ');
}

// ---- F12 선택 보완: 현장에 확인할 질문 (P1) ----
export const FIELD_QUESTION_MAX = 3;
/** 어려움·구매 의향을 전제하는 말. 질문(규칙·AI 모두)에 있으면 쓰지 않는다. */
export const FIELD_PRESUPPOSE = /불편|어려움|어렵|힘들|돈을\s*내|구매|결제|지불|사\s*주|살\s*의향|쓸\s*의향/;

const FIELD_TITLE_PREFIX = /^\[[^\]]*\]\s*/;

/**
 * 현장 사람에게 물어볼 질문 최대 3개 (규칙). 현재 방식과 실제 경험을 먼저 묻고, 어려움·구매 의향은 전제하지 않는다.
 * 응답자·답변·검증 결과는 만들지 않는다. 문제가 바뀌면 호출한 쪽이 다시 만든다.
 */
export function buildFieldQuestions(
  problem: ProblemCard | undefined | null, exploration: Exploration | null, summary: SummaryV2 | null, unknowns: readonly string[] = [],
): FieldQuestion[] {
  const who = problem?.affectedUser ?? '이용할 사람';
  const custom = !problem && exploration?.origin === 'custom' ? exploration.customProblem?.trim() ?? '' : '';
  const topic = problem ? problem.title.replace(FIELD_TITLE_PREFIX, '') : custom.length > 0 && custom.length <= 40 ? custom : '';
  const hypo = summary && summary.exploration.hypotheses.provenance !== 'unknown' ? summary.exploration.hypotheses.text.trim() : '';
  const unknownText = unknowns.join(' ');

  const current: FieldQuestion = {
    id: 'fq-current',
    question: topic ? `${topic} 업무는 현재 어떤 방식으로 처리하나요?` : '이 업무는 현재 어떤 방식으로 처리하나요?',
    purpose: `${who}의 현재 처리 방식을 먼저 확인해요.${hypo ? ` 확인할 가설(미검증): ${hypo.slice(0, 80)}` : ''}`,
    source: 'rule',
  };
  const tools: FieldQuestion = {
    id: 'fq-tools',
    question: '이 일에 지금 쓰는 도구나 서비스가 있다면 무엇이고, 어떻게 쓰나요?',
    purpose: `${who}가 이미 쓰는 방법이 있는지 확인해요. (미확인 사항: ${unknowns.find((u) => /서비스|도구|대안/.test(u)) ?? '이미 쓰는 서비스'})`,
    source: 'rule',
  };
  const time: FieldQuestion = {
    id: 'fq-time',
    question: '어느 단계에서 시간이 많이 드나요?',
    purpose: `${who}가 실제로 겪는 과정을 단계별로 듣고, 시간이 드는 단계가 정말 있는지 확인해요.`,
    source: 'rule',
  };
  const conditions: FieldQuestion = {
    id: 'fq-conditions',
    question: '외부 서비스를 검토하기 전에 어떤 조건을 확인하나요?',
    purpose: `${who}가 새로운 방법을 검토할 때 보는 기준을 알아봐요. 이용 의향을 묻는 것이 아니에요.`,
    source: 'rule',
  };
  const list = [current];
  if (/서비스|도구|대안/.test(unknownText)) list.push(tools);
  list.push(time, conditions);
  return list.slice(0, FIELD_QUESTION_MAX);
}
