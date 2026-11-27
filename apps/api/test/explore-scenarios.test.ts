// features.md §5 수용 시나리오 16개 + 비회원 세션·재전송·AI 한도·통계.
import { afterEach, describe, expect, test } from 'bun:test';
import { CONTEXTS, RESOURCES, type RegionalContext, type Resource } from '@gil/shared';
import { createApp } from '../src/app';
import { memoryKv, createStore } from '../src/store';
import { NOW, setup, team } from './helpers';

/** 호출할 때마다 10초씩 흐르는 시계 (연속 같은 답이 재전송으로 취급되지 않게). */
const ticking = () => { let t = NOW.getTime(); return () => new Date((t += 10_000)); };
const fresh = (opts: Parameters<typeof setup>[0] = {}) => { const t = setup({ now: ticking(), ...opts }); return { t, c: t.client() }; };
const START_NO_IDEA = { readiness: 'no_idea', interests: ['조선·해양'], reviewRegion: '부산' };

// 데이터를 임시로 바꾸는 테스트가 서로 영향을 주지 않게 되돌린다.
const resourcesBackup = structuredClone(RESOURCES);
const contextsBackup = structuredClone(CONTEXTS);
afterEach(() => {
  RESOURCES.splice(0, RESOURCES.length, ...structuredClone(resourcesBackup));
  CONTEXTS.splice(0, CONTEXTS.length, ...structuredClone(contextsBackup));
});
const res = (id: string) => RESOURCES.find((r) => r.id === id)!;

type Client = ReturnType<ReturnType<typeof setup>['client']>;
const begin = async (c: Client, start: Record<string, unknown>) => { const r = await c.put('/api/explore/start', { start }); expect(r.status).toBe(200); return r.body; };
const skipAll = async (c: Client) => { await c.post('/api/explore/chat'); let r: any; for (let i = 0; i < 3; i++) r = await c.post('/api/explore/chat', { skip: true }); return r; };

describe('비회원 세션 (F9)', () => {
  test('읽기는 쿠키를 만들지 않고, 첫 쓰기가 게스트 sid 를 만든다', async () => {
    const { t } = fresh();
    const raw = await t.app.request('/api/explore/session');
    expect(raw.status).toBe(200);
    expect(raw.headers.get('set-cookie')).toBeNull();
    const w = await t.app.request('/api/explore/start', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ start: START_NO_IDEA }) });
    const cookie = w.headers.get('set-cookie')!;
    expect(cookie).toMatch(/^sid=g-/);
    expect(cookie.toLowerCase()).toContain('httponly');
  });

  test('로그인 사용자는 user id 로 저장하고 로그인 쿠키를 지우지 않는다', async () => {
    const t = setup({ now: ticking() });
    const c = t.client();
    await c.post('/api/auth/signup', { email: 'z@x.com', password: 'password1', consent: true });
    await begin(c, START_NO_IDEA);
    expect((await c.del('/api/explore/session')).status).toBe(200);
    expect(c.state.cookie).toMatch(/^sid=[^=]+/); // 로그인 쿠키 유지
    expect((await c.get('/api/auth/me')).body.user).not.toBeNull();
  });

  test('통계는 게스트를 가입자로 세지 않고 회원과 따로 센다', async () => {
    const { t, c } = fresh();
    const admin = await team(t);
    const baseline = (await admin.get('/api/admin/stats')).body.users;
    await begin(c, START_NO_IDEA);
    await skipAll(c);
    await c.get('/api/explore/result');
    await c.post('/api/explore/feedback', { helpful: true });
    const s = (await admin.get('/api/admin/stats')).body;
    expect(s.users).toBe(baseline); // 게스트는 가입자로 세지 않는다
    expect(s.explore.guests).toMatchObject({ sessions: 1, chatDone: 1, resultReached: 1, feedback: 1, helpfulRate: 1 });
    expect(s.explore.accounts.sessions).toBe(0);
  });

  test('재전송: 같은 답을 바로 다시 보내도 메시지가 늘지 않는다', async () => {
    const t = setup(); // 시계 고정
    const c = t.client();
    await begin(c, { readiness: 'has_idea', idea: '동네 빵집 재고 알림' });
    await c.post('/api/explore/chat');
    const a = await c.post('/api/explore/chat', { message: '아침에 빵이 남는 걸 봤어요' });
    const b = await c.post('/api/explore/chat', { message: '아침에 빵이 남는 걸 봤어요' });
    expect(b.body.messages.length).toBe(a.body.messages.length);
    expect(b.body.questionIndex).toBe(a.body.questionIndex);
    const claimed = await c.post('/api/explore/chat', { message: '다른 답', questionIndex: 0 }); // 이미 지난 질문 번호
    expect(claimed.body.messages.length).toBe(a.body.messages.length);
  });

  test('AI 호출 한도를 넘으면 규칙 질문으로 돌아가고 AI 를 부르지 않는다', async () => {
    let calls = 0;
    const fetchFn = (async () => { calls++; return new Response(JSON.stringify({ choices: [{ message: { content: '가볍게 이어서 물어볼게요. 이 일을 해보고 싶어진 경험이 있나요?' } }] }), { status: 200 }); }) as unknown as typeof fetch;
    const { c } = fresh({ env: { AI_MODE: 'upstage', UPSTAGE_API_KEY: 'k' }, fetch: fetchFn, exploreAiLimit: 1 });
    await begin(c, { readiness: 'has_idea', idea: '동네 빵집 재고 알림' });
    await c.post('/api/explore/chat'); // 첫 질문: AI 1회
    const r = await c.post('/api/explore/chat', { message: '봤어요' }); // 한도 초과
    expect(calls).toBe(1);
    expect(r.body.failed).toBe(false);
    expect(r.body.messages.at(-1).text.length).toBeGreaterThan(5);
  });
});

describe('§5 수용 시나리오', () => {
  test('1. 막연한 아이디어 있음: 쉬운 질문 후 요약·준비사항·관련 경로', async () => {
    const { c } = fresh();
    await begin(c, { readiness: 'has_idea', idea: '동네 빵집 재고를 알려주는 서비스', reviewRegion: '부산', interests: ['AI'] });
    const first = (await c.post('/api/explore/chat')).body;
    expect(first.messages.filter((m: any) => m.role === 'mentor').length).toBe(2); // 안내 + 질문 하나
    await c.post('/api/explore/chat', { message: '퇴근길에 빵이 다 팔린 걸 자주 봤어요' });
    await c.post('/api/explore/chat', { message: '근처 직장인이요' });
    const last = (await c.post('/api/explore/chat', { message: '아직 없어요' })).body;
    expect(last.done).toBe(true);
    const sum = (await c.post('/api/explore/summary')).body;
    expect(sum.summary.interest.text).toContain('동네 빵집 재고를 알려주는 서비스');
    expect(sum.summary.interest.provenance).toBe('user');
    expect(sum.summary.target).toEqual({ text: '근처 직장인이요', provenance: 'user' });
    const r = (await c.get('/api/explore/result')).body;
    expect(r.prep.primary.title).toBeTruthy();
    expect(r.resources.length).toBeGreaterThan(0);
    expect(r.resources.length).toBeLessThanOrEqual(3);
  });

  test('2. 아이디어 없음: 관심 탐색·문제 선택 후 요약, 미정 허용', async () => {
    const { c } = fresh();
    await begin(c, START_NO_IDEA);
    const probs = (await c.get('/api/explore/problems?interests=조선·해양&region=부산')).body;
    expect(probs.items.length).toBe(3);
    const picked = probs.items[0].id;
    const ses = (await c.put('/api/explore/exploration', { problemId: picked, selectionReason: '현장 관리가 번거롭다고 들었어요' })).body;
    expect(ses.exploration).toMatchObject({ problemId: picked, origin: 'card', directionStatus: 'hold' });
    await c.post('/api/explore/chat');
    await c.post('/api/explore/chat', { unknown: true });
    const sum = (await c.post('/api/explore/summary')).body.summary;
    expect(sum.exploration.reason).toEqual({ text: '현장 관리가 번거롭다고 들었어요', provenance: 'user' });
    expect(sum.target.provenance).toBe('unknown');
    expect(sum.exploration.direction.text).toBe('아직 탐색 중');
    expect(sum.exploration.problem.evidenceLevel).toBe('조사 후보');
  });

  test('3. 전부 모름·건너뛰기: 추정 없이 미정 요약과 탐색 준비 안내', async () => {
    const { c } = fresh();
    await begin(c, { readiness: 'no_idea', interests: ['아직 모름'] });
    const last = await skipAll(c);
    expect(last.body.done).toBe(true);
    expect(last.body.messages.filter((m: any) => m.role === 'user').every((m: any) => m.skipped)).toBe(true);
    const sum = (await c.post('/api/explore/summary')).body.summary;
    expect(sum.target).toEqual({ text: '미정', provenance: 'unknown' });
    expect(sum.value.provenance).toBe('unknown');
    expect(sum.exploration.hypotheses.provenance).toBe('unknown');
    const r = (await c.get('/api/explore/result')).body;
    expect(r.prep.primary.title).toBe('이용할 사람의 상황 구체화');
  });

  test('4. 지역 자료 없음: 없음을 표시하고 일반 준비 안내 유지', async () => {
    const { c } = fresh();
    await begin(c, { readiness: 'no_idea', interests: ['자동차'], reviewRegion: '울산' });
    expect((await c.get('/api/explore/problems?interests=자동차&region=울산')).body.items).toEqual([]);
    expect((await c.get('/api/explore/problems?interests=자동차&region=울산')).body.emptyReason).toContain('없습니다');
    await skipAll(c);
    await c.post('/api/explore/summary');
    const r = (await c.get('/api/explore/result')).body;
    expect(r.regional.sourceIds).toEqual([]);
    expect(r.regional.status).toBe('needs_check');
    expect(r.contexts).toEqual([]);
    expect(r.coverageNote).toContain('울산');
    expect(r.prep.primary.title).toBeTruthy();
  });

  test('5. 자격 정보 미입력: 추가 확인 필요, 부합으로 확정하지 않음', async () => {
    const { c } = fresh();
    await begin(c, { readiness: 'preparing', idea: '시제품 제작', reviewRegion: '부산' });
    const r = (await c.get('/api/explore/result')).body;
    expect(r.resources.length).toBeGreaterThan(0);
    expect(r.resources.every((x: any) => x.condition.status === 'check')).toBe(true);
    expect(r.conditionNote).toContain('보장하지 않아요');
    // '모름'을 직접 보내도 같다
    const r2 = (await c.put('/api/explore/conditions', { conditions: { age: 'unknown', residence: 'unknown', hasBusiness: 'unknown' } })).body;
    expect(r2.resources.every((x: any) => x.condition.status !== 'match')).toBe(true);
  });

  test('6. 종료된 프로그램: 현재 모집 추천에서 제외하고 목록에서는 종료로 보인다', async () => {
    const { c } = fresh();
    await begin(c, { readiness: 'preparing', idea: '시제품 제작', reviewRegion: '부산' });
    await c.put('/api/explore/exploration', { problemId: 'pb-ship-2' });
    const before = (await c.get('/api/explore/result')).body.resources.map((x: any) => x.resource.id);
    expect(before).toContain('rs-btp-space');
    res('rs-btp-space').endDate = '2026-11-01';
    const after = (await c.get('/api/explore/result')).body.resources.map((x: any) => x.resource.id);
    expect(after).not.toContain('rs-btp-space');
    const card = (await c.get('/api/resources/rs-btp-space')).body;
    expect(card.condition.checks.find((x: any) => x.key === 'period').status).toBe('mismatch');
    res('rs-ccei-consult').recruitStatus = 'closed';
    expect((await c.get('/api/explore/result')).body.resources.map((x: any) => x.resource.id)).not.toContain('rs-ccei-consult');
  });

  test('7. AI 장애: 재시도 신호 + 규칙 질문·제안·결과', async () => {
    const down = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    const { c } = fresh({ env: { AI_MODE: 'upstage', UPSTAGE_API_KEY: 'k' }, fetch: down });
    await begin(c, START_NO_IDEA);
    await c.put('/api/explore/exploration', { problemId: 'pb-ship-1' });
    const first = (await c.post('/api/explore/chat')).body;
    expect(first.failed).toBe(true);
    expect(first.messages.at(-1).text).toContain('관심을 끌었나요'); // 규칙 질문
    const sug = (await c.post('/api/explore/chat', { wantSuggestions: true })).body;
    expect(sug.suggestions.length).toBeGreaterThan(0);
    expect(sug.suggestions.length).toBeLessThanOrEqual(2);
    const sum = (await c.post('/api/explore/summary')).body;
    expect(sum.summary.interest.provenance).toBe('user');
    const r = await c.get('/api/explore/result');
    expect(r.status).toBe(200);
    expect(r.body.resources.every((x: any) => x.reasonProvenance === 'rule')).toBe(true);
  });

  test('8. 요약 수정: 출처가 user 로 바뀌고 준비 완료 표시가 초기화되며 준비사항이 다시 계산된다', async () => {
    const { c } = fresh();
    await begin(c, { readiness: 'has_idea', idea: '빵집 재고 알림' });
    await skipAll(c);
    await c.post('/api/explore/summary');
    const r0 = (await c.get('/api/explore/result')).body;
    expect(r0.prep.primary.id).toBe('prep-target');
    await c.put('/api/explore/prep', { id: 'prep-target', done: true });
    expect((await c.get('/api/explore/result')).body.prep.primary.done).toBe(true);
    const ed = (await c.put('/api/explore/summary', { summary: { target: { text: '근처 직장인' } } })).body;
    expect(ed.summary.target).toEqual({ text: '근처 직장인', provenance: 'user' });
    expect(ed.prepReset).toBe(true);
    const r1 = (await c.get('/api/explore/result')).body;
    expect(r1.prep.primary.id).not.toBe('prep-target');
    expect([r1.prep.primary, ...r1.prep.followUps].every((p: any) => !p.done)).toBe(true);
    // 바뀌지 않은 칸은 출처를 그대로 둔다
    expect(ed.summary.interest.provenance).toBe('user');
  });

  test('9. 문제 선택 변경: 입력 보존·문제 ID 갱신·결과 재평가', async () => {
    const { c } = fresh();
    await begin(c, START_NO_IDEA);
    await c.put('/api/explore/exploration', { problemId: 'pb-ship-1', selectionReason: '안전 문제가 궁금해요' });
    await c.post('/api/explore/chat');
    await c.post('/api/explore/chat', { message: '현장에서 봤어요' });
    await c.post('/api/explore/summary');
    await c.put('/api/explore/prep', { id: (await c.get('/api/explore/result')).body.prep.primary.id, done: true });
    const ses = (await c.put('/api/explore/exploration', { problemId: 'pb-ship-3' })).body;
    expect(ses.problemChanged).toBe(true);
    expect(ses.exploration.problemId).toBe('pb-ship-3');
    expect(ses.exploration.selectionReason).toBe('안전 문제가 궁금해요'); // 사용자 입력 보존
    expect(ses.messages.some((m: any) => m.text === '현장에서 봤어요')).toBe(true);
    expect(ses.start.interests).toEqual(['조선·해양']);
    expect(ses.summary).toBeNull(); // 재평가
    const r = (await c.get('/api/explore/result')).body;
    expect(r.summary.exploration.problem.title).toContain('항만');
    expect(JSON.stringify(r)).not.toContain('안전교육'); // 이전 문제의 사실이 남지 않는다
    expect([r.prep.primary, ...r.prep.followUps].every((p: any) => !p.done)).toBe(true);
  });

  test('10. 원하는 문제 없음: 직접 입력·보류로 진행하고 임의 선택은 없다', async () => {
    const { c } = fresh();
    await begin(c, START_NO_IDEA);
    const hold = (await c.put('/api/explore/exploration', { origin: 'hold' })).body;
    expect(hold.exploration.problemId).toBeNull();
    await skipAll(c);
    const s1 = (await c.post('/api/explore/summary')).body.summary;
    expect(s1.exploration.problem).toBeNull();
    await c.put('/api/explore/exploration', { origin: 'custom', customProblem: '항만 주차장 혼잡' });
    const s2 = (await c.post('/api/explore/summary')).body.summary;
    expect(s2.exploration.problem).toEqual({ title: '항만 주차장 혼잡', source: null, evidenceLevel: '사용자 작성·외부 검증 전' });
    expect((await c.put('/api/explore/exploration', { origin: 'custom', customProblem: ' ' })).status).toBe(400);
  });

  test('11. AI 제안 거절: 거절 반영·탐색 중 표시·같은 제안을 강요하지 않는다', async () => {
    const { c } = fresh();
    await begin(c, START_NO_IDEA);
    await c.put('/api/explore/exploration', { problemId: 'pb-ship-1' });
    const a = (await c.post('/api/explore/chat', { wantSuggestions: true })).body;
    expect(a.suggestions.length).toBe(2);
    const mid = (await c.get('/api/explore/session')).body;
    expect(mid.exploration.directionStatus).toBe('ai_suggested'); // 사용자 선택이 아님
    expect(mid.exploration.direction).toBeNull();
    const rej = (await c.put('/api/explore/exploration', { directionStatus: 'hold' })).body;
    expect(rej.exploration.directionStatus).toBe('hold');
    expect(rej.exploration.suggestions).toEqual([]);
    const sum = (await c.post('/api/explore/summary')).body.summary;
    expect(sum.exploration.direction).toMatchObject({ text: '아직 탐색 중', status: 'hold' });
    const b = (await c.post('/api/explore/chat', { wantSuggestions: true })).body;
    expect(b.suggestions.some((x: string) => a.suggestions.includes(x))).toBe(false);
    // 사용자가 고르면 user_selected
    const chosen = (await c.put('/api/explore/exploration', { direction: b.suggestions[0] ?? a.suggestions[0], directionStatus: 'user_selected' })).body;
    expect(chosen.exploration.directionStatus).toBe('user_selected');
    expect((await c.put('/api/explore/exploration', { directionStatus: 'ai_suggested' })).status).toBe(400);
  });

  test('12. 지역 변경: 배경·가설·경로를 다시 평가하고 문구를 도시명만 바꾸지 않는다', async () => {
    const { c } = fresh();
    await begin(c, START_NO_IDEA);
    await c.put('/api/explore/exploration', { problemId: 'pb-ship-1' });
    await c.post('/api/explore/summary');
    const busan = (await c.get('/api/explore/result')).body.regional;
    expect(busan.status).toBe('has_basis');
    expect(busan.sourceIds).toEqual(['ctx-busan-ship']);
    expect(busan.resourceIds.length).toBeGreaterThan(0);
    await c.put('/api/explore/start', { start: { reviewRegion: '울산' } });
    const ulsan = (await c.get('/api/explore/result')).body.regional;
    expect(ulsan.region).toBe('울산');
    expect(ulsan.sourceIds).toEqual([]);
    expect(ulsan.resourceIds).toEqual([]);
    expect(ulsan.status).toBe('needs_check');
    expect(ulsan.basis.replace(/울산/g, '부산')).not.toBe(busan.basis);
    expect(ulsan.customerHypothesis.provenance).toBe('ai');
    await c.put('/api/explore/start', { start: { reviewRegion: '미정' } });
    expect((await c.get('/api/explore/result')).body.regional).toBeNull();
  });

  test('13. 검토 지역과 거주지 다름: 희망 지역과 신청 자격을 분리한다', async () => {
    const { c } = fresh();
    res('rs-ccei-consult').conditions = { residence: '부산' };
    await begin(c, { readiness: 'has_idea', idea: '빵집', reviewRegion: '부산' });
    await c.put('/api/explore/conditions', { conditions: { residence: '울산 남구' } });
    const card = (await c.get('/api/resources/rs-ccei-consult')).body;
    expect(card.regionMatch).toBe(true); // 검토 지역은 부산
    expect(card.condition.status).toBe('mismatch'); // 거주지는 불일치
    const rec = (await c.get('/api/explore/result')).body.resources.map((x: any) => x.resource.id);
    expect(rec).not.toContain('rs-ccei-consult');
    // 반대: 거주지는 맞고 검토 지역만 다른 경우
    await c.put('/api/explore/conditions', { conditions: { residence: '해운대구' } });
    await c.put('/api/explore/start', { start: { reviewRegion: '울산' } });
    const card2 = (await c.get('/api/resources/rs-ccei-consult')).body;
    expect(card2.regionMatch).toBe(false);
    expect(card2.condition.checks.find((x: any) => x.key === 'residence').status).toBe('match');
  });

  test('14. 산업 자료만 있고 이용 경로 없음: 배경 사실만 제시하고 경로는 미확인', async () => {
    const { c } = fresh();
    const ctx: RegionalContext = { id: 'ctx-ulsan-auto', region: '울산', industry: '자동차', background: '울산에 자동차 산업 기반이 있어요(테스트 자료).', url: null, excerpt: null, checkedAt: null, test: true };
    CONTEXTS.push(ctx);
    await begin(c, { readiness: 'no_idea', interests: ['자동차'], reviewRegion: '울산' });
    const reg = (await c.get('/api/explore/result')).body;
    expect(reg.regional.sourceIds).toEqual(['ctx-ulsan-auto']);
    expect(reg.regional.resourceIds).toEqual([]);
    expect(reg.regional.status).toBe('needs_check');
    expect(reg.regional.basis).toContain('경로는 아직 확인하지 못했어요');
    expect(reg.contexts.map((x: any) => x.id)).toEqual(['ctx-ulsan-auto']);
  });

  test('15. 지역 연관성 약함: 연관성 판단 어려움을 표시하고 구상을 바꾸지 않는다', async () => {
    const { c } = fresh();
    await begin(c, { readiness: 'has_idea', idea: '반려동물 산책 알림', interests: ['아직 모름'], reviewRegion: '경남' });
    const before = (await c.get('/api/explore/session')).body;
    const reg = (await c.get('/api/explore/result')).body.regional;
    expect(reg.status).toBe('weak');
    expect(reg.basis).toContain('판단하기 어려워요');
    expect(reg.sourceIds).toEqual([]);
    const after = (await c.get('/api/explore/session')).body;
    expect(after.start.idea).toBe(before.start.idea);
    expect(after.exploration).toEqual(before.exploration);
  });

  test('16. 새로고침·초기화: 같은 쿠키로 복구되고 초기화하면 서버 기록과 쿠키가 지워진다', async () => {
    const { t, c } = fresh();
    await begin(c, START_NO_IDEA);
    await c.put('/api/explore/exploration', { problemId: 'pb-ship-1' });
    const cookie = c.state.cookie;
    const reloaded = t.client(cookie); // 새로고침 = 같은 쿠키의 새 요청
    const ses = (await reloaded.get('/api/explore/session')).body;
    expect(ses.start.reviewRegion).toBe('부산');
    expect(ses.exploration.problemId).toBe('pb-ship-1');
    const del = await reloaded.del('/api/explore/session');
    expect(del.body.ok).toBe(true);
    expect(del.headers.get('set-cookie')).toContain('sid=;');
    expect((await t.client(cookie).get('/api/explore/session')).body.step).toBe('start'); // 옛 쿠키로도 기록이 없다
    expect((await t.client(cookie).get('/api/explore/session')).body.exploration).toBeNull();
  });
});

describe('F2 질문 선택', () => {
  test('지역 질문은 3개 중 하나를 대체하고 4번째로 늘지 않는다', async () => {
    const { c } = fresh();
    await begin(c, { readiness: 'has_idea', idea: '빵집', reviewRegion: '부산' });
    await c.post('/api/explore/chat');
    for (let i = 0; i < 3; i++) await c.post('/api/explore/chat', { message: `답 ${i}` });
    const r = (await c.post('/api/explore/chat', { message: '넷째 답' })).body; // 3개 후에는 받지 않는다
    const asked = r.messages.filter((m: any) => m.role === 'mentor' && m.questionIndex !== undefined);
    expect(asked.length).toBe(3);
    expect(asked.some((m: any) => m.text.includes('부울경'))).toBe(true);
    expect(r.messages.filter((m: any) => m.role === 'user').length).toBe(3);
    expect(r.done).toBe(true);
  });

  test('finish 로 일찍 끝내고, 시작 정보 없이는 질문하지 않는다', async () => {
    const { c } = fresh();
    expect((await c.post('/api/explore/chat')).status).toBe(400);
    await begin(c, { readiness: 'has_idea', idea: '빵집' });
    await c.post('/api/explore/chat');
    const r = (await c.post('/api/explore/chat', { message: '봤어요', finish: true })).body;
    expect(r.done).toBe(true);
    expect(r.questionIndex).toBe(1);
  });

  test('F1 최소 검증과 기존 mentor 엔드포인트 공존', async () => {
    const { t, c } = fresh();
    const bad = (await c.put('/api/explore/start', { start: { readiness: 'has_idea' } })).body;
    expect(bad.errors.map((e: any) => e.field)).toContain('idea');
    const long = (await c.put('/api/explore/start', { start: { idea: 'x'.repeat(201) } })).body;
    expect(long.errors.some((e: any) => e.field === 'idea')).toBe(true);
    expect(long.start.idea).toBeUndefined();
    expect((await t.client().get('/api/mentor/session')).status).toBe(401);
  });
});

describe('저장소 견고성', () => {
  test('예전 모양·깨진 레코드가 있어도 요청이 계속 처리된다', async () => {
    const kv = memoryKv();
    kv.put('mentor:old-user', { step: 'form', profile: { industry: '옛 값' }, oldField: true }); // 모양 불일치
    kv.put('user:broken', { id: 'broken' }); // 필수 칸 없음
    kv.put('app:legacy', 'garbage');
    kv.put('explore:g-old', { kind: 'guest', createdAt: 'x', start: 7 });
    const warn = console.warn; const lines: string[] = [];
    console.warn = (...a: unknown[]) => { lines.push(a.join(' ')); };
    try {
      const app = createApp({ now: () => NOW, store: () => createStore(NOW, kv) });
      expect((await app.request('/api/health')).status).toBe(200);
      expect((await app.request('/api/explore/session')).status).toBe(200);
      const login = await app.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo@test.local', password: 'demo1234!' }) });
      expect(login.status).toBe(200);
      const put = await app.request('/api/explore/start', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ start: START_NO_IDEA }) });
      expect(put.status).toBe(200);
      expect((await app.request('/api/programs')).status).toBe(200);
    } finally { console.warn = warn; }
    expect(lines.filter((l) => l.includes('[store]')).length).toBe(1); // 경고는 한 줄
    expect(lines[0]).toContain('4개');
    expect(kv.get('meta:schema')).toBe(2);
    expect(kv.get('mentor:old-user')).toBeDefined(); // 사용자 데이터를 지우지 않는다
  });
});
