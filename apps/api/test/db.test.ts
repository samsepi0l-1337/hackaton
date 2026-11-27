import { describe, expect, test } from 'bun:test';
import { createStore, DbError, memoryKv } from '../src/store';
import { NOW, setup } from './helpers';

describe('DB: Zod 검사 + KV 저장', () => {
  test('같은 KV 로 앱을 다시 만들어도 가입·세션·상담·지원서가 남는다 (Durable Object 재시작)', async () => {
    const kv = memoryKv();
    const t1 = setup({ store: () => createStore(NOW, kv) });
    const c = t1.client();
    expect((await c.post('/api/auth/signup', { email: 'p@test.local', password: 'password1!', consent: true })).status).toBe(201);
    await c.put('/api/mentor/profile', { profile: { age: 22, stage: 'pre', district: '중구' } });
    const t2 = setup({ store: () => createStore(NOW, kv) });
    const c2 = t2.client(c.state.cookie);
    const me = await c2.get('/api/auth/me');
    expect(me.body.user.email).toBe('p@test.local');
    const s = await c2.get('/api/mentor/session');
    expect(s.body.profile).toMatchObject({ age: 22, stage: 'pre', district: '중구' });
    expect([...kv.data.keys()].some((k) => k.startsWith('mentor:'))).toBe(true);
  });

  test('시드는 한 번만 들어간다', async () => {
    const kv = memoryKv();
    await createStore(NOW, kv);
    const before = kv.data.size;
    await createStore(NOW, kv);
    expect(kv.data.size).toBe(before);
  });

  test('스키마에 맞지 않는 레코드는 저장하지 않는다', async () => {
    const store = await createStore(NOW, memoryKv());
    expect(() => store.addUser({ id: 'x', email: 'not-an-email', isTeam: false, createdAt: NOW.toISOString(), passwordHash: 'x'.repeat(20) })).toThrow(DbError);
    const m = store.mentor('u-demo');
    (m as { step: string }).step = 'nope';
    expect(() => store.flush()).toThrow(DbError);
  });

  test('계정 삭제는 KV 에서도 지운다', async () => {
    const kv = memoryKv();
    const t = setup({ store: () => createStore(NOW, kv) });
    const c = t.client();
    await c.post('/api/auth/login', { email: 'demo@test.local', password: 'demo1234!' });
    await c.post('/api/applications', { programId: 'T-0001' });
    expect([...kv.data.keys()].some((k) => k.startsWith('app:'))).toBe(true);
    expect((await c.del('/api/me')).status).toBe(200);
    expect([...kv.data.keys()].filter((k) => /^(user:u-demo|mentor:u-demo|app:|email:demo)/.test(k))).toEqual([]);
    expect([...kv.data.keys()].filter((k) => k.startsWith('session:'))).toEqual([]);
  });
});
