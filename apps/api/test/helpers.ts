import { createApp, type AppOptions } from '../src/app';

export const NOW = new Date('2026-11-27T01:00:00Z');

export function setup(opts: AppOptions = {}) {
  const app = createApp({ now: () => NOW, ...opts });
  return {
    app,
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
