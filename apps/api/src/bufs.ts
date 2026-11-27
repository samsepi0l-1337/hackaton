// /bufs 관리자 API. 사용자 계정과 따로 둔 비밀번호 하나(secret ADMIN_PASSWORD_HASH)와 별도 세션 쿠키를 쓴다.
// 로그인 5회 실패(IP 해시별) → 10분 잠금. 의견 남기기 데이터는 한 건씩, 원문 대화 없이 보여 준다.
import type { Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { BUFS_COOKIE, BUFS_SESSION_HOURS, type BufsFeedbackItem, type BufsFeedbackResponse } from '@gil/shared';
import type { FeedbackRecord } from './db/schema';
import { sha256Hex } from './auth';
import type { Bindings } from './env';
import { HttpError, type AppEnv } from './http';
import { randomToken, type Passwords } from './password';

type Ctx = Context<AppEnv>;
const MAX_FAILS = 5;
const LOCK_MINUTES = 10;

const clientIp = (c: Ctx) => c.req.header('cf-connecting-ip')?.trim() || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local';

/** ab***@gmail.com 처럼 가린다. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
const rateOf = (xs: (boolean | null)[]) => { const v = xs.filter((x): x is boolean => x !== null); return v.length ? v.filter(Boolean).length / v.length : null; };

export function summarize(items: FeedbackRecord[]): BufsFeedbackResponse['summary'] {
  const nums = (pick: (r: FeedbackRecord) => number | undefined) => items.map(pick).filter((x): x is number => typeof x === 'number');
  return {
    helpfulRate: rateOf(items.map((r) => r.helpful)),
    directionClearRate: rateOf(items.map((r) => r.directionClear)),
    foundPathRate: rateOf(items.map((r) => r.foundRegionalPath)),
    regionIntentAvg: { before: avg(nums((r) => r.regionIntent?.before)), after: avg(nums((r) => r.regionIntent?.after)) },
  };
}

export function mountBufs(app: Hono<AppEnv>, deps: { passwordsFor: (c: Ctx) => Passwords; envOf: (c: Ctx) => Bindings }) {
  const isAdmin = (c: Ctx) => {
    const t = getCookie(c, BUFS_COOKIE);
    return !!t && c.get('store').bufsSessionValid(t, c.get('now'));
  };

  app.post('/api/bufs/login', async (c) => {
    const body = await c.req.json().catch(() => null) as { password?: unknown } | null;
    const password = typeof body?.password === 'string' ? body.password : '';
    const store = c.get('store');
    const now = c.get('now');
    const hash = deps.envOf(c).ADMIN_PASSWORD_HASH;
    const ipHash = await sha256Hex(`bufs:${clientIp(c)}`);
    let lock = store.bufsLock(ipHash);
    if (lock.lockedUntil && Date.parse(lock.lockedUntil) > now.getTime()) {
      throw new HttpError(429, 'too_many', `로그인 시도가 너무 많아요. ${LOCK_MINUTES}분 뒤에 다시 해 주세요`);
    }
    if (lock.lockedUntil) lock = { fails: 0, lockedUntil: null }; // 잠금이 끝남
    if (!hash || !password || !(await deps.passwordsFor(c).verify(password, hash))) {
      const fails = lock.fails + 1;
      store.setBufsLock(ipHash, { fails, lockedUntil: fails >= MAX_FAILS ? new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString() : null });
      throw new HttpError(401, 'unauthorized', '비밀번호가 맞지 않아요');
    }
    store.clearBufsLock(ipHash);
    const token = randomToken();
    store.createBufsSession(token, new Date(now.getTime() + BUFS_SESSION_HOURS * 3_600_000).toISOString());
    setCookie(c, BUFS_COOKIE, token, { httpOnly: true, sameSite: 'Strict', path: '/', maxAge: BUFS_SESSION_HOURS * 3600, secure: new URL(c.req.url).protocol === 'https:' });
    return c.json({ ok: true });
  });

  app.post('/api/bufs/logout', (c) => {
    const t = getCookie(c, BUFS_COOKIE);
    if (t) c.get('store').deleteBufsSession(t);
    deleteCookie(c, BUFS_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.get('/api/bufs/me', (c) => c.json({ admin: isAdmin(c) }));

  app.get('/api/bufs/feedback', (c) => {
    if (!isAdmin(c)) throw new HttpError(401, 'unauthorized', '관리자 로그인이 필요해요');
    const intOf = (k: string, d: number, max: number) => {
      const raw = c.req.query(k);
      if (raw === undefined || raw === '') return d;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw new HttpError(400, 'bad_request', `${k} 값이 올바르지 않아요`);
      return Math.min(n, max);
    };
    const limit = intOf('limit', 50, 200), offset = intOf('offset', 0, 1_000_000);
    const all = c.get('store').allFeedback().sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const items: BufsFeedbackItem[] = all.slice(offset, offset + limit).map((r) => ({
      ...r, knowWhatToPrepare: r.knowWhatToPrepare ?? null, regionIntent: r.regionIntent ?? null,
    }) as BufsFeedbackItem);
    return c.json({ total: all.length, items, summary: summarize(all) } satisfies BufsFeedbackResponse);
  });
}
