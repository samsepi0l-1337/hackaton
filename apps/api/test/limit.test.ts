// 상담 횟수 제한(1인당 7일 3회), 로컬 AI 헤더, 현장 확인 질문.
import { describe, expect, test } from 'bun:test';
import { FIELD_PRESUPPOSE, PROBLEMS } from '@gil/shared';
import { createApp } from '../src/app';
import { createStore, memoryKv } from '../src/store';
import { createDevMailer } from '../src/mail';
import { NOW, TEST_PEPPER, lastVerification } from './helpers';

const DAY = 86_400_000;
const START = { readiness: 'no_idea', interests: ['조선·해양'], reviewRegion: '부산' };

/** 쿠키·IP·헤더를 들고 다니는 클라이언트. 시계는 clock.t 로 움직인다. */
function world(opts: Parameters<typeof createApp>[0] = {}) {
  const clock = { t: NOW.getTime() };
  const kv = memoryKv();
  const mail = createDevMailer({ quiet: true });
  const app = createApp({ now: () => new Date(clock.t), store: () => createStore(new Date(clock.t), kv), mailer: mail, ...opts, env: { PASSWORD_PEPPER: TEST_PEPPER, ...opts.env } });
  let n = 0;
  /** who 가 없으면 처음 쓸 때 새 계정(가입·인증)을 만든다. 있으면 그 계정으로 로그인한다. */
  const client = (ip = '1.1.1.1', extra: Record<string, string> = {}, who?: { email: string; password: string }) => {
    const st = { cookie: '', ip };
    let ready = false;
    const raw = async (method: string, path: string, body?: unknown) => {
      const res = await app.request(path, {
        method,
        headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(st.cookie ? { cookie: st.cookie } : {}), 'cf-connecting-ip': st.ip, ...extra },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.get('set-cookie');
      if (set) { const first = set.split(';')[0]!; st.cookie = first.endsWith('=') ? '' : first; }
      const text = await res.text();
      return { status: res.status, body: (text ? JSON.parse(text) : null) as any };
    };
    const call = async (method: string, path: string, body?: unknown) => {
      if (!ready) {
        ready = true;
        const acct = who ?? { email: `w${++n}@x.com`, password: 'password1' };
        if (who) await raw('POST', '/api/auth/login', acct);
        else {
          await raw('POST', '/api/auth/signup', { ...acct, passwordConfirm: acct.password, consent: true });
          await raw('POST', '/api/auth/verify', { token: lastVerification({ mail }, acct.email).token });
        }
      }
      return raw(method, path, body);
    };
    return {
      st,
      get: (p: string) => call('GET', p),
      post: (p: string, b: unknown = {}) => call('POST', p, b),
      put: (p: string, b: unknown) => call('PUT', p, b),
      del: (p: string) => call('DELETE', p),
      /** 시작 정보를 넣고 첫 질문을 요청한다 (= 상담 1회). */
      async consult() { await call('PUT', '/api/explore/start', { start: START }); return call('POST', '/api/explore/chat', {}); },
    };
  };
  return { app, kv, mail, clock, client };
}

/** 한 사람이 쿠키를 지우고 같은 IP 에서 n 번 상담을 시작한다. */
async function useUp(c: ReturnType<ReturnType<typeof world>['client']>, n: number) {
  for (let i = 0; i < n; i++) { expect((await c.consult()).status).toBe(200); await c.del('/api/explore/session'); }
}

describe('상담 횟수 제한', () => {
  test('3회는 되고 4번째는 429 limit + quota/resetAt, 세션은 바뀌지 않는다', async () => {
    const w = world();
    const c = w.client();
    await useUp(c, 3);
    await c.put('/api/explore/start', { start: START });
    const r = await c.post('/api/explore/chat', {});
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('limit');
    expect(r.body.error.quota).toMatchObject({ used: 3, limit: 3, remaining: 0 });
    expect(r.body.error.quota.resetAt).toBe(new Date(NOW.getTime() + 7 * DAY).toISOString());
    expect(r.body.error.message).toContain('이번 주 상담 3회를 모두 사용했어요');
    expect(r.body.error.message).toContain('12월 4일');
    const s = await c.get('/api/explore/session');
    expect(s.body.messages).toEqual([]);
    expect(s.body.counted).toBe(false);
    expect(s.body.quota).toMatchObject({ used: 3, remaining: 0 });
  });

  test('같은 IP 의 두 계정은 각자 3회를 쓴다 (행사장 공용 IP)', async () => {
    const w = world();
    const a = w.client('9.9.9.9');
    const b = w.client('9.9.9.9');
    await useUp(a, 3);
    await useUp(b, 3);
    expect((await a.consult()).status).toBe(429);
    expect((await b.consult()).status).toBe(429);
    expect((await w.client('9.9.9.9').consult()).status).toBe(200); // 세 번째 계정은 새 사람
  });

  test('로그아웃·재로그인, 초기화로도 횟수는 돌아오지 않는다 (계정 id 로 센다)', async () => {
    const w = world();
    const c = w.client('9.9.9.9');
    await useUp(c, 3);
    await c.post('/api/auth/logout');
    const again = w.client('9.9.9.9', {}, { email: 'w1@x.com', password: 'password1' });
    expect((await again.consult()).status).toBe(429);
  });

  test('로그인 사용자는 user id 로 센다 (IP 가 달라도)', async () => {
    const w = world();
    const u = w.client('2.2.2.2', {}, { email: 'demo@test.local', password: 'demo1234!' });
    for (let i = 0; i < 3; i++) { u.st.ip = `2.2.2.${i}`; expect((await u.consult()).status).toBe(200); await u.del('/api/explore/session'); }
    u.st.ip = '3.3.3.3';
    expect((await u.consult()).status).toBe(429);
  });

  test('팀 계정은 제한이 없다', async () => {
    const w = world();
    const t = w.client('4.4.4.4', {}, { email: 'team@test.local', password: 'team1234!' });
    for (let i = 0; i < 5; i++) { expect((await t.consult()).status).toBe(200); await t.del('/api/explore/session'); }
    expect((await t.get('/api/explore/session')).body.quota).toMatchObject({ used: 0, limit: 3 });
  });

  test('첫 질문 재요청은 두 번 세지 않는다', async () => {
    const w = world();
    const c = w.client();
    expect((await c.consult()).status).toBe(200);
    expect((await c.post('/api/explore/chat', {})).status).toBe(200);
    expect((await c.post('/api/explore/chat', { skip: true })).status).toBe(200);
    const s = await c.get('/api/explore/session');
    expect(s.body.counted).toBe(true);
    expect(s.body.quota).toMatchObject({ used: 1, remaining: 2 });
  });

  test('7일이 지나면 다시 할 수 있다 (시계 주입)', async () => {
    const w = world();
    const c = w.client();
    await useUp(c, 3);
    expect((await c.consult()).status).toBe(429);
    await c.del('/api/explore/session');
    w.clock.t = NOW.getTime() + 7 * DAY - 1000;
    expect((await c.consult()).status).toBe(429);
    await c.del('/api/explore/session');
    w.clock.t = NOW.getTime() + 7 * DAY + 1000;
    expect((await c.consult()).status).toBe(200);
    const q = (await c.get('/api/explore/session')).body.quota;
    expect(q.used).toBe(1);
    // 오래된 항목은 지워진다
    const q1 = [...w.kv.data].find(([k]) => k.startsWith('quota:u:'))!;
    expect(q1[1]).toHaveLength(1);
  });

  test('7일 뒤 오래된 항목은 지워지고, KV 에는 계정 id 키만 있다 (IP·쿠키 키 없음)', async () => {
    const w = world();
    await w.client('203.0.113.77').consult();
    const dump = JSON.stringify([...w.kv.data]);
    expect(dump).not.toContain('203.0.113.77');
    const keys = [...w.kv.data.keys()].filter((k) => k.startsWith('quota:'));
    expect(keys.length).toBe(1);
    expect(keys[0]).toMatch(/^quota:u:u-/);
  });

  test('consultLimit 옵션이 한도를 바꾼다', async () => {
    const a = world({ consultLimit: { count: 1 } });
    const c = a.client('5.5.5.5');
    expect((await c.consult()).status).toBe(200);
    await c.del('/api/explore/session');
    expect((await c.consult()).status).toBe(429);
  });

  test('관리자 통계에 제한에 걸린 횟수가 나온다', async () => {
    const w = world();
    const u = w.client('6.6.6.6');
    await useUp(u, 3);
    await u.consult();
    const admin = w.client('7.7.7.7', {}, { email: 'team@test.local', password: 'team1234!' });
    expect((await admin.get('/api/admin/stats')).body.explore.limitHits).toBe(1);
  });
});

// ---- 로컬 AI 헤더 ----
const ON = { AI_MODE: 'upstage', UPSTAGE_API_KEY: 'k' };
function fakeSolar(text: string) {
  const calls: any[] = [];
  const f = (async (_u: any, init: any) => { calls.push(JSON.parse(init.body)); return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 }); }) as unknown as typeof fetch;
  return { f, calls };
}

describe('로컬 AI 헤더 (x-local-ai)', () => {
  test('mentor 가 목록에 있으면 질문에서 Solar 를 부르지 않고 규칙 문장을 돌려준다', async () => {
    const fk = fakeSolar('안녕하세요, 어떤 분야를 생각하세요?');
    const w = world({ env: ON, fetch: fk.f });
    const local = await w.client('1.1.1.1', { 'x-local-ai': 'mentor,reason,field' }).consult();
    expect(local.status).toBe(200);
    expect(fk.calls.length).toBe(0);
    expect(local.body.messages.length).toBeGreaterThan(0);
    // 헤더가 없으면 지금처럼 Solar 를 부른다
    await w.client('1.1.1.2').consult();
    expect(fk.calls.length).toBe(1);
  });

  test('목록에 없는 작업은 그대로 Solar 를 쓴다', async () => {
    const fk = fakeSolar('안녕하세요, 어떤 분야를 생각하세요?');
    const w = world({ env: ON, fetch: fk.f });
    await w.client('1.1.1.1', { 'x-local-ai': 'reason,field' }).consult();
    expect(fk.calls.length).toBe(1);
  });

  test('field 가 목록에 있으면 현장 질문 문장도 Solar 를 부르지 않는다', async () => {
    const fk = fakeSolar('지금은 이 일을 어떻게 처리하고 계신가요?');
    const w = world({ env: ON, fetch: fk.f });
    const c = w.client('1.1.1.1', { 'x-local-ai': 'field' });
    await c.put('/api/explore/start', { start: START });
    await c.put('/api/explore/exploration', { problemId: 'pb-ship-1' });
    const r = await c.get('/api/explore/result');
    expect(fk.calls.length).toBe(0);
    expect(r.body.fieldQuestions.every((q: any) => q.source === 'rule')).toBe(true);
  });
});

// ---- 현장 확인 질문 ----
describe('현장 확인 질문 (F12 P1)', () => {
  const setupProblem = async (id: string | null, w = world()) => {
    const c = w.client();
    await c.put('/api/explore/start', { start: START });
    if (id) await c.put('/api/explore/exploration', { problemId: id });
    return { w, c };
  };

  test('최대 3개, 규칙 출처, 어려움·구매 의향을 전제하지 않는다', async () => {
    for (const id of [null, ...PROBLEMS.map((p) => p.id)]) {
      const { c } = await setupProblem(id);
      const r = await c.get('/api/explore/result');
      const qs = r.body.fieldQuestions as { id: string; question: string; purpose: string; source: string }[];
      expect(qs.length).toBeGreaterThan(0);
      expect(qs.length).toBeLessThanOrEqual(3);
      for (const q of qs) {
        expect(q.source).toBe('rule');
        for (const bad of ['불편하', '돈을 내', '구매하']) { expect(q.question).not.toContain(bad); expect(q.purpose).not.toContain(bad); }
        expect(FIELD_PRESUPPOSE.test(q.question)).toBe(false);
        expect(q.question.endsWith('?')).toBe(true);
      }
      expect(qs[0]!.question).toContain('현재 어떤 방식으로 처리하나요');
    }
  });

  test('문제를 바꾸면 질문이 다시 만들어진다', async () => {
    const { c } = await setupProblem('pb-ship-1');
    const a = (await c.get('/api/explore/result')).body.fieldQuestions;
    const p1 = PROBLEMS.find((p) => p.id === 'pb-ship-1')!;
    expect(a[0].question).toContain(p1.title.replace(/^\[[^\]]*\]\s*/, ''));
    const other = PROBLEMS.find((p) => p.id !== 'pb-ship-1')!;
    await c.put('/api/explore/exploration', { problemId: other.id });
    const b = (await c.get('/api/explore/result')).body.fieldQuestions;
    expect(b[0].question).toContain(other.title.replace(/^\[[^\]]*\]\s*/, ''));
    expect(b[0].question).not.toBe(a[0].question);
    await c.put('/api/explore/exploration', { customProblem: '동네 가게 재고 기록', origin: 'custom' });
    expect((await c.get('/api/explore/result')).body.fieldQuestions[0].question).toContain('동네 가게 재고 기록');
  });

  test('AI 가 켜져 있으면 통과한 문장만 쓰고, 전제하는 문장은 버린다', async () => {
    const ok = fakeSolar('지금은 이 일을 어떻게 처리하고 계신가요?');
    const w1 = world({ env: ON, fetch: ok.f });
    const r1 = await (await setupProblem('pb-ship-1', w1)).c.get('/api/explore/result');
    expect(r1.body.fieldQuestions.every((q: any) => q.source === 'ai')).toBe(true);
    expect(ok.calls.length).toBe(r1.body.fieldQuestions.length);

    const bad = fakeSolar('이 불편한 일을 얼마에 구매하시겠어요?');
    const w2 = world({ env: ON, fetch: bad.f });
    const r2 = await (await setupProblem('pb-ship-1', w2)).c.get('/api/explore/result');
    expect(r2.body.fieldQuestions.every((q: any) => q.source === 'rule')).toBe(true);
  });
});
