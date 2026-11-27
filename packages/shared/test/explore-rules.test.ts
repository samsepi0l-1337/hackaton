import { describe, expect, test } from 'bun:test';
import {
  applySummaryEdit, buildFieldQuestions, FIELD_PRESUPPOSE, buildPrep, buildRegional, buildSummary, checkConditions, coverageNote, problemsFor, recommendResources, validateStart,
  type Exploration, type ProblemCard, type RegionalContext, type Resource,
} from '../src';

const NOW = new Date('2026-11-27T01:00:00Z'); // KST 2026-11-27 10:00
const res = (o: Partial<Resource> = {}): Resource => ({
  id: 'r', type: '상담', title: 't', agency: 'a', url: null, target: null, stages: ['no_idea', 'has_idea', 'preparing'], content: 'c', procedure: null, prep: null,
  regions: ['부산'], affiliationLimit: null, costPeriod: null, recruitStatus: 'unknown', endDate: null, checkedAt: null, sourceExcerpt: null,
  industryTags: [], capabilityTags: ['상담'], contextIds: [], conditions: null, test: true, ...o,
});
const ex = (o: Partial<Exploration> = {}): Exploration => ({ problemId: null, origin: 'hold', customProblem: null, selectionReason: null, direction: null, directionStatus: 'hold', dataVersion: 'v', suggestions: [], ...o });
const status = (r: Resource, u = {}, now = NOW) => checkConditions(r, u, now);
const period = (r: Resource, now = NOW) => status(r, {}, now).checks.find((c) => c.key === 'period')!;

describe('F1 최소 검증', () => {
  test('준비 상태만 필수, 나머지는 상태별 최소 입력', () => {
    expect(validateStart({}).map((e) => e.field)).toEqual(['readiness']);
    expect(validateStart({ readiness: 'no_idea' }).map((e) => e.field)).toEqual(['interests']);
    expect(validateStart({ readiness: 'no_idea', interestNote: '배달' })).toEqual([]);
    expect(validateStart({ readiness: 'has_idea' }).map((e) => e.field)).toEqual(['idea']);
    expect(validateStart({ readiness: 'preparing', interests: ['AI'] })).toEqual([]);
    expect(validateStart({ readiness: 'has_idea', idea: 'x'.repeat(200) })).toEqual([]);
    expect(validateStart({ readiness: 'has_idea', idea: 'x'.repeat(201) }).map((e) => e.field)).toEqual(['idea']);
  });
});

describe('F21 문제 카드', () => {
  test('조선·해양은 최대 3개, 자동차는 비어 있고 이유가 있다', () => {
    expect(problemsFor(['조선·해양'], '부산').items.length).toBe(3);
    const none = problemsFor(['자동차'], '부산');
    expect(none.items).toEqual([]);
    expect(none.emptyReason).toBeTruthy();
    expect(problemsFor(['아직 모름'], '부산').items).toEqual([]);
    expect(problemsFor([], null).emptyReason).toBeTruthy();
  });
  test("지역: 다른 지역은 제외, '부울경' 카드는 모두와 맞는다", () => {
    expect(problemsFor(['조선·해양'], '울산').items).toEqual([]);
    expect(problemsFor(['조선·해양'], '미정').items.length).toBe(3);
    const all = { ...(problemsFor(['조선·해양']).items[0] as ProblemCard), id: 'x', region: '부울경' as const };
    for (const r of ['부산', '울산', '경남']) expect(problemsFor(['조선·해양'], r, [all]).items.length).toBe(1);
    expect(problemsFor(['조선·해양', 'AI'], '부산', Array.from({ length: 5 }, (_, i) => ({ ...all, id: `p${i}`, region: '부산' as const }))).items.length).toBe(3);
  });
});

describe('F4 조건 대조', () => {
  test('나이 경계: 상한·하한 포함, 넘으면 불일치', () => {
    const r = res({ conditions: { ageMin: 19, ageMax: 39 } });
    const age = (n: number) => status(r, { age: n }).checks.find((c) => c.key === 'age')!.status;
    expect([age(18), age(19), age(39), age(40)]).toEqual(['mismatch', 'match', 'match', 'mismatch']);
    expect(status(r, { age: 'unknown' }).checks.find((c) => c.key === 'age')!.status).toBe('check');
    expect(status(r, {}).checks.find((c) => c.key === 'age')!.status).toBe('check');
  });
  test('원문 조건이 없으면 부합으로 확정하지 않는다', () => {
    const s = status(res({ conditions: null }), { age: 25, residence: '해운대구', hasBusiness: false });
    expect(s.status).toBe('check');
    expect(s.checks.filter((c) => c.key !== 'period').every((c) => c.status === 'check')).toBe(true);
  });
  test('거주지·사업자', () => {
    const r = res({ conditions: { residence: '부산', business: 'pre' }, recruitStatus: 'always' });
    const get = (u: object, k: string) => status(r, u).checks.find((c) => c.key === k)!.status;
    expect(get({ residence: '해운대구' }, 'residence')).toBe('match');
    expect(get({ residence: '울산 남구' }, 'residence')).toBe('mismatch');
    expect(get({ residence: 'unknown' }, 'residence')).toBe('check');
    expect(get({ hasBusiness: false }, 'business')).toBe('match');
    expect(get({ hasBusiness: true }, 'business')).toBe('mismatch');
    expect(get({}, 'business')).toBe('check');
    expect(status(r, { residence: '부산', hasBusiness: false }).status).toBe('check'); // 나이 조건 원문이 없어 확인 필요
  });
  test('종료·마감일 지남은 불일치(현재 모집 아님), 한국 시간 날짜로 판단', () => {
    expect(period(res({ recruitStatus: 'closed' })).status).toBe('mismatch');
    expect(status(res({ recruitStatus: 'closed' })).closed).toBe(true);
    expect(period(res({ recruitStatus: 'open', endDate: '2026-11-26' })).status).toBe('mismatch');
    expect(period(res({ recruitStatus: 'unknown', endDate: '2026-11-26' })).status).toBe('mismatch');
    expect(status(res({ recruitStatus: 'open', endDate: '2026-11-27' })).closed).toBe(false); // 마감 당일은 아직
    const lateUtc = new Date('2026-11-27T15:30:00Z'); // KST 11-28 00:30
    expect(status(res({ recruitStatus: 'open', endDate: '2026-11-27' }), {}, lateUtc).closed).toBe(true);
  });
  test('모집 상태 unknown 은 확인 필요, always 는 명시 때만 상시, 마감일만 있으면 시각 안내', () => {
    expect(period(res({ recruitStatus: 'unknown' })).status).toBe('check');
    expect(period(res({ recruitStatus: 'always' })).status).toBe('match');
    expect(status(res({ recruitStatus: 'open', endDate: '2026-12-01' })).notes).toContain('정확한 종료 시각 확인 필요');
    expect(status(res({ recruitStatus: 'unknown', endDate: '2026-12-01' })).notes).toContain('정확한 종료 시각 확인 필요');
    expect(status(res({ recruitStatus: 'always' })).notes).toEqual([]);
  });
});

describe('F5 추천', () => {
  const base = { now: NOW, readiness: 'no_idea' as const };
  test('종료·명시 불일치는 제외, 단계가 다른 자료도 제외', () => {
    const rs = [res({ id: 'a' }), res({ id: 'closed', recruitStatus: 'closed' }), res({ id: 'old', endDate: '2026-01-01' }),
      res({ id: 'age', conditions: { ageMax: 30 } }), res({ id: 'stage', stages: ['preparing'] })];
    const out = recommendResources({ ...base, resources: rs, conditions: { age: 35 } });
    expect(out.items.map((x) => x.resource.id)).toEqual(['a']);
  });
  test('억지로 채우지 않는다: 맞는 것이 없으면 noMatchReason', () => {
    const out = recommendResources({ ...base, resources: [res({ id: 'x', capabilityTags: ['자금'] })] });
    expect(out.items).toEqual([]);
    expect(out.noMatchReason).toBeTruthy();
    expect(recommendResources({ ...base, resources: [res({ id: 'a' }), res({ id: 'b' })] }).items.length).toBe(2);
    expect(recommendResources({ ...base, resources: Array.from({ length: 6 }, (_, i) => res({ id: `r${i}` })) }).items.length).toBe(3);
  });
  test('지역은 동등한 후보 사이의 순서에만 쓰이고, 더 잘 맞는 자료를 밀어내지 않는다', () => {
    const near = res({ id: 'a-near', regions: ['울산'] });
    const far = res({ id: 'b-far', regions: ['부산'] });
    // 동등: 울산 검토자는 울산 경로가 먼저 (id 순서와 반대)
    expect(recommendResources({ ...base, reviewRegion: '울산', resources: [far, near] }).items.map((x) => x.resource.id)).toEqual(['a-near', 'b-far']);
    expect(recommendResources({ ...base, reviewRegion: '부산', resources: [far, near] }).items.map((x) => x.resource.id)).toEqual(['b-far', 'a-near']);
    // 지역이 맞지 않아도 제외하지 않는다. 더 잘 맞는(연결된) 자료가 지역 일치 자료보다 앞선다.
    const problem = { id: 'p', resourceIds: ['b-far'] } as ProblemCard;
    const out = recommendResources({ ...base, reviewRegion: '울산', problemId: 'p', problems: [problem], resources: [near, far] });
    expect(out.items.map((x) => x.resource.id)).toEqual(['b-far', 'a-near']);
    expect(out.items[0]!.regionMatch).toBe(false);
  });
  test('마감 임박은 가산점이 아니다', () => {
    const soon = res({ id: 'z-soon', recruitStatus: 'open', endDate: '2026-11-28' });
    const later = res({ id: 'a-later', recruitStatus: 'open', endDate: '2027-03-01' });
    expect(recommendResources({ ...base, resources: [soon, later] }).items.map((x) => x.resource.id)).toEqual(['a-later', 'z-soon']);
  });
  test('방향 글의 키워드가 원하는 도움에 반영된다', () => {
    const proto = res({ id: 'proto', capabilityTags: ['시제품', '공간'], stages: ['has_idea'] });
    expect(recommendResources({ ...base, readiness: 'has_idea', resources: [proto] }).items).toEqual([]);
    expect(recommendResources({ ...base, readiness: 'has_idea', direction: '시제품을 먼저 만들어 보고 싶어요', resources: [proto] }).items.length).toBe(1);
  });
});

describe('F12 준비 안내', () => {
  const sumOf = (target?: string) => buildSummary({ start: { readiness: 'has_idea', idea: '빵집' }, exploration: null, answers: target ? [{ key: 'target', text: target, how: 'answered' }] : [] });
  const BAN = /사업자\s*등록|지원금\s*신청|자금|투자|공고\s*신청|창업\s*자금/;
  const text = (p: ReturnType<typeof buildPrep>) => JSON.stringify([p.primary, ...p.followUps]);
  test('대상이 미정이면 이용할 사람의 상황 구체화가 우선', () => {
    for (const st of ['no_idea', 'has_idea', 'preparing'] as const) expect(buildPrep(st, sumOf(), null, []).primary.title).toBe('이용할 사람의 상황 구체화');
  });
  test('준비 상태가 다르면 같은 계획을 주지 않는다', () => {
    for (const t of [undefined, '직장인']) {
      const s = sumOf(t);
      const plans = (['no_idea', 'has_idea', 'preparing'] as const).map((st) => text(buildPrep(st, s, null, [])));
      expect(new Set(plans).size).toBe(3);
    }
  });
  test('후속은 최대 2개이고 돈·사업자등록·신청을 기본 단계로 권하지 않는다', () => {
    const rs = [res({ id: 'edu', capabilityTags: ['교육'] }), res({ id: 'sp', capabilityTags: ['공간', '시제품'] }), res({ id: 'g', capabilityTags: ['자금'] })];
    for (const st of ['no_idea', 'has_idea', 'preparing'] as const) for (const t of [undefined, '직장인']) {
      const p = buildPrep(st, sumOf(t), null, rs);
      expect(p.followUps.length).toBeLessThanOrEqual(2);
      expect(text(p)).not.toMatch(BAN);
      for (const it of [p.primary, ...p.followUps]) expect([it.title, it.why, it.how, it.output].every(Boolean)).toBe(true);
    }
  });
  test('기관 문의는 실제 경로가 있을 때만 연결하고 응답을 약속하지 않는다', () => {
    const none = buildPrep('has_idea', sumOf('직장인'), null, []);
    expect([none.primary, ...none.followUps].some((x) => x.resourceId)).toBe(false);
    const p = buildPrep('has_idea', sumOf('직장인'), null, [res({ id: 'c1' })]);
    const link = [p.primary, ...p.followUps].find((x) => x.resourceId);
    expect(link?.resourceId).toBe('c1');
    expect(JSON.stringify(link)).toContain('기관이 정해요');
  });
  test('사용자가 고른 방향이 있으면 그 방향의 가설 확인을 안내한다', () => {
    const p = buildPrep('has_idea', sumOf('직장인'), ex({ direction: '시제품 먼저', directionStatus: 'user_selected' }), []);
    expect(p.primary.id).toBe('prep-direction');
    const ai = buildPrep('has_idea', sumOf('직장인'), ex({ direction: 'AI 제안', directionStatus: 'ai_suggested' }), []);
    expect(ai.primary.id).not.toBe('prep-direction');
  });
});

describe('F3 요약 v2', () => {
  test('사용자 글은 그대로, 말하지 않은 칸은 미정, AI 칸은 ai 출처를 코드가 붙인다', () => {
    const s = buildSummary({ start: { readiness: 'has_idea', idea: '  동네 빵집 재고 알림  ' }, exploration: null, answers: [{ key: 'target', text: null, how: 'unknown' }], aiFill: { target: '근처 직장인일 수 있어요', value: '남는 빵 문제' } });
    expect(s.interest).toEqual({ text: '동네 빵집 재고 알림', provenance: 'user' });
    expect(s.target).toEqual({ text: '근처 직장인일 수 있어요', provenance: 'ai' });
    expect(s.exploration.direction).toEqual({ text: '아직 탐색 중', provenance: 'unknown', status: 'hold' });
    const plain = buildSummary({ start: { readiness: 'no_idea', interests: ['아직 모름'] }, exploration: null, answers: [] });
    expect(plain.interest.provenance).toBe('unknown');
    expect(plain.target).toEqual({ text: '미정', provenance: 'unknown' });
  });
  test('사용자가 답한 칸은 AI 가 덮지 않는다', () => {
    const s = buildSummary({ start: { readiness: 'has_idea', idea: 'a' }, exploration: null, answers: [{ key: 'target', text: '학생', how: 'answered' }], aiFill: { target: '직장인' } });
    expect(s.target).toEqual({ text: '학생', provenance: 'user' });
  });
  test('수정한 칸만 user 가 되고, 비우면 미정', () => {
    const base = buildSummary({ start: { readiness: 'has_idea', idea: 'a' }, exploration: null, answers: [], aiFill: { target: '직장인' } });
    const r = applySummaryEdit(base, { target: { text: '학생' }, interest: { text: 'a' }, value: { text: '' } });
    expect(r.changed).toBe(true);
    expect(r.summary.target).toEqual({ text: '학생', provenance: 'user' });
    expect(r.summary.interest.provenance).toBe('user');
    expect(applySummaryEdit(base, { interest: { text: 'a' } }).changed).toBe(false);
  });
  test('직접 입력 문제는 외부 검증 전으로 표시한다', () => {
    const s = buildSummary({ start: { readiness: 'no_idea', interests: ['AI'] }, exploration: ex({ origin: 'custom', customProblem: '주차 혼잡' }), answers: [] });
    expect(s.exploration.problem?.evidenceLevel).toBe('사용자 작성·외부 검증 전');
  });
});

describe('지역 검토 카드', () => {
  const ctx: RegionalContext = { id: 'c1', region: '울산', industry: '자동차', background: '배경', url: null, excerpt: null, checkedAt: null, test: true };
  test('지역이 없거나 미정이면 만들지 않는다', () => {
    expect(buildRegional({ start: { interests: ['자동차'] }, exploration: null, now: NOW })).toBeNull();
    expect(buildRegional({ start: { reviewRegion: '미정' }, exploration: null, now: NOW })).toBeNull();
  });
  test('근거 id 는 해당 지역·분야의 실제 자료에서만', () => {
    const r = buildRegional({ start: { reviewRegion: '울산', interests: ['자동차', '조선·해양'] }, exploration: null, now: NOW, contexts: [ctx], resources: [] });
    expect(r!.card.sourceIds).toEqual(['c1']);
    expect(r!.card.status).toBe('needs_check');
    const none = buildRegional({ start: { reviewRegion: '경남', interests: ['자동차'] }, exploration: null, now: NOW, contexts: [ctx], resources: [] });
    expect(none!.card.sourceIds).toEqual([]);
    expect(none!.card.customerHypothesis.provenance).not.toBe('user');
    const weak = buildRegional({ start: { reviewRegion: '울산', interests: ['아직 모름'] }, exploration: null, now: NOW, contexts: [ctx] });
    expect(weak!.card.status).toBe('weak');
  });
  test('경로가 있으면 근거 있음, 종료된 경로는 연결하지 않는다', () => {
    const r1 = res({ id: 'r1', regions: ['울산'], contextIds: ['c1'] });
    // 테스트 자료(공식 URL·확인일 없음)는 근거 있음이 아니다
    const unverified = buildRegional({ start: { reviewRegion: '울산', interests: ['자동차'] }, exploration: null, now: NOW, contexts: [ctx], resources: [r1] });
    expect(unverified!.card).toMatchObject({ status: 'needs_check', resourceIds: ['r1'] });
    const verifiedCtx = { ...ctx, test: false, url: 'https://example.go.kr/x', checkedAt: '2026-11-27' };
    const ok = buildRegional({ start: { reviewRegion: '울산', interests: ['자동차'] }, exploration: null, now: NOW, contexts: [verifiedCtx], resources: [r1] });
    expect(ok!.card).toMatchObject({ status: 'has_basis', resourceIds: ['r1'] });
    const closed = buildRegional({ start: { reviewRegion: '울산', interests: ['자동차'] }, exploration: null, now: NOW, contexts: [ctx], resources: [{ ...r1, recruitStatus: 'closed' }] });
    expect(closed!.card.resourceIds).toEqual([]);
  });
  test('자료 범위 안내는 자료가 없는 지역을 정직하게 말한다', () => {
    const note = coverageNote('울산');
    expect(note).toContain('울산');
    expect(note).toContain('자료가 없어요');
  });
});

describe('buildFieldQuestions', () => {
  const prob = { id: 'p', title: '[테스트] 협력사의 기록 관리', affectedUser: '현장 관리자', unknowns: ['이미 쓰는 서비스가 있는지'] } as unknown as ProblemCard;
  test('최대 3개, 현재 방식을 먼저 묻고 전제하지 않는다', () => {
    const q = buildFieldQuestions(prob, null, null, prob.unknowns);
    expect(q.length).toBeLessThanOrEqual(3);
    expect(q[0]!.question).toContain('협력사의 기록 관리');
    expect(q[0]!.question).toContain('현재 어떤 방식');
    expect(q.map((x) => x.id)).toContain('fq-tools');
    for (const x of q) { expect(x.source).toBe('rule'); expect(FIELD_PRESUPPOSE.test(x.question)).toBe(false); }
  });
  test('문제가 없어도 일반 질문 3개', () => {
    const q = buildFieldQuestions(undefined, null, null, []);
    expect(q.map((x) => x.id)).toEqual(['fq-current', 'fq-time', 'fq-conditions']);
  });
});
