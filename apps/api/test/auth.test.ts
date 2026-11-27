import { describe, expect, test } from 'bun:test';
import { setup, demo } from './helpers';

describe('auth', () => {
  test('signup sets HttpOnly cookie, me returns user, logout clears', async () => {
    const t = setup();
    const c = t.client();
    const r = await c.post('/api/auth/signup', { email: 'A@x.com', password: 'password1', consent: true });
    expect(r.status).toBe(201);
    expect(r.body.user.email).toBe('a@x.com');
    expect(r.body.user.passwordHash).toBeUndefined();
    const set = r.headers.get('set-cookie')!;
    expect(set).toContain('sid=');
    expect(set).toContain('HttpOnly');
    expect(set).toContain('SameSite=Lax');
    expect((await c.get('/api/auth/me')).body.user.email).toBe('a@x.com');
    expect((await c.post('/api/auth/logout')).body).toEqual({ ok: true });
    expect((await c.get('/api/auth/me')).body.user).toBeNull();
  });

  test('signup validation and duplicate email', async () => {
    const t = setup();
    const c = t.client();
    expect((await c.post('/api/auth/signup', { email: 'bad', password: 'password1', consent: true })).status).toBe(400);
    expect((await c.post('/api/auth/signup', { email: 'a@x.com', password: 'short', consent: true })).status).toBe(400);
    expect((await c.post('/api/auth/signup', { email: 'a@x.com', password: 'password1', consent: false })).status).toBe(400);
    expect((await c.post('/api/auth/signup', { email: 'a@x.com', password: 'password1', consent: true })).status).toBe(201);
    const dup = await t.client().post('/api/auth/signup', { email: 'a@x.com', password: 'password1', consent: true });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('conflict');
  });

  test('login success and failure', async () => {
    const t = setup();
    const c = t.client();
    const bad = await c.post('/api/auth/login', { email: 'demo@test.local', password: 'wrong-pass' });
    expect(bad.status).toBe(401);
    const ok = await c.post('/api/auth/login', { email: 'demo@test.local', password: 'demo1234!' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.isTeam).toBe(false);
  });

  test('protected routes return 401 and unknown route 404 JSON', async () => {
    const t = setup();
    const c = t.client();
    for (const p of ['/api/mentor/session', '/api/applications']) {
      const r = await c.get(p);
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe('unauthorized');
    }
    expect((await c.post('/api/mentor/chat')).status).toBe(401);
    expect((await c.del('/api/me')).status).toBe(401);
    const nf = await c.get('/api/nope');
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe('not_found');
    expect((await c.get('/api/health')).body).toEqual({ ok: true });
  });

  test('account delete removes data', async () => {
    const t = setup();
    const c = t.client();
    await c.post('/api/auth/signup', { email: 'del@x.com', password: 'password1', consent: true });
    expect((await c.del('/api/me')).body).toEqual({ ok: true });
    expect((await c.get('/api/auth/me')).body.user).toBeNull();
    const again = await t.client().post('/api/auth/login', { email: 'del@x.com', password: 'password1' });
    expect(again.status).toBe(401);
    // 같은 이메일로 다시 가입 가능
    expect((await t.client().post('/api/auth/signup', { email: 'del@x.com', password: 'password1', consent: true })).status).toBe(201);
  });

  test('stats: 403 for normal user, 200 for team', async () => {
    const t = setup();
    const d = await demo(t);
    expect((await d.get('/api/admin/stats')).status).toBe(403);
    expect((await t.client().get('/api/admin/stats')).status).toBe(401);
    const { team } = await import('./helpers');
    const tm = await team(t);
    const r = await tm.get('/api/admin/stats');
    expect(r.status).toBe(200);
    expect(r.body.users).toBe(2);
    expect(r.body.submitSuccessRate).toBeNull();
  });
});
