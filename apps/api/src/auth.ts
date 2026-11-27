// 계정 API: 가입·이메일 인증·로그인·비밀번호 찾기/변경·내 정보·계정 삭제. (2026-11-27 계정 계약)
// 결정:
// - 미인증 사용자도 로그인은 된다 (user.emailVerified=false). 탐색 API 는 403 email_unverified.
// - 비밀번호 찾기는 인증을 마친 계정에만 복구 비밀번호를 보낸다. 미인증 계정은 인증 메일 다시 받기를 쓴다.
// - 미인증 이메일로 다시 가입하면 비밀번호를 새로 받은 값으로 바꾸고 인증 메일을 다시 보낸다 (메일함 주인이 마지막 가입자가 되도록).
// - 이메일별 요청 시각은 이메일 SHA-256 해시로 저장한다 (계정이 없어도 같은 제한 → 존재 여부가 드러나지 않는다).
import type { Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
  BUSAN_DISTRICTS, EMAIL_RE, FORGOT_PASSWORD_NOTICE, RECOVERY_REQUEST_MINUTES, RECOVERY_TTL_MINUTES, SESSION_COOKIE, VERIFY_RESEND_SECONDS, VERIFY_TTL_HOURS,
  OCCUPATIONS, RESIDENCE_OPTIONS, checkPassword, type AuthResponse, type BasicProfile, type UserConditions, type SignupResponse, type User,
} from '@gil/shared';
import type { VerifyRecord } from './db/schema';
import type { Bindings } from './env';
import { HttpError, type AppEnv } from './http';
import { recoveryMail, verificationMail, type Mailer } from './mail';
import { randomToken, type Passwords } from './password';
import type { Store, UserRecord } from './store';

type Ctx = Context<AppEnv>;

const MAX_CODE_ATTEMPTS = 5;
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

const bad = (m: string) => new HttpError(400, 'bad_request', m);
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
export const sha256Hex = async (text: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function readJson(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json();
    if (b && typeof b === 'object' && !Array.isArray(b)) return b as Record<string, unknown>;
  } catch { /* 아래에서 처리 */ }
  throw bad('JSON 본문이 필요해요');
}
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const emailOf = (v: unknown) => text(v).trim().toLowerCase();

export const publicUser = (u: UserRecord): User => ({
  id: u.id, email: u.email, isTeam: u.isTeam, createdAt: u.createdAt,
  emailVerified: u.emailVerified === true, mustChangePassword: u.mustChangePassword === true,
});

function passwordErrors(password: string, confirm: string, field: 'password' | 'newPassword' = 'password') {
  const r = checkPassword(password, confirm);
  if (r.ok) return null;
  return new HttpError(400, 'validation', r.messages.join(' '), r.messages.map((message) => ({ field, message })) as never);
}

const randomCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, '0');

/** 영문+숫자 12자. 비밀번호 규칙을 지킨다. */
export function randomRecoveryPassword(): string {
  for (;;) {
    const r = crypto.getRandomValues(new Uint8Array(12));
    const p = [...r].map((x) => RECOVERY_ALPHABET[x % RECOVERY_ALPHABET.length]).join('');
    if (checkPassword(p, p).ok) return p;
  }
}

const secondsSince = (iso: string | undefined, now: Date) => (iso ? (now.getTime() - Date.parse(iso)) / 1000 : Infinity);

export interface AuthDeps { mailerFor: (env: Bindings) => Mailer; requireUser: (c: Ctx) => UserRecord; passwordsFor: (c: Ctx) => Passwords }

export function mountAuth(app: Hono<AppEnv>, deps: AuthDeps) {
  const mailer = (c: Ctx) => deps.mailerFor({ ...(c.env ?? {}) } as Bindings);
  const originOf = (c: Ctx) => ((c.env as Bindings | undefined)?.APP_ORIGIN || new URL(c.req.url).origin).replace(/\/+$/, '');

  const startSession = (c: Ctx, userId: string, mustChangePassword = false) => {
    const token = randomToken();
    c.get('store').createSession(token, userId, mustChangePassword);
    setCookie(c, SESSION_COOKIE, token, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 60 * 60 * 24 * 14, secure: new URL(c.req.url).protocol === 'https:' });
  };

  /** 새 토큰·코드를 만들어 저장하고 메일을 보낸다. 보냈으면 true. */
  async function sendVerification(c: Ctx, store: Store, user: UserRecord): Promise<boolean> {
    const now = c.get('now');
    const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const code = randomCode();
    const record: VerifyRecord = {
      tokenHash: await sha256Hex(token),
      codeHash: await sha256Hex(`${user.id}:${code}`),
      expiresAt: new Date(now.getTime() + VERIFY_TTL_HOURS * 3_600_000).toISOString(),
      sentAt: now.toISOString(),
      attempts: 0,
    };
    store.setVerification(user.id, record);
    try {
      await mailer(c).send(verificationMail(user.email, `${originOf(c)}/verify?token=${token}`, code));
      return true;
    } catch { return false; } // 오류 code 는 메일러가 이미 남겼다
  }

  /** 이 이메일의 인증 메일 요청이 제한에 걸리는가. 걸리지 않으면 지금 시각을 기록한다. */
  async function verifyRateLimited(c: Ctx, store: Store, email: string): Promise<boolean> {
    const h = await sha256Hex(email);
    const now = c.get('now');
    if (secondsSince(store.lastRequest('verify', h), now) < VERIFY_RESEND_SECONDS) return true;
    store.setLastRequest('verify', h, now.toISOString());
    return false;
  }

  app.post('/api/auth/signup', async (c) => {
    const b = await readJson(c);
    const email = emailOf(b.email);
    const password = text(b.password);
    if (!EMAIL_RE.test(email)) throw bad('이메일 형식이 올바르지 않아요');
    const pe = passwordErrors(password, text(b.passwordConfirm));
    if (pe) throw pe;
    if (b.consent !== true) throw bad('개인정보 수집·이용에 동의해 주세요');
    const store = c.get('store');
    let user = store.findUserByEmail(email);
    if (user?.emailVerified) throw new HttpError(409, 'conflict', '이미 가입한 이메일이에요');
    const passwordHash = await deps.passwordsFor(c).hash(password);
    if (user) {
      user = { ...user, passwordHash };
      store.addUser(user);
    } else {
      user = { id: `u-${crypto.randomUUID()}`, email, isTeam: false, createdAt: c.get('now').toISOString(), passwordHash, emailVerified: false, mustChangePassword: false };
      store.addUser(user);
    }
    const sent = !(await verifyRateLimited(c, store, email)) && (await sendVerification(c, store, user));
    return c.json({ ok: true, email, verificationSent: sent } satisfies SignupResponse, 201);
  });

  app.post('/api/auth/verify', async (c) => {
    const b = await readJson(c);
    const store = c.get('store');
    const now = c.get('now');
    let user: UserRecord | undefined;
    if (text(b.token)) {
      const uid = store.userIdOfVerifyToken(await sha256Hex(text(b.token)));
      user = uid ? store.findUser(uid) : undefined;
      const rec = user && store.verification(user.id);
      if (!user || !rec) throw bad('인증 링크가 올바르지 않거나 이미 썼어요');
      if (Date.parse(rec.expiresAt) <= now.getTime()) throw bad('인증 링크가 만료됐어요. 인증 메일을 다시 받아 주세요');
    } else if (text(b.email) && text(b.code)) {
      user = store.findUserByEmail(emailOf(b.email));
      const rec = user && store.verification(user.id);
      if (!user || !rec) throw bad('인증 코드가 맞지 않아요');
      if (rec.attempts >= MAX_CODE_ATTEMPTS) throw new HttpError(429, 'too_many', '코드를 너무 많이 틀렸어요. 인증 메일을 다시 받아 주세요');
      if (Date.parse(rec.expiresAt) <= now.getTime()) throw bad('인증 코드가 만료됐어요. 인증 메일을 다시 받아 주세요');
      if ((await sha256Hex(`${user.id}:${text(b.code).trim()}`)) !== rec.codeHash) {
        store.setVerification(user.id, { ...rec, attempts: rec.attempts + 1 });
        throw bad('인증 코드가 맞지 않아요');
      }
    } else {
      throw bad('token 또는 email과 code가 필요해요');
    }
    const verified: UserRecord = { ...user, emailVerified: true };
    store.addUser(verified);
    store.deleteVerification(user.id);
    startSession(c, user.id);
    return c.json({ user: publicUser(verified) } satisfies AuthResponse);
  });

  app.post('/api/auth/verify/resend', async (c) => {
    const b = await readJson(c);
    const email = emailOf(b.email);
    const store = c.get('store');
    if (!EMAIL_RE.test(email)) return c.json({ ok: true });
    if (await verifyRateLimited(c, store, email)) throw new HttpError(429, 'too_many', `인증 메일은 ${VERIFY_RESEND_SECONDS}초에 한 번만 보낼 수 있어요`);
    const user = store.findUserByEmail(email);
    if (user && !user.emailVerified) await sendVerification(c, store, user);
    return c.json({ ok: true });
  });

  app.post('/api/auth/login', async (c) => {
    const b = await readJson(c);
    const password = text(b.password);
    const store = c.get('store');
    const user = store.findUserByEmail(emailOf(b.email));
    const fail = () => new HttpError(401, 'unauthorized', '이메일 또는 비밀번호가 맞지 않아요');
    if (!user) throw fail();
    const pw = deps.passwordsFor(c);
    if (await pw.verify(password, user.passwordHash)) {
      // 예전 PBKDF2 해시는 로그인 성공 때 bcrypt+pepper 로 바꾼다.
      if (pw.needsRehash(user.passwordHash)) store.addUser({ ...user, passwordHash: await pw.hash(password) });
      startSession(c, user.id);
      return c.json({ user: publicUser({ ...user, mustChangePassword: false }) } satisfies AuthResponse);
    }
    // 복구 비밀번호: 한 번만 로그인에 쓸 수 있고, 로그인하면 비밀번호를 바꿀 때까지 다른 기능이 막힌다.
    const rec = store.recovery(user.id);
    const now = c.get('now');
    if (rec && !rec.used && Date.parse(rec.expiresAt) > now.getTime() && (await pw.verify(password, rec.hash))) {
      // 비밀번호를 바꾸는 단계에서 확인할 수 있게 레코드는 남기고, 같은 시간만큼 더 유효하게 한다.
      store.setRecovery(user.id, { ...rec, used: true, expiresAt: new Date(now.getTime() + RECOVERY_TTL_MINUTES * 60_000).toISOString() });
      startSession(c, user.id, true);
      return c.json({ user: publicUser({ ...user, mustChangePassword: true }) } satisfies AuthResponse);
    }
    throw fail();
  });

  app.post('/api/auth/logout', (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) c.get('store').deleteSession(token);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.get('/api/auth/me', (c) => {
    const u = c.get('user');
    return c.json({ user: u ? publicUser(u) : null });
  });

  app.post('/api/auth/forgot', async (c) => {
    const b = await readJson(c);
    const email = emailOf(b.email);
    const store = c.get('store');
    const now = c.get('now');
    const reply = () => c.json({ ok: true, message: FORGOT_PASSWORD_NOTICE });
    if (!EMAIL_RE.test(email)) return reply();
    const h = await sha256Hex(email);
    if (secondsSince(store.lastRequest('forgot', h), now) < RECOVERY_REQUEST_MINUTES * 60) return reply(); // 조용히 무시
    store.setLastRequest('forgot', h, now.toISOString());
    const user = store.findUserByEmail(email);
    if (!user?.emailVerified) {
      await deps.passwordsFor(c).hash(randomToken()); // 계정 유무에 따른 응답 시간 차이를 줄인다
      return reply();
    }
    const password = randomRecoveryPassword();
    store.setRecovery(user.id, {
      hash: await deps.passwordsFor(c).hash(password), used: false, createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + RECOVERY_TTL_MINUTES * 60_000).toISOString(),
    });
    try { await mailer(c).send(recoveryMail(user.email, password)); } catch { /* 오류 code 는 메일러가 남겼다 */ }
    return reply();
  });

  app.post('/api/auth/password', async (c) => {
    const u = deps.requireUser(c);
    const b = await readJson(c);
    const current = text(b.currentPassword);
    const next = text(b.newPassword);
    const pe = passwordErrors(next, text(b.newPasswordConfirm), 'newPassword');
    if (pe) throw pe;
    const store = c.get('store');
    const now = c.get('now');
    const wrong = new HttpError(400, 'validation', '현재 비밀번호가 맞지 않아요', [{ field: 'currentPassword', message: '현재 비밀번호가 맞지 않아요' }] as never);
    const pw = deps.passwordsFor(c);
    const isCurrent = await pw.verify(current, u.passwordHash);
    if (!isCurrent) {
      // 복구 비밀번호로 연 세션이면 복구 비밀번호를 현재 비밀번호로 인정한다.
      const rec = u.mustChangePassword ? store.recovery(u.id) : undefined;
      if (!rec || Date.parse(rec.expiresAt) <= now.getTime() || !(await pw.verify(current, rec.hash))) throw wrong;
    }
    if (next === current || (await pw.verify(next, u.passwordHash))) {
      throw new HttpError(400, 'validation', '새 비밀번호는 현재 비밀번호와 달라야 해요', [{ field: 'newPassword', message: '새 비밀번호는 현재 비밀번호와 달라야 해요' }] as never);
    }
    const stored = store.findUser(u.id)!;
    store.addUser({ ...stored, passwordHash: await pw.hash(next), mustChangePassword: false });
    store.deleteRecovery(u.id);
    const token = getCookie(c, SESSION_COOKIE) ?? '';
    store.clearSessionMustChange(token);
    store.deleteOtherSessions(u.id, token);
    return c.json({ ok: true });
  });

  // ---- 내 정보: 기본 정보 (탐색 조건 확인의 기본값) ----
  app.get('/api/me/profile', (c) => c.json({ profile: c.get('store').basicProfile(deps.requireUser(c).id) }));

  app.put('/api/me/profile', async (c) => {
    const u = deps.requireUser(c);
    const b = await readJson(c);
    const patch = b.profile;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw bad('profile이 필요해요');
    const p = patch as Record<string, unknown>;
    const next: BasicProfile = { ...c.get('store').basicProfile(u.id) };
    const errors: { field: string; message: string }[] = [];
    const fail = (field: string, message: string) => errors.push({ field, message });
    if ('age' in p) {
      if (p.age === null) next.age = null;
      else if (typeof p.age === 'number' && Number.isInteger(p.age) && p.age >= 0 && p.age <= 120) next.age = p.age;
      else fail('age', '나이는 0~120 사이 정수예요');
    }
    if ('residence' in p) {
      if (p.residence === null) next.residence = null;
      else if (typeof p.residence === 'string' && ([...RESIDENCE_OPTIONS, ...BUSAN_DISTRICTS] as readonly string[]).includes(p.residence)) next.residence = p.residence;
      else fail('residence', '거주지 값이 올바르지 않아요');
    }
    if ('hasBusiness' in p) {
      if (p.hasBusiness === null || typeof p.hasBusiness === 'boolean') next.hasBusiness = p.hasBusiness;
      else fail('hasBusiness', '사업자등록 여부는 예·아니오예요');
    }
    if ('occupation' in p) {
      if (p.occupation === null) next.occupation = null;
      else if (typeof p.occupation === 'string' && (OCCUPATIONS as readonly string[]).includes(p.occupation)) next.occupation = p.occupation;
      else fail('occupation', '직업 값이 올바르지 않아요');
    }
    if (errors.length) throw new HttpError(400, 'validation', errors.map((e) => e.message).join(' '), errors as never);
    next.updatedAt = c.get('now').toISOString();
    c.get('store').setBasicProfile(u.id, next);
    return c.json({ profile: next });
  });

  app.delete('/api/me', (c) => {
    const u = deps.requireUser(c);
    c.get('store').deleteUser(u.id);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });
}

/** 기본 정보를 탐색 조건의 기본값으로 바꾼다 (직업 → affiliation). 채운 칸이 없으면 undefined. */
export function conditionsFromProfile(p: BasicProfile): UserConditions | undefined {
  const out: UserConditions = {};
  if (p.age !== null) out.age = p.age;
  if (p.residence !== null) out.residence = p.residence;
  if (p.hasBusiness !== null) out.hasBusiness = p.hasBusiness;
  if (p.occupation !== null) out.affiliation = p.occupation;
  return Object.keys(out).length ? out : undefined;
}
