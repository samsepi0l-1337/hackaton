import { createApp, type AppOptions } from '../src/app';
import { createDevMailer } from '../src/mail';

export const NOW = new Date('2026-11-27T01:00:00Z');

/** 테스트용 pepper (실제 값이 아니다). */
export const TEST_PEPPER = 'test-pepper-not-a-secret';

export function setup(opts: AppOptions = {}) {
  const mail = createDevMailer({ quiet: true });
  const app = createApp({ now: () => NOW, mailer: mail, ...opts, env: { PASSWORD_PEPPER: TEST_PEPPER, ...opts.env } });
  return {
    app,
    /** 보낸 메일 (개발용 메일러). */
    mail,
    /** 쿠키를 들고 다니는 클라이언트. */
    client(cookie = '') {
      const state = { cookie };
      const call = async (method: string, path: string, body?: unknown) => {
        const res = await app.request(path, {
          method,
          headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(state.cookie ? { cookie: state.cookie } : {}) },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const set = res.headers.get('set-cookie');
        if (set) {
          const first = set.split(';')[0]!;
          state.cookie = first.endsWith('=') ? '' : first;
        }
        const text = await res.text();
        return { status: res.status, headers: res.headers, body: (text ? JSON.parse(text) : null) as any };
      };
      return {
        state,
        get: (p: string) => call('GET', p),
        post: (p: string, b?: unknown) => call('POST', p, b ?? {}),
        put: (p: string, b: unknown) => call('PUT', p, b),
        del: (p: string) => call('DELETE', p),
      };
    },
  };
}

export async function loginAs(t: ReturnType<typeof setup>, email: string, password: string) {
  const c = t.client();
  const r = await c.post('/api/auth/login', { email, password });
  if (r.status !== 200) throw new Error(`login failed ${r.status}`);
  return c;
}
export const demo = (t: ReturnType<typeof setup>) => loginAs(t, 'demo@test.local', 'demo1234!');
export const team = (t: ReturnType<typeof setup>) => loginAs(t, 'team@test.local', 'team1234!');

/** 인증 메일에서 링크 토큰과 6자리 코드를 꺼낸다. */
export function lastVerification(t: { mail: { sent: { to: string; text: string }[] } }, to?: string) {
  const m = [...t.mail.sent].reverse().find((x) => (!to || x.to === to) && x.text.includes('/verify?token='));
  if (!m) throw new Error('no verification mail');
  return { token: m.text.match(/\/verify\?token=(\S+)/)![1]!, code: m.text.match(/인증 코드 (\d{6})/)![1]! };
}

/** 가입 → 인증 메일 링크로 인증 → 로그인된 클라이언트. */
export async function register(t: ReturnType<typeof setup>, email: string, password = 'password1') {
  const c = t.client();
  const r = await c.post('/api/auth/signup', { email, password, passwordConfirm: password, consent: true });
  if (r.status !== 201) throw new Error(`signup failed ${r.status}`);
  const v = await c.post('/api/auth/verify', { token: lastVerification(t, email).token });
  if (v.status !== 200) throw new Error(`verify failed ${v.status}`);
  return c;
}

/** 처음 쓸 때 가입·인증·로그인을 해 주는 클라이언트 (사용자마다 이메일이 달라야 한다). */
export function lazyClient(t: ReturnType<typeof setup>, email = 'lazy@x.com', password = 'password1') {
  const c = t.client();
  let ready: Promise<void> | null = null;
  const ensure = () => (ready ??= (async () => {
    await c.post('/api/auth/signup', { email, password, passwordConfirm: password, consent: true });
    await c.post('/api/auth/verify', { token: lastVerification(t, email).token });
  })());
  return {
    state: c.state,
    get: async (p: string) => { await ensure(); return c.get(p); },
    post: async (p: string, b?: unknown) => { await ensure(); return c.post(p, b); },
    put: async (p: string, b: unknown) => { await ensure(); return c.put(p, b); },
    del: async (p: string) => { await ensure(); return c.del(p); },
  };
}
