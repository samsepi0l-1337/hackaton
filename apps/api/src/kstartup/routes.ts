// POST /api/admin/kstartup/sync (팀 계정): 실제 공고를 지금 수집한다.
import type { Hono } from 'hono';
import { ROUTES } from '@gil/shared';
import type { Bindings } from '../env';
import { HttpError, type AppEnv } from '../http';
import type { FetchLike } from './client';
import type { KStartupStore } from './store';
import { runSync } from './sync';
import { isAdmin } from '../bufs';

export function mountKStartup(app: Hono<AppEnv>, opts: { store: KStartupStore; env?: Bindings; fetch?: FetchLike }) {
  app.post(ROUTES.kstartupSync, async (c) => {
    if (!isAdmin(c)) throw new HttpError(c.get('user') ? 403 : 401, c.get('user') ? 'forbidden' : 'unauthorized', '관리자만 쓸 수 있어요 (/bufs 로그인)');
    const env = { ...opts.env, ...(c.env ?? {}) } as Bindings;
    return c.json(await runSync({ store: opts.store, env, fetch: opts.fetch, now: c.get('now') }));
  });
}
