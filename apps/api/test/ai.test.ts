import { describe, expect, test } from 'bun:test';
import { relevanceCandidates, type Program, DECIDE_MODEL } from '@gil/shared';
import { createDecide, normalizeByMax } from '../src/ai/decide';
import { guardText, parseJson } from '../src/ai/guard';
import { createTextAi } from '../src/ai/solar';
import { demo, NOW, setup } from './helpers';

type Handler = (url: string, body: any) => Response | Promise<Response>;
function fake(handler: Handler) {
  const calls: { url: string; body: any; headers: Record<string, string> }[] = [];
  const f = (async (url: any, init: any) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body, headers: init?.headers ?? {} });
    return handler(String(url), body);
  }) as unknown as typeof fetch;
  return { f, calls };
}
const chat = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const ON = { AI_MODE: 'upstage', UPSTAGE_API_KEY: 'k' };

const prog = (over: Partial<Program> = {}): Program => ({
  id: 'p1', title: '부산 청년 창업 지원사업', agency: 'a', category: '사업화', region: '부산', startDate: '2026-11-01', endDate: '2026-12-05',
  recruiting: true, target: null, bizYears: null, targetAge: null, content: '최대 5000만원 지원', url: '', registeredAt: '2026-11-01', tags: [], ...over,
});

describe('guard', () => {
  test('rejects invented money, dates, titles', () => {
    const p = prog();
    expect(guardText('지원금은 1억 원이에요.', { programs: [p] })).toBeNull();
    expect(guardText('최대 $5000 받아요', { programs: [p] })).toBeNull();
    expect(guardText('12월 30일까지예요', { programs: [p] })).toBeNull();
    expect(guardText('마감은 2026-12-31 이에요', { programs: [p] })).toBeNull();
    expect(guardText('D-3 남았어요', { programs: [p] })).toBeNull();
    expect(guardText("'가짜 창업 지원사업'을 추천해요", { programs: [p] })).toBeNull();
    expect(guardText('딴 공고 이름을 보세요', { programs: [p], knownTitles: ['딴 공고 이름'] })).toBeNull();
  });
  test('allows facts from the given sources', () => {
    const p = prog();
    expect(guardText('최대 5000만원 지원이고 12월 5일까지예요.', { programs: [p] })).toContain('5000만원');
    expect(guardText('2026-12-05 마감이에요', { programs: [p] })).not.toBeNull();
    expect(guardText('D-8이에요', { programs: [p], allowedText: ['D-8'] })).not.toBeNull();
    expect(guardText("'부산 청년 창업 지원사업'이 맞아요", { programs: [p] })).not.toBeNull();
    expect(guardText('월 300만원 매출을 목표로 해요', { allowedText: ['월 300만원 매출'] })).not.toBeNull();
  });
  test('empty, fences, length limit', () => {
    expect(guardText('', {})).toBeNull();
    expect(guardText(null, {})).toBeNull();
    expect(guardText('```\n안녕하세요\n```', {})).toBe('안녕하세요');
    const long = '좋아요. '.repeat(100);
    expect(guardText(long, { maxLength: 50 })!.length).toBeLessThanOrEqual(50);
  });
  test('parseJson strips wrappers', () => {
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJson('nope')).toBeNull();
    expect(parseJson('{bad')).toBeNull();
  });
});

describe('text ai adapter', () => {
  test('off mode: null, zero fetch', async () => {
    const { f, calls } = fake(() => chat('x'));
    for (const env of [{}, { AI_MODE: 'off', UPSTAGE_API_KEY: 'k' }, { AI_MODE: 'upstage' }, { AI_MODE: 'route' }]) {
      expect(await createTextAi(env, { fetch: f }).generate('reason', [])).toBeNull();
    }
    expect(calls.length).toBe(0);
  });
  test('upstage: model per task, auth header, gateway token', async () => {
    const { f, calls } = fake(() => chat(' 안녕 '));
    const ai = createTextAi({ ...ON, CF_AIG_TOKEN: 't' }, { fetch: f });
    expect(await ai.generate('reason', [{ role: 'user', content: 'hi' }])).toBe('안녕');
    await ai.generate('summary', []);
    expect(calls[0]!.url).toBe('https://api.upstage.ai/v1/chat/completions');
    expect(calls[0]!.body.model).toBe('solar-mini-4-5-preview');
    expect(calls[1]!.body.model).toBe('solar-pro-4');
    expect((calls[0]!.headers as any).authorization).toBe('Bearer k');
    expect((calls[0]!.headers as any)['cf-aig-authorization']).toBe('Bearer t');
  });
  test('http errors and empty answers give null', async () => {
    for (const status of [500, 403]) {
      const { f } = fake(() => new Response('{}', { status }));
      expect(await createTextAi(ON, { fetch: f }).generate('reason', [])).toBeNull();
    }
    const { f } = fake(() => chat(''));
    expect(await createTextAi(ON, { fetch: f }).generate('reason', [])).toBeNull();
    const t = fake(() => { throw new Error('net'); });
    expect(await createTextAi(ON, { fetch: t.f }).generate('reason', [])).toBeNull();
  });
  test('timeout gives null', async () => {
    const orig = globalThis.setTimeout;
    (globalThis as any).setTimeout = (fn: () => void) => orig(fn, 1); // AI_TIMEOUT_MS 를 1ms 로 줄인다
    try {
      const { f } = fake(() => new Promise<Response>(() => {})); // 영영 안 끝남
      expect(await createTextAi(ON, { fetch: f }).generate('reason', [])).toBeNull();
      expect(await createDecide({ ...ON, DECIDE_ENABLED: '1' }, { fetch: f }).relevance('s', [prog({ id: 'a' }), prog({ id: 'b' })])).toBeNull();
    } finally { globalThis.setTimeout = orig; }
  });
  test('route mode handles both response shapes', async () => {
    const run = (out: unknown) => ({ run: async () => out }) as any;
    expect(await createTextAi({ AI_MODE: 'route', AI: run({ response: '가' }) }).generate('reason', [])).toBe('가');
    expect(await createTextAi({ AI_MODE: 'route', AI: run({ choices: [{ message: { content: '나' } }] }) }).generate('reason', [])).toBe('나');
    expect(await createTextAi({ AI_MODE: 'route', AI: { run: async () => { throw new Error('x'); } } as any }).generate('reason', [])).toBeNull();
  });
});

describe('decide', () => {
  const cands = [prog({ id: 'a' }), prog({ id: 'b' })];
  test('normalizes by max', () => {
    expect(normalizeByMax({ a: 0.2, b: 0.4 })).toEqual({ a: 0.5, b: 1 });
    expect(normalizeByMax({ a: 0 })).toEqual({});
  });
  test('disabled without flag: no fetch', async () => {
    const { f, calls } = fake(() => new Response('{}'));
    expect(await createDecide(ON, { fetch: f }).relevance('s', cands)).toBeNull();
    expect(calls.length).toBe(0);
  });
  test('success, 403 and garbage', async () => {
    const env = { ...ON, DECIDE_ENABLED: '1' };
    const ok = fake(() => new Response(JSON.stringify({ answers: { fit: { probabilities: { a: 0.1, b: 0.3 } } } })));
    expect(await createDecide(env, { fetch: ok.f }).relevance('s', cands)).toEqual({ a: 0.1 / 0.3, b: 1 });
    expect(ok.calls[0]!.url).toEndWith('/systemone');
    expect(ok.calls[0]!.body.model).toBe(DECIDE_MODEL);
    expect(Object.keys(ok.calls[0]!.body.questions.fit.criteria)).toEqual(['a', 'b']);
    expect(await createDecide(env, { fetch: fake(() => new Response('{}', { status: 403 })).f }).relevance('s', cands)).toBeNull();
    expect(await createDecide(env, { fetch: fake(() => new Response('{"answers":{}}')).f }).relevance('s', cands)).toBeNull();
  });
});

describe('app integration', () => {
  const rule = async () => {
    const t = setup();
    const c = await demo(t);
    return { top: (await c.get('/api/mentor/result')).body, c };
  };

  test('off mode: no fetch, same output as before', async () => {
    const { f, calls } = fake(() => chat('x'));
    const t = setup({ fetch: f });
    const c = await demo(t);
    await c.post('/api/mentor/chat');
    await c.post('/api/mentor/summary');
    await c.get('/api/mentor/result');
    const p = (await c.get('/api/programs')).body.items[0].program.id;
    await c.post('/api/applications', { programId: p });
    expect(calls.length).toBe(0);
  });

  test('upstage: mentor question rewritten, falls back on bad output', async () => {
    const good = fake(() => chat('좋아요, 어떤 고객이 떠오르세요?'));
    const c = await demo(setup({ env: ON, fetch: good.f }));
    const r = await c.post('/api/mentor/chat');
    expect(r.body.messages[1].text).toBe('좋아요, 어떤 고객이 떠오르세요?');
    expect(r.body.messages[1].questionIndex).toBe(0);
    const bad = fake(() => chat("'가짜 지원사업'을 신청해 보세요. 1억 원 줘요"));
    const c2 = await demo(setup({ env: ON, fetch: bad.f }));
    const base = (await (await demo(setup())).post('/api/mentor/chat')).body.messages[1].text;
    expect((await c2.post('/api/mentor/chat')).body.messages[1].text).toBe(base);
  });

  test('summary: AI JSON used; parse failure -> rule summary', async () => {
    const json = JSON.stringify({ problem: '문제예요', customer: '고객이에요', solution: '해결이에요', revenue: '수익이에요', busan: '부산이에요' });
    const c = await demo(setup({ env: ON, fetch: fake(() => chat('```json\n' + json + '\n```')).f }));
    await c.post('/api/mentor/chat');
    expect((await c.post('/api/mentor/summary')).body.summary.problem).toBe('문제예요');
    const c2 = await demo(setup({ env: ON, fetch: fake(() => chat('JSON 아님')).f }));
    const ruleSummary = (await (await demo(setup())).post('/api/mentor/summary')).body.summary;
    expect((await c2.post('/api/mentor/summary')).body.summary).toEqual(ruleSummary);
  });

  test('result: reasons via AI w/ guard, 500 -> rule reason, verdicts unchanged', async () => {
    const { top: base } = await rule();
    const ids = base.top.map((x: any) => x.program.id);
    const ok = fake((_u, b) => chat(b?.model === 'solar-mini-4-5-preview' ? '이 공고는 지금 신청할 수 있어요.' : '[]'));
    const r = (await (await demo(setup({ env: ON, fetch: ok.f }))).get('/api/mentor/result')).body;
    expect(r.top.map((x: any) => x.program.id)).toEqual(ids);
    expect(r.top.every((x: any) => x.reason === '이 공고는 지금 신청할 수 있어요.')).toBe(true);
    expect(r.top.map((x: any) => x.eligibility.verdict)).toEqual(base.top.map((x: any) => x.eligibility.verdict));
    expect(r.plan).toEqual(base.plan); // '[]' 은 7개가 아니라 규칙 계획
    const bad = (await (await demo(setup({ env: ON, fetch: fake(() => new Response('', { status: 500 })).f }))).get('/api/mentor/result')).body;
    expect(bad.top.map((x: any) => x.reason)).toEqual(base.top.map((x: any) => x.reason));
    const invented = (await (await demo(setup({ env: ON, fetch: fake(() => chat('최대 9억 원을 줘요')).f }))).get('/api/mentor/result')).body;
    expect(invented.top.map((x: any) => x.reason)).toEqual(base.top.map((x: any) => x.reason));
  });

  test('plan: AI 7 days keeps rule day 1', async () => {
    const { top: base } = await rule();
    const tasks = JSON.stringify(Array.from({ length: 7 }, (_, i) => ({ day: i + 1, task: `AI 할 일 ${i + 1}` })));
    const f = fake((_u, b) => chat(String(b.messages?.[0]?.content ?? '').includes('7일 준비 계획') ? tasks : '이유예요.'));
    const r = (await (await demo(setup({ env: ON, fetch: f.f }))).get('/api/mentor/result')).body;
    expect(r.plan[0]).toEqual(base.plan[0]);
    expect(r.plan[1].task).toBe('AI 할 일 2');
    expect(r.plan.length).toBe(7);
  });

  test('decide changes Top3 order but never includes ineligible; 403 -> rule', async () => {
    const { top: base } = await rule();
    const ids: string[] = base.top.map((x: any) => x.program.id);
    const t0 = setup({});
    const c0 = await demo(t0);
    const store = await (async () => { const m = await c0.get('/api/programs?limit=100&includeClosed=true'); return m.body.items; })();
    const all: Program[] = store.map((x: any) => x.program);
    const prof = (await c0.get('/api/mentor/session')).body.profile;
    const cands = relevanceCandidates(all, prof, NOW);
    const ineligible = all.filter((p) => !cands.some((c) => c.id === p.id)).map((p) => p.id);
    // 마지막 후보 공고를 확률 1, 규칙 1등은 0 으로 준다
    const favor = cands.find((p) => !ids.includes(p.id))?.id ?? cands[cands.length - 1]!.id;
    const probs = Object.fromEntries(cands.map((p) => [p.id, p.id === favor ? 0.9 : 0.001]));
    // 불가 공고에도 확률을 몰래 줘 본다
    for (const id of ineligible) probs[id] = 1;
    const f = fake((u) => (u.endsWith('/systemone') ? new Response(JSON.stringify({ answers: { fit: { probabilities: probs } } })) : new Response('', { status: 500 })));
    const r = (await (await demo(setup({ env: { ...ON, DECIDE_ENABLED: '1' }, fetch: f.f }))).get('/api/mentor/result')).body;
    const got: string[] = r.top.map((x: any) => x.program.id);
    expect(got).toContain(favor);
    expect(got).not.toEqual(ids);
    expect(got.some((id) => ineligible.includes(id))).toBe(false);
    expect(r.top.every((x: any) => x.eligibility.verdict !== 'ineligible')).toBe(true);
    const sent = f.calls.find((c) => c.url.endsWith('/systemone'))!;
    expect(Object.keys(sent.body.questions.fit.criteria).some((id) => ineligible.includes(id))).toBe(false);
    const denied = fake((u) => (u.endsWith('/systemone') ? new Response('{"error":"model_opt_in_required"}', { status: 403 }) : new Response('', { status: 500 })));
    const r2 = (await (await demo(setup({ env: { ...ON, DECIDE_ENABLED: '1' }, fetch: denied.f }))).get('/api/mentor/result')).body;
    expect(r2.top.map((x: any) => x.program.id)).toEqual(ids);
  });

  test('draft: non-identity fields prefilled by AI within maxLength, identity untouched', async () => {
    const f = fake(() => chat(JSON.stringify({ problem: 'AI가 쓴 문제 ' + '가'.repeat(2000), plan: '계획 초안이에요', name: '홍길동' })));
    const c = await demo(setup({ env: ON, fetch: f.f }));
    const p = (await c.get('/api/programs')).body.items.find((x: any) => !x.program.endDate || x.program.endDate >= '2026-12-01').program.id;
    const r = await c.post('/api/applications', { programId: p });
    expect(r.status).toBe(201);
    const by = (k: string) => r.body.fields.find((x: any) => x.key === k);
    expect(by('plan').value).toBe('계획 초안이에요');
    expect(by('name').value).toBe('');
    expect(by('problem').value.length).toBeLessThanOrEqual(by('problem').maxLength ?? 1e9);
    const off = await (await demo(setup({ env: ON, fetch: fake(() => new Response('', { status: 500 })).f }))).post('/api/applications', { programId: p });
    expect(off.body.fields.find((x: any) => x.key === 'plan').value).toBe('');
  });
});

describe('decide 재시도', () => {
  test('5xx 면 한 번 더 시도한다', async () => {
    const { createDecide } = await import('../src/ai/decide');
    let n = 0;
    const f = (async () => {
      n += 1;
      if (n === 1) return new Response('busy', { status: 503 });
      return new Response(JSON.stringify({ answers: { fit: { probabilities: { a: 0.2, b: 0.8 } } } }), { status: 200 });
    }) as unknown as typeof fetch;
    const env = { AI_MODE: 'upstage', UPSTAGE_API_KEY: 'k', DECIDE_ENABLED: '1' };
    const cands = [{ id: 'a', title: 'A', category: 'c', content: '' }, { id: 'b', title: 'B', category: 'c', content: '' }] as any;
    expect(await createDecide(env, { fetch: f }).relevance('s', cands)).toEqual({ a: 0.25, b: 1 });
    expect(n).toBe(2);
  });
});
