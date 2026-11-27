import { describe, expect, test } from 'bun:test';
import { BUFS_COOKIE, BUFS_SESSION_HOURS } from '@gil/shared';
import { createApp } from '../src/app';
import { createPasswords } from '../src/password';
import { createStore, memoryKv } from '../src/store';
import { NOW, TEST_PEPPER, demo, register, setup } from './helpers';

// 관리자 비밀번호는 실행마다 새로 만든 값이다 (저장소에 평문을 두지 않는다).
const ADMIN_PLAIN = `admin-${crypto.randomUUID()}`;
const WRONG = `wrong-${crypto.randomUUID()}`;
const START = { readiness: 'has_idea', idea: '동네 빵집 재고 알림', reviewRegion: '부산' };

async function adminApp(extra: Parameters<typeof setup>[0] = {}) {
  const hash = await createPasswords(TEST_PEPPER).hash(ADMIN_PLAIN);
  const clock = { t: NOW.getTime() };
  const kv = memoryKv();
  const t = setup({ now: () => new Date(clock.t), store: () => createStore(new Date(clock.t), kv), ...extra, env: { ADMIN_PASSWORD_HASH: hash, ...extra.env } });
  return { t, clock, kv };
}

describe('/bufs 관리자', () => {
  test('로그인: HttpOnly·SameSite=Strict 별도 쿠키, 사용자 세션과 분리, 로그아웃', async () => {
    const { t } = await adminApp();
    const c = t.client();
    expect((await c.get('/api/bufs/me')).body).toEqual({ admin: false });
    expect((await c.get('/api/bufs/feedback')).status).toBe(401);
    const bad = await c.post('/api/bufs/login', { password: WRONG });
    expect(bad.status).toBe(401);
    const ok = await t.app.request('/api/bufs/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: ADMIN_PLAIN }) });
    expect(ok.status).toBe(200);
    const set = ok.headers.get('set-cookie')!;
    expect(set).toContain(`${BUFS_COOKIE}=`);
    expect(set).toContain('HttpOnly');
    expect(set).toContain('SameSite=Strict');
    expect(set).toContain(`Max-Age=${BUFS_SESSION_HOURS * 3600}`);
    const cookie = set.split(';')[0]!;
    const me = await t.app.request('/api/bufs/me', { headers: { cookie } });
    expect(await me.json()).toEqual({ admin: true });
    // 사용자 로그인은 관리자가 아니다
    const u = await demo(t);
    expect((await u.get('/api/bufs/me')).body).toEqual({ admin: false });
    const out = await t.app.request('/api/bufs/logout', { method: 'POST', headers: { cookie } });
    expect(out.status).toBe(200);
    expect(await (await t.app.request('/api/bufs/me', { headers: { cookie } })).json()).toEqual({ admin: false });
  });

  test('비밀번호 해시 secret 이 없으면 로그인할 수 없다', async () => {
    const t = setup();
    expect((await t.client().post('/api/bufs/login', { password: ADMIN_PLAIN })).status).toBe(401);
  });

  test('5회 실패하면 10분 잠금 (맞는 비밀번호도 429), 잠금이 끝나면 다시 된다, IP 해시별', async () => {
    const { t, clock } = await adminApp();
    const call = (ip: string, password: string) => t.app.request('/api/bufs/login', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify({ password }) });
    for (let i = 0; i < 5; i++) expect((await call('1.1.1.1', WRONG)).status).toBe(401);
    const locked = await call('1.1.1.1', ADMIN_PLAIN);
    expect(locked.status).toBe(429);
    expect((await locked.json() as any).error.code).toBe('too_many');
    expect((await call('2.2.2.2', ADMIN_PLAIN)).status).toBe(200); // 다른 IP 는 영향 없음
    clock.t += 10 * 60_000 + 1000;
    expect((await call('1.1.1.1', ADMIN_PLAIN)).status).toBe(200);
  });

  test('의견: 제출 한 건씩 기록, 최신순, 이메일은 가림, 원문 대화 없음, 요약 비율', async () => {
    const clock = { t: NOW.getTime() };
    const { t } = await adminApp({ now: () => new Date((clock.t += 10_000)) });
    const u1 = await register(t, 'alice@gmail.com');
    await u1.put('/api/explore/start', { start: START });
    await u1.put('/api/explore/exploration', { problemId: 'pb-ship-1' });
    await u1.post('/api/explore/chat');
    await u1.post('/api/explore/chat', { message: '비밀스러운 대화 내용 XYZ' });
    await u1.post('/api/explore/feedback', { helpful: true, directionClear: true, reason: '도움이 됐어요', regionIntent: { before: 2, after: 4 }, foundRegionalPath: false });
    await u1.post('/api/explore/feedback', { helpful: false, regionIntent: { before: 2, after: 2 } });
    const u2 = await register(t, 'bob@naver.com');
    await u2.put('/api/explore/start', { start: { readiness: 'no_idea', interests: ['조선·해양'], reviewRegion: '울산' } });
    await u2.post('/api/explore/feedback', { helpful: true, regionIntent: { before: 4, after: 5 }, foundRegionalPath: true });
    const admin = t.client();
    await admin.post('/api/bufs/login', { password: ADMIN_PLAIN });
    const r = await admin.get('/api/bufs/feedback');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(3);
    expect(r.body.items.map((i: any) => i.user)).toEqual(['bo***@naver.com', 'al***@gmail.com', 'al***@gmail.com']);
    expect(r.body.items[0]).toMatchObject({ readiness: 'no_idea', reviewRegion: '울산', problemId: null, helpful: true, foundRegionalPath: true, regionIntent: { before: 4, after: 5 } });
    expect(r.body.items[2]).toMatchObject({ readiness: 'has_idea', reviewRegion: '부산', problemId: 'pb-ship-1', helpful: true, reason: '도움이 됐어요' });
    expect(new Set(r.body.items.map((i: any) => i.id)).size).toBe(3);
    expect(JSON.stringify(r.body)).not.toContain('XYZ');
    expect(JSON.stringify(r.body)).not.toContain('alice@gmail.com');
    expect(r.body.summary.helpfulRate).toBeCloseTo(2 / 3);
    expect(r.body.summary.directionClearRate).toBe(1);
    expect(r.body.summary.foundPathRate).toBe(0.5);
    expect(r.body.summary.regionIntentAvg).toEqual({ before: 2.67, after: 3.67 });
    const page = await admin.get('/api/bufs/feedback?limit=1&offset=1');
    expect(page.body.items.length).toBe(1);
    expect(page.body.total).toBe(3);
    expect((await admin.get('/api/bufs/feedback?limit=-1')).status).toBe(400);
  });

  test('계정을 지워도 의견 기록은 남지만 이메일 원문은 없다', async () => {
    const { t, kv } = await adminApp();
    const u = await register(t, 'gone@x.com');
    await u.put('/api/explore/start', { start: START });
    await u.post('/api/explore/feedback', { helpful: true });
    await u.del('/api/me');
    expect([...kv.data.keys()].some((k) => k.startsWith('feedback:'))).toBe(true);
    expect(JSON.stringify([...kv.data])).not.toContain('gone@x.com');
  });
});

describe('내 정보 (기본 정보)', () => {
  test('로그인 필요, 기본은 빈 값, 부분 저장, 검증', async () => {
    const t = setup();
    expect((await t.client().get('/api/me/profile')).status).toBe(401);
    expect((await t.client().put('/api/me/profile', { profile: {} })).status).toBe(401);
    const c = await register(t, 'pf@x.com');
    expect((await c.get('/api/me/profile')).body.profile).toEqual({ age: null, residence: null, hasBusiness: null, occupation: null, updatedAt: null });
    const r = await c.put('/api/me/profile', { profile: { age: 24, residence: '해운대구', occupation: '대학생' } });
    expect(r.status).toBe(200);
    expect(r.body.profile).toMatchObject({ age: 24, residence: '해운대구', hasBusiness: null, occupation: '대학생' });
    expect(r.body.profile.updatedAt).not.toBeNull();
    const r2 = await c.put('/api/me/profile', { profile: { hasBusiness: false, age: null } });
    expect(r2.body.profile).toMatchObject({ age: null, residence: '해운대구', hasBusiness: false });
    for (const bad of [{ age: -1 }, { age: 121 }, { age: 20.5 }, { age: '20' }, { residence: '화성' }, { hasBusiness: 'yes' }, { occupation: '외계인' }]) {
      const e = await c.put('/api/me/profile', { profile: bad });
      expect(e.status).toBe(400);
      expect(e.body.error.code).toBe('validation');
    }
    expect((await c.get('/api/me/profile')).body.profile.age).toBeNull(); // 실패한 요청은 저장하지 않는다
    expect((await c.put('/api/me/profile', {})).status).toBe(400);
  });

  test('다른 사람의 정보와 섞이지 않는다', async () => {
    const t = setup();
    const a = await register(t, 'a1@x.com');
    const b = await register(t, 'b1@x.com');
    await a.put('/api/me/profile', { profile: { age: 30 } });
    expect((await b.get('/api/me/profile')).body.profile.age).toBeNull();
  });

  test('탐색 결과의 기본 조건으로 쓰고, 직접 입력한 조건이 있으면 그것을 쓴다', async () => {
    const { RESOURCES } = await import('@gil/shared');
    const res = RESOURCES.find((r) => r.id === 'rs-ccei-consult')!;
    const backup = structuredClone(res.conditions);
    try {
      res.conditions = { residence: '부산' };
      const t = setup();
      const c = await register(t, 'cond@x.com');
      await c.put('/api/explore/start', { start: START });
      const status = async () => (await c.get('/api/resources/rs-ccei-consult')).body.condition.checks.find((x: any) => x.key === 'residence')?.status;
      const before = await status();
      await c.put('/api/me/profile', { profile: { residence: '해운대구' } });
      expect(await status()).toBe('match');
      expect(before).not.toBe('match');
      // 직접 입력한 조건이 우선
      await c.put('/api/explore/conditions', { conditions: { residence: '울산 남구' } });
      expect(await status()).toBe('mismatch');
      // 공개 목록도 로그인한 사용자의 기본 조건을 쓴다
      const other = await register(t, 'cond2@x.com');
      await other.put('/api/me/profile', { profile: { residence: '해운대구' } });
      const card = (await other.get('/api/resources')).body.items.find((x: any) => x.resource.id === 'rs-ccei-consult');
      expect(card.condition.checks.find((x: any) => x.key === 'residence').status).toBe('match');
    } finally {
      res.conditions = backup;
    }
  });

  test('createApp 기본 옵션 (store 주입 없음)에서도 동작한다', async () => {
    const app = createApp({ now: () => NOW });
    expect((await app.request('/api/health')).status).toBe(200);
  });
});
