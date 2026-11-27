// POST /api/admin/kstartup/sync (팀 계정): 실제 공고를 지금 수집한다.
import type { Hono } from 'hono';
import { ROUTES } from '@gil/shared';
import type { Bindings } from '../env';
import { HttpError, type AppEnv } from '../http';
import type { FetchLike } from './client';
import type { KStartupStore } from './store';
import { runSync } from './sync';

export function mountKStartup(app: Hono<AppEnv>, opts: { store: KStartupStore; env?: Bindings; fetch?: FetchLike }) {
  app.post(ROUTES.kstartupSync, async (c) => {
    const u = c.get('user');
    if (!u) throw new HttpError(401, 'unauthorized', '로그인이 필요해요');
    if (!u.isTeam) throw new HttpError(403, 'forbidden', '팀 계정만 쓸 수 있어요');
    const env = { ...opts.env, ...(c.env ?? {}) } as Bindings;
    return c.json(await runSync({ store: opts.store, env, fetch: opts.fetch, now: c.get('now') }));
  });
}
