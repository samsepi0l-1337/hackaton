import { describe, expect, test } from 'bun:test';
import { FORGOT_PASSWORD_NOTICE, SEED_USERS, checkPassword } from '@gil/shared';
import { createPasswords } from '../src/password';
import { createStore, memoryKv } from '../src/store';
import { NOW, TEST_PEPPER, demo, lastVerification, register, setup } from './helpers';

const SIGNUP = { email: 'a@x.com', password: 'password1', passwordConfirm: 'password1', consent: true };
const START = { readiness: 'no_idea', interests: ['조선·해양'], reviewRegion: '부산' };
const recoveryPasswordOf = (t: ReturnType<typeof setup>) => t.mail.sent.filter((m) => m.subject.includes('복구')).at(-1)!.text.match(/복구 비밀번호: (\S+)/)![1]!;

/** 시계를 움직일 수 있는 앱. */
function clocked(extra: Parameters<typeof setup>[0] = {}) {
  const clock = { t: NOW.getTime() };
  const kv = memoryKv();
  const t = setup({ now: () => new Date(clock.t), store: () => createStore(new Date(clock.t), kv), ...extra });
  return { t, clock, kv };
}

describe('signup', () => {
  test('비밀번호 확인 누락·불일치·규칙 위반은 400 validation (메시지 포함)', async () => {
    const t = setup();
    const c = t.client();
    const noConfirm = await c.post('/api/auth/signup', { ...SIGNUP, passwordConfirm: undefined });
    expect(noConfirm.status).toBe(400);
    expect(noConfirm.body.error.code).toBe('validation');
    const mismatch = await c.post('/api/auth/signup', { ...SIGNUP, passwordConfirm: 'password2' });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.message).toContain(checkPassword('password1', 'password2').messages[0]!);
    expect((await c.post('/api/auth/signup', { ...SIGNUP, password: 'short1', passwordConfirm: 'short1' })).status).toBe(400);
    expect((await c.post('/api/auth/signup', { ...SIGNUP, password: 'onlyletters', passwordConfirm: 'onlyletters' })).status).toBe(400);
    expect((await c.post('/api/auth/signup', { ...SIGNUP, email: 'bad' })).status).toBe(400);
    expect((await c.post('/api/auth/signup', { ...SIGNUP, consent: false })).status).toBe(400);
    expect(t.mail.sent.length).toBe(0);
  });

  test('성공하면 메일 한 통, 로그인은 되지 않고, 비밀번호 해시는 응답에 없다', async () => {
    const t = setup();
    const c = t.client();
    const r = await c.post('/api/auth/signup', { ...SIGNUP, email: 'A@x.com' });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ ok: true, email: 'a@x.com', verificationSent: true });
    expect(r.headers.get('set-cookie')).toBeNull();
    expect((await c.get('/api/auth/me')).body.user).toBeNull();
    expect(t.mail.sent.length).toBe(1);
    expect(t.mail.sent[0]!.to).toBe('a@x.com');
    expect(t.mail.sent[0]!.text).toContain('/verify?token=');
    expect(t.mail.sent[0]!.html).toContain('이메일 인증');
  });

  test('인증된 이메일로 다시 가입하면 409, 미인증이면 다시 보내기(제한 안에서)', async () => {
    const { t, clock } = clocked();
    await t.client().post('/api/auth/signup', SIGNUP);
    const again = await t.client().post('/api/auth/signup', SIGNUP); // 60초 안
    expect(again.status).toBe(201);
    expect(again.body.verificationSent).toBe(false);
    expect(t.mail.sent.length).toBe(1);
    clock.t += 61_000;
    expect((await t.client().post('/api/auth/signup', SIGNUP)).body.verificationSent).toBe(true);
    expect(t.mail.sent.length).toBe(2);
    await t.client().post('/api/auth/verify', { token: lastVerification(t).token });
    const dup = await t.client().post('/api/auth/signup', SIGNUP);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('conflict');
  });
});

describe('이메일 인증', () => {
  test('링크 토큰으로 인증하면 로그인 쿠키와 emailVerified:true', async () => {
    const t = setup();
    const c = t.client();
    await c.post('/api/auth/signup', SIGNUP);
    const v = await c.post('/api/auth/verify', { token: lastVerification(t).token });
    expect(v.status).toBe(200);
    expect(v.body.user).toMatchObject({ email: 'a@x.com', emailVerified: true, mustChangePassword: false });
    expect(v.body.user.passwordHash).toBeUndefined();
    const set = v.headers.get('set-cookie')!;
    expect(set).toContain('sid=');
    expect(set).toContain('HttpOnly');
    expect((await c.get('/api/auth/me')).body.user.emailVerified).toBe(true);
    // 같은 링크는 한 번만
    expect((await t.client().post('/api/auth/verify', { token: lastVerification(t).token })).status).toBe(400);
  });

  test('이메일 + 6자리 코드로 인증, 잘못된 코드 5번이면 막히고 다시 보내야 한다', async () => {
    const { t, clock } = clocked();
    const c = t.client();
    await c.post('/api/auth/signup', SIGNUP);
    const { code } = lastVerification(t);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await c.post('/api/auth/verify', { email: 'a@x.com', code: wrong })).status).toBe(400);
    const locked = await c.post('/api/auth/verify', { email: 'a@x.com', code });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('too_many');
    clock.t += 61_000;
    expect((await c.post('/api/auth/verify/resend', { email: 'a@x.com' })).status).toBe(200);
    const fresh = lastVerification(t);
    const ok = await c.post('/api/auth/verify', { email: 'a@x.com', code: fresh.code });
    expect(ok.status).toBe(200);
    expect(ok.body.user.emailVerified).toBe(true);
  });

  test('토큰은 24시간 뒤 만료된다 (코드도)', async () => {
    const { t, clock } = clocked();
    await t.client().post('/api/auth/signup', SIGNUP);
    const { token, code } = lastVerification(t);
    clock.t += 24 * 3_600_000 + 1000;
    const r = await t.client().post('/api/auth/verify', { token });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toContain('만료');
    expect((await t.client().post('/api/auth/verify', { email: 'a@x.com', code })).status).toBe(400);
  });

  test('다시 보내기: 항상 ok, 같은 이메일은 60초에 1번(429 too_many), 없는 이메일도 같다', async () => {
    const { t, clock } = clocked();
    const c = t.client();
    await c.post('/api/auth/signup', SIGNUP); // 가입 때 한 번 보냄
    const early = await c.post('/api/auth/verify/resend', { email: 'a@x.com' });
    expect(early.status).toBe(429);
    expect(early.body.error.code).toBe('too_many');
    clock.t += 61_000;
    expect((await c.post('/api/auth/verify/resend', { email: 'a@x.com' })).body).toEqual({ ok: true });
    expect(t.mail.sent.length).toBe(2);
    // 없는 이메일: 같은 응답, 같은 제한, 메일 없음
    expect((await c.post('/api/auth/verify/resend', { email: 'nobody@x.com' })).body).toEqual({ ok: true });
    expect((await c.post('/api/auth/verify/resend', { email: 'nobody@x.com' })).status).toBe(429);
    expect(t.mail.sent.length).toBe(2);
    // 이전 링크는 새 링크로 대체된다
    const first = t.mail.sent[0]!.text.match(/token=(\S+)/)![1]!;
    expect((await c.post('/api/auth/verify', { token: first })).status).toBe(400);
  });

  test('KV 에 토큰·코드·복구 비밀번호 평문이 없다', async () => {
    const { t, kv, clock } = clocked();
    await t.client().post('/api/auth/signup', SIGNUP);
    const { token, code } = lastVerification(t);
    await t.client().post('/api/auth/verify', { token });
    clock.t += 1000;
    await t.client().post('/api/auth/forgot', { email: 'a@x.com' });
    const recovery = recoveryPasswordOf(t);
    const dump = JSON.stringify([...kv.data]);
    expect(dump).not.toContain(token);
    expect(dump).not.toContain(recovery);
    expect(dump).not.toContain(`"${code}"`);
    expect(dump).not.toContain('password1');
    expect([...kv.data.keys()].some((k) => k.startsWith('verify:') || k.startsWith('recovery:'))).toBe(true);
  });

  test('메일 전송이 실패해도 가입·다시 보내기·비밀번호 찾기는 같은 응답이다', async () => {
    const t = setup({ mailer: { send: async () => { throw Object.assign(new Error('x'), { code: 'E_RATE_LIMIT_EXCEEDED' }); } } });
    const r = await t.client().post('/api/auth/signup', SIGNUP);
    expect(r.status).toBe(201);
    expect(r.body.verificationSent).toBe(false);
    expect((await t.client().post('/api/auth/forgot', { email: 'demo@test.local' })).status).toBe(200);
  });
});

describe('로그인과 explore', () => {
  test('explore: 로그인 전 401, 미인증 403 email_unverified, 인증 뒤 200. options·problems·resources 는 공개', async () => {
    const t = setup();
    const anon = t.client();
    expect((await anon.put('/api/explore/start', { start: START })).status).toBe(401);
    expect((await anon.get('/api/explore/options')).status).toBe(200);
    expect((await anon.get('/api/explore/problems')).status).toBe(200);
    expect((await anon.get('/api/resources')).status).toBe(200);
    const c = t.client();
    await c.post('/api/auth/signup', SIGNUP);
    const login = await c.post('/api/auth/login', { email: 'a@x.com', password: 'password1' });
    expect(login.status).toBe(200);
    expect(login.body.user.emailVerified).toBe(false);
    const blocked = await c.put('/api/explore/start', { start: START });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('email_unverified');
    expect((await c.get('/api/explore/result')).status).toBe(403);
    expect((await c.get('/api/explore/options')).status).toBe(200);
    await c.post('/api/auth/verify', { token: lastVerification(t).token });
    expect((await c.put('/api/explore/start', { start: START })).status).toBe(200);
  });

  test('시드 사용자는 인증된 상태, 로그인 실패는 401', async () => {
    const t = setup();
    const c = await demo(t);
    expect((await c.get('/api/auth/me')).body.user).toMatchObject({ email: 'demo@test.local', emailVerified: true, mustChangePassword: false });
    expect((await t.client().post('/api/auth/login', { email: 'demo@test.local', password: 'wrong-pass1' })).status).toBe(401);
    expect(SEED_USERS.length).toBeGreaterThan(0);
  });

  test('인증 기능 이전 사용자 레코드(필드 없음)는 미인증으로, 시드 사용자는 인증으로 읽는다', async () => {
    const kv = memoryKv();
    await createStore(NOW, kv);
    const demoRec = kv.get<any>('user:u-demo')!;
    delete demoRec.emailVerified; delete demoRec.mustChangePassword;
    kv.put('user:u-demo', demoRec);
    kv.put('user:u-old', { id: 'u-old', email: 'old@x.com', isTeam: false, createdAt: NOW.toISOString(), passwordHash: 'pbkdf2$1$aa$bb' });
    const store = await createStore(NOW, kv);
    expect(store.findUser('u-demo')!.emailVerified).toBe(true);
    expect(store.findUser('u-old')!.emailVerified).toBe(false);
  });

  test('protected routes 401, unknown route 404 JSON', async () => {
    const t = setup();
    const c = t.client();
    for (const p of ['/api/mentor/session', '/api/applications']) {
      const r = await c.get(p);
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe('unauthorized');
    }
    expect((await c.del('/api/me')).status).toBe(401);
    expect((await c.get('/api/nope')).status).toBe(404);
    expect((await c.get('/api/health')).body).toEqual({ ok: true });
  });
});

describe('비밀번호 찾기·변경', () => {
  test('forgot: 있는 이메일·없는 이메일·형식 오류 모두 같은 200 응답, 메일은 인증된 계정에만', async () => {
    const t = setup();
    const want = { ok: true, message: FORGOT_PASSWORD_NOTICE };
    const a = await t.client().post('/api/auth/forgot', { email: 'demo@test.local' });
    const b = await t.client().post('/api/auth/forgot', { email: 'nobody@x.com' });
    const c = await t.client().post('/api/auth/forgot', { email: 'not-an-email' });
    for (const r of [a, b, c]) { expect(r.status).toBe(200); expect(r.body).toEqual(want); }
    expect(t.mail.sent.length).toBe(1);
    const mail = t.mail.sent[0]!;
    expect(mail.to).toBe('demo@test.local');
    expect(mail.text).toContain('로그인 후 바로 새 비밀번호를 정해 주세요');
    expect(mail.text).toContain('요청하지 않았다면 무시하세요, 기존 비밀번호는 그대로예요');
    const pw = recoveryPasswordOf(t);
    expect(pw).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(checkPassword(pw, pw).ok).toBe(true);
    // 미인증 계정에는 보내지 않는다 (같은 응답)
    await t.client().post('/api/auth/signup', SIGNUP);
    const before = t.mail.sent.length;
    expect((await t.client().post('/api/auth/forgot', { email: 'a@x.com' })).body).toEqual(want);
    expect(t.mail.sent.length).toBe(before);
  });

  test('forgot: 같은 이메일은 10분에 1번만 보낸다 (조용히 무시, 같은 응답)', async () => {
    const { t, clock } = clocked();
    await t.client().post('/api/auth/forgot', { email: 'demo@test.local' });
    const second = await t.client().post('/api/auth/forgot', { email: 'demo@test.local' });
    expect(second.body.message).toBe(FORGOT_PASSWORD_NOTICE);
    expect(t.mail.sent.length).toBe(1);
    clock.t += 10 * 60_000 + 1000;
    await t.client().post('/api/auth/forgot', { email: 'demo@test.local' });
    expect(t.mail.sent.length).toBe(2);
  });

  test('복구 비밀번호 로그인 → password_change_required, 변경하면 정상. 변경 전에는 기존 비밀번호도 된다', async () => {
    const t = setup();
    await t.client().post('/api/auth/forgot', { email: 'demo@test.local' });
    const recovery = recoveryPasswordOf(t);
    // 기존 비밀번호는 복구 비밀번호를 쓰기 전까지 그대로 된다
    const old = await t.client().post('/api/auth/login', { email: 'demo@test.local', password: 'demo1234!' });
    expect(old.status).toBe(200);
    expect(old.body.user.mustChangePassword).toBe(false);
    const c = t.client();
    const login = await c.post('/api/auth/login', { email: 'demo@test.local', password: recovery });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
    // 허용: me·password·logout. 나머지는 403
    expect((await c.get('/api/auth/me')).body.user.mustChangePassword).toBe(true);
    for (const [m, p] of [['put', '/api/explore/start'], ['get', '/api/explore/session'], ['get', '/api/mentor/session'], ['get', '/api/applications'], ['get', '/api/programs']] as const) {
      const r = m === 'put' ? await c.put(p, { start: START }) : await c.get(p);
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('password_change_required');
    }
    // 복구 비밀번호는 한 번만 로그인에 쓸 수 있다
    expect((await t.client().post('/api/auth/login', { email: 'demo@test.local', password: recovery })).status).toBe(401);
    // 변경: 복구 비밀번호가 현재 비밀번호 자리에 들어간다
    expect((await c.post('/api/auth/password', { currentPassword: recovery, newPassword: 'newpass123', newPasswordConfirm: 'newpass123' })).body).toEqual({ ok: true });
    expect((await c.get('/api/auth/me')).body.user.mustChangePassword).toBe(false);
    expect((await c.put('/api/explore/start', { start: START })).status).toBe(200);
    // 옛 비밀번호·복구 비밀번호는 더 이상 안 되고 새 비밀번호는 된다
    expect((await t.client().post('/api/auth/login', { email: 'demo@test.local', password: 'demo1234!' })).status).toBe(401);
    expect((await t.client().post('/api/auth/login', { email: 'demo@test.local', password: recovery })).status).toBe(401);
    expect((await t.client().post('/api/auth/login', { email: 'demo@test.local', password: 'newpass123' })).status).toBe(200);
  });

  test('복구 비밀번호는 30분 뒤 쓸 수 없다', async () => {
    const { t, clock } = clocked();
    await t.client().post('/api/auth/forgot', { email: 'demo@test.local' });
    const recovery = recoveryPasswordOf(t);
    clock.t += 30 * 60_000 + 1000;
    expect((await t.client().post('/api/auth/login', { email: 'demo@test.local', password: recovery })).status).toBe(401);
  });

  test('비밀번호 변경: 로그인 필요, 현재 비밀번호 확인, 규칙, 현재와 다름', async () => {
    const t = setup();
    expect((await t.client().post('/api/auth/password', { currentPassword: 'a', newPassword: 'b', newPasswordConfirm: 'b' })).status).toBe(401);
    const c = await demo(t);
    const body = (o: object) => ({ currentPassword: 'demo1234!', newPassword: 'newpass123', newPasswordConfirm: 'newpass123', ...o });
    expect((await c.post('/api/auth/password', body({ currentPassword: 'nope12345' }))).status).toBe(400);
    expect((await c.post('/api/auth/password', body({ newPasswordConfirm: 'different1' }))).body.error.code).toBe('validation');
    expect((await c.post('/api/auth/password', body({ newPassword: 'short1', newPasswordConfirm: 'short1' }))).status).toBe(400);
    const same = await c.post('/api/auth/password', body({ newPassword: 'demo1234!', newPasswordConfirm: 'demo1234!' }));
    expect(same.status).toBe(400);
    expect(same.body.error.message).toContain('달라야');
    expect((await c.post('/api/auth/password', body({}))).status).toBe(200);
  });

  test('비밀번호를 바꾸면 다른 세션은 끝나고 지금 세션은 남는다', async () => {
    const t = setup();
    const a = await demo(t);
    const b = await demo(t);
    expect((await b.get('/api/auth/me')).body.user).not.toBeNull();
    await a.post('/api/auth/password', { currentPassword: 'demo1234!', newPassword: 'newpass123', newPasswordConfirm: 'newpass123' });
    expect((await a.get('/api/auth/me')).body.user).not.toBeNull();
    expect((await b.get('/api/auth/me')).body.user).toBeNull();
  });
});

describe('비밀번호 저장 (bcrypt + pepper)', () => {
  test('새 계정은 bcrypt$ 해시, 같은 비밀번호도 해시가 다르다', async () => {
    const kv = memoryKv();
    const t = setup({ store: () => createStore(NOW, kv) });
    await register(t, 'p1@x.com');
    await register(t, 'p2@x.com');
    const hashes = [...kv.data].filter(([k]) => k.startsWith('user:u-') && !['u-demo', 'u-new', 'u-team'].includes(k.slice(5))).map(([, v]: any) => v.passwordHash as string);
    expect(hashes.length).toBe(2);
    for (const h of hashes) expect(h).toMatch(/^bcrypt\$\$2[aby]\$10\$/);
    expect(hashes[0]).not.toBe(hashes[1]);
    expect(JSON.stringify([...kv.data])).not.toContain('password1');
  });

  test('pepper 가 다르면 검증에 실패하고, 예전 PBKDF2 해시는 로그인 성공 때 bcrypt 로 바뀐다', async () => {
    const a = createPasswords('pepper-a');
    const h = await a.hash('abc12345');
    expect(await a.verify('abc12345', h)).toBe(true);
    expect(await a.verify('abc12346', h)).toBe(false);
    expect(await createPasswords('pepper-b').verify('abc12345', h)).toBe(false);
    const kv = memoryKv();
    const t = setup({ store: () => createStore(NOW, kv) });
    expect(kv.get<any>('user:u-demo') === undefined).toBe(true); // 첫 요청 전에는 시드 전
    await t.client().post('/api/auth/login', { email: 'demo@test.local', password: 'demo1234!' });
    expect(kv.get<any>('user:u-demo').passwordHash).toMatch(/^bcrypt\$/);
    expect((await t.client().post('/api/auth/login', { email: 'demo@test.local', password: 'demo1234!' })).status).toBe(200);
  });

  test('시드의 예전 해시는 pbkdf2$ 로 시작한다 (이전 계정과 공존)', async () => {
    const kv = memoryKv();
    await createStore(NOW, kv);
    expect(kv.get<any>('user:u-team').passwordHash).toMatch(/^pbkdf2\$/);
    expect(TEST_PEPPER.length).toBeGreaterThan(0);
  });
});

describe('계정 삭제·통계', () => {
  test('삭제하면 인증·복구·한도·내 정보 레코드도 지워지고 같은 이메일로 다시 가입할 수 있다', async () => {
    const kv = memoryKv();
    const t = setup({ store: () => createStore(NOW, kv) });
    const c = await register(t, 'del@x.com');
    await t.client().post('/api/auth/forgot', { email: 'del@x.com' });
    await c.put('/api/explore/start', { start: START });
    await c.post('/api/explore/chat');
    await c.put('/api/me/profile', { profile: { age: 20 } });
    const uid = (await c.get('/api/auth/me')).body.user.id as string;
    expect([...kv.data.keys()].filter((k) => k.endsWith(uid) || k.includes(`:u:${uid}`)).length).toBeGreaterThan(2);
    expect((await c.del('/api/me')).body).toEqual({ ok: true });
    expect([...kv.data.keys()].filter((k) => k.includes(uid))).toEqual([]);
    expect((await t.client().post('/api/auth/login', { email: 'del@x.com', password: 'password1' })).status).toBe(401);
    expect((await t.client().post('/api/auth/signup', { ...SIGNUP, email: 'del@x.com' })).status).toBe(201);
  });

  test('stats: 일반 403, 비로그인 401, 팀은 인증/미인증 계정 수를 본다', async () => {
    const t = setup();
    expect((await (await demo(t)).get('/api/admin/stats')).status).toBe(403);
    expect((await t.client().get('/api/admin/stats')).status).toBe(401);
    await t.client().post('/api/auth/signup', SIGNUP); // 미인증
    const { team } = await import('./helpers');
    const r = await (await team(t)).get('/api/admin/stats');
    expect(r.status).toBe(200);
    expect(r.body.users).toBe(3);
    expect(r.body.accounts).toEqual({ verified: 2, unverified: 1 });
    expect(r.body.submitSuccessRate).toBeNull();
  });
});
