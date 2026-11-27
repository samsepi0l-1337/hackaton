import { describe, expect, test } from 'bun:test';
import { createPasswords } from '../src/password';
import { createStore, memoryKv } from '../src/store';
import { NOW, TEST_PEPPER, demo, register, setup } from './helpers';

describe('운영 테스트 기록 정리', () => {
  test('운영 설정(seedUsers:false)은 테스트 계정을 만들지 않는다', async () => {
    const kv = memoryKv();
    await createStore(NOW, kv, { seedUsers: false });
    expect([...kv.data.keys()].some((k) => k.startsWith('user:'))).toBe(false);
  });

  test('purgeTestData 는 @test.local 계정과 그 기록, 예전 비회원 기록을 한 번 지우고 실제 사용자는 남긴다', async () => {
    const kv = memoryKv();
    const t = setup({ store: () => createStore(NOW, kv) }); // 로컬처럼 시드 계정 생성
    const c = await demo(t);
    await c.put('/api/explore/start', { start: { readiness: 'no_idea', interests: ['AI'] } });
    await register(t, 'real@example.com');
    kv.put('explore:g-old', { x: 1 });
    kv.put('quota:ip:abc', ['2026-11-27T00:00:00Z']);
    kv.put('quota:c:g-old', ['2026-11-27T00:00:00Z']);
    const before = [...kv.data.keys()];
    expect(before.some((k) => k.startsWith('email:demo@test.local'))).toBe(true);

    const store = await createStore(NOW, kv, { seedUsers: false, purgeTestData: true });
    const keys = [...kv.data.keys()];
    expect(keys.some((k) => /test\.local/.test(k))).toBe(false);
    expect(keys.filter((k) => k.startsWith('explore:g-') || k.startsWith('quota:ip:') || k.startsWith('quota:c:'))).toEqual([]);
    expect(store.allUsers().map((u) => u.email)).toEqual(['real@example.com']);
    expect(kv.data.has('meta:purged-test-v1')).toBe(true);
    // 두 번째 시작에서는 다시 지우지 않는다 (표시가 있음)
    const again = await createStore(NOW, kv, { seedUsers: false, purgeTestData: true });
    expect(again.allUsers().map((u) => u.email)).toEqual(['real@example.com']);
  });

  test('관리자(/bufs 세션)는 팀 계정 없이 실제 공고 수집·통계를 쓸 수 있다', async () => {
    const plain = `admin-${crypto.randomUUID()}`;
    const hash = await createPasswords(TEST_PEPPER).hash(plain);
    const t = setup({ store: () => createStore(NOW, memoryKv(), { seedUsers: false }), env: { ADMIN_PASSWORD_HASH: hash } });
    const anon = t.client();
    expect((await anon.post('/api/admin/kstartup/sync')).status).toBe(401);
    expect((await anon.get('/api/admin/stats')).status).toBe(401);
    const admin = t.client();
    expect((await admin.post('/api/bufs/login', { password: plain })).status).toBe(200);
    expect((await admin.get('/api/admin/stats')).status).toBe(200);
    const sync = await admin.post('/api/admin/kstartup/sync');
    expect(sync.status).toBe(200);
    expect(sync.body.ok).toBe(false); // 테스트 환경에는 서비스 키가 없다
  });
});
