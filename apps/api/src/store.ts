// 저장소. 키-값 저장소(KvLike) 위에 Zod 로 검사한 레코드를 둔다.
// - 로컬·테스트: memoryKv() (Map)
// - Workers: Durable Object 의 ctx.storage.kv (SQLite, 동기 API)
// 핸들러가 객체를 직접 고치므로, 읽은 레코드는 메모리에 두고 요청이 끝날 때 flush() 로 바뀐 것만 저장한다.
import type { z } from 'zod';
import {
  EMPTY_BASIC_PROFILE, SEED_AGENCIES, SEED_USERS, seedPrograms,
  type Agency, type Application, type ChatMessage, type ConsultProfile, type IdeaSummary, type MentorStep,
  type BasicProfile, type PlanItem, type Program, type User,
} from '@gil/shared';
import { hashLegacyPassword } from './password';
import { ApplicationSchema, BasicProfileSchema, BufsLockSchema, BufsSessionSchema, FeedbackRecordSchema, ExploreStateSchema, MentorStateSchema, QuotaSchema, RecoverySchema, SessionSchema, UserSchema, VerifySchema, ViewsSchema, LikesSchema, type ExploreState, type FeedbackRecord, type RecoveryRecord, type VerifyRecord } from './db/schema';

export interface UserRecord extends User { passwordHash: string }

export interface MentorState {
  step: MentorStep;
  profile: ConsultProfile;
  messages: ChatMessage[];
  questionIndex: number;
  summary: IdeaSummary | null;
  plan: PlanItem[] | null;
  feedback: Record<string, boolean>;
  survey: boolean | null;
  updatedAt: string | null;
}

export const emptyMentor = (profile: ConsultProfile = {}): MentorState => ({
  step: 'form', profile, messages: [], questionIndex: 0, summary: null, plan: null, feedback: {}, survey: null, updatedAt: null,
});

export interface Store {
  programs: Program[];
  agencies: Agency[];
  findUser(id: string): UserRecord | undefined;
  findUserByEmail(email: string): UserRecord | undefined;
  allUsers(): UserRecord[];
  addUser(u: UserRecord): void;
  deleteUser(id: string): void; // 세션·상담·지원서까지 모두 삭제
  createSession(token: string, userId: string, mustChangePassword?: boolean): void;
  userIdOfSession(token: string): string | undefined;
  /** 이 세션이 복구 비밀번호로 열렸고 아직 비밀번호를 바꾸지 않았는가. */
  sessionMustChange(token: string): boolean;
  clearSessionMustChange(token: string): void;
  deleteSession(token: string): void;
  /** 한 사용자의 세션 중 keepToken 만 남기고 모두 지운다. */
  deleteOtherSessions(userId: string, keepToken: string): void;
  /** 이메일 인증 레코드. 토큰으로도 찾을 수 있다 (토큰 해시 → userId 색인). */
  verification(userId: string): VerifyRecord | undefined;
  userIdOfVerifyToken(tokenHash: string): string | undefined;
  setVerification(userId: string, v: VerifyRecord): void;
  deleteVerification(userId: string): void;
  recovery(userId: string): RecoveryRecord | undefined;
  setRecovery(userId: string, r: RecoveryRecord): void;
  deleteRecovery(userId: string): void;
  /** 이메일(해시)별 마지막 요청 시각. 인증 메일 다시 보내기·비밀번호 찾기 제한에 쓴다. */
  lastRequest(kind: 'verify' | 'forgot', emailHash: string): string | undefined;
  setLastRequest(kind: 'verify' | 'forgot', emailHash: string, at: string): void;
  mentor(userId: string): MentorState;
  allMentors(): MentorState[];
  setMentor(userId: string, m: MentorState): void;
  applicationsOf(userId: string): Application[];
  allApplications(): Application[];
  /** 탐색 상태 (비회원은 게스트 id, 회원은 user id). 없으면 undefined. 꺼내 가면 이번 요청에서 저장한다. */
  explore(actorId: string): ExploreState | undefined;
  allExplores(): [string, ExploreState][];
  setExplore(actorId: string, s: ExploreState): void;
  deleteExplore(actorId: string): void;
  /** 상담 횟수 제한: 키(`u:<id>`, `c:<쿠키id>`, `ip:<해시>`)별 상담 시작 시각(ISO). */
  quota(key: string): string[];
  setQuota(key: string, times: string[]): void;
  /** 상담 횟수 초과로 막은 횟수 (관리자 통계). */
  limitHits(): number;
  addLimitHit(): void;
  /** 내 정보: 기본 정보. 없으면 빈 값. */
  basicProfile(userId: string): BasicProfile;
  setBasicProfile(userId: string, p: BasicProfile): void;
  /** 의견 남기기 기록 (한 건씩). 계정을 지워도 남는다 (이메일은 가린 문자열). */
  addFeedback(r: FeedbackRecord): void;
  allFeedback(): FeedbackRecord[];
  /** /bufs 관리자: 로그인 실패 잠금(IP 해시별)과 세션. */
  bufsLock(ipHash: string): { fails: number; lockedUntil: string | null };
  setBufsLock(ipHash: string, v: { fails: number; lockedUntil: string | null }): void;
  clearBufsLock(ipHash: string): void;
  createBufsSession(token: string, expiresAt: string): void;
  bufsSessionValid(token: string, now: Date): boolean;
  deleteBufsSession(token: string): void;
  getApplication(id: string): Application | undefined;
  saveApplication(a: Application): void;
  /** 이번 요청에서 읽거나 바꾼 레코드를 검사해 저장한다. */
  /** 지원 자료 조회 수 (KV `views:<resourceId>`). */
  viewCount(resourceId: string): number;
  likes(userId: string): string[];
  setLikes(userId: string, ids: string[]): void;
  viewCounts(): Map<string, number>;
  /** 같은 보는 사람(viewer 해시)은 자료마다 VIEW_WINDOW_MS 안에 한 번만 센다. 센 경우 true. */
  recordView(resourceId: string, viewer: string, now: Date): boolean;

  flush(): void;
}

/** ctx.storage.kv 와 같은 모양의 동기 키-값 저장소. */
export interface KvLike {
  get<T = unknown>(key: string): T | undefined;
  put<T>(key: string, value: T): void;
  delete(key: string): boolean;
  list<T = unknown>(options?: { prefix?: string }): Iterable<[string, T]>;
}

export function memoryKv(): KvLike & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: <T>(k: string) => structuredClone(data.get(k)) as T | undefined,
    put: (k, v) => { data.set(k, structuredClone(v)); },
    delete: (k) => data.delete(k),
    *list<T>(o?: { prefix?: string }) {
      for (const [k, v] of [...data].sort(([a], [b]) => a.localeCompare(b))) if (!o?.prefix || k.startsWith(o.prefix)) yield [k, structuredClone(v) as T];
    },
  };
}

/** 같은 사람이 같은 자료를 다시 봐도 이 시간 안에는 조회 수를 올리지 않는다. */
export const VIEW_WINDOW_MS = 6 * 60 * 60 * 1000;

export class DbError extends Error {}

const K = {
  user: (id: string) => `user:${id}`,
  email: (e: string) => `email:${e.toLowerCase()}`,
  session: (t: string) => `session:${t}`,
  mentor: (uid: string) => `mentor:${uid}`,
  app: (id: string) => `app:${id}`,
  explore: (id: string) => `explore:${id}`,
  quota: (k: string) => `quota:${k}`,
  verify: (uid: string) => `verify:${uid}`,
  vtoken: (h: string) => `vtoken:${h}`,
  recovery: (uid: string) => `recovery:${uid}`,
  rate: (kind: string, h: string) => `rate:${kind}:${h}`,
  profile: (uid: string) => `profile:${uid}`,
  likes: (uid: string) => `likes:${uid}`,
  feedback: (id: string) => `feedback:${id}`,
  bufsLock: (h: string) => `bufslock:${h}`,
  bufs: (t: string) => `bufs:${t}`,
  views: (id: string) => `views:${id}`,
  limitHits: 'meta:limitHits',
  seeded: 'meta:seeded',
  purged: 'meta:purged-test-v1',
  schema: 'meta:schema',
};

/** 저장 모양 버전. 레코드 모양을 깨는 변경을 하면 올린다. 예전 모양 레코드는 읽을 때 건너뛴다. */
export const SCHEMA_VERSION = 2;

function check<S extends z.ZodTypeAny>(schema: S, value: unknown, key: string): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw new DbError(`invalid record ${key}: ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  return r.data;
}

export interface StoreOptions {
  /** 테스트 계정(@test.local)을 넣을지. 로컬·테스트는 true, 운영(GilApp)은 false. */
  seedUsers?: boolean;
  /** 운영 KV 에 남은 테스트 기록을 한 번 지운다 (테스트 계정과 그 기록, 예전 비회원 탐색·횟수 기록). */
  purgeTestData?: boolean;
}

export async function createStore(now: Date, kv: KvLike = memoryKv(), opts: StoreOptions = {}): Promise<Store> {
  const seedUsers = opts.seedUsers ?? true;
  // 시드 사용자는 처음 한 번만 넣는다 (Durable Object 에서는 재시작해도 남는다).
  if (seedUsers && !kv.get(K.seeded)) {
    for (const s of SEED_USERS) {
      if (kv.get(K.user(s.id))) continue;
      const u: UserRecord = { id: s.id, email: s.email, isTeam: s.isTeam, createdAt: now.toISOString(), passwordHash: await hashLegacyPassword(s.password), emailVerified: true, mustChangePassword: false };
      kv.put(K.user(u.id), check(UserSchema, u, K.user(u.id)));
      kv.put(K.email(u.email), u.id);
      if (s.profile) kv.put(K.mentor(u.id), check(MentorStateSchema, emptyMentor({ ...s.profile }), K.mentor(u.id)));
    }
    kv.put(K.seeded, now.toISOString());
  }

  // 읽은 레코드 캐시. 핸들러가 고친 객체를 flush 에서 저장한다.
  const users = new Map<string, UserRecord>();
  const mentors = new Map<string, MentorState>();
  const apps = new Map<string, Application>();
  // 이번 요청에서 꺼내 간 레코드. flush 에서 이것만 검사·저장한다.
  const touchedMentors = new Set<string>();
  const touchedApps = new Set<string>();
  const explores = new Map<string, ExploreState>();
  const touchedExplores = new Set<string>();
  // 모양이 맞지 않는 레코드(예전 스키마 등)는 건너뛴다. 하나가 깨졌다고 모든 요청이 실패하면 안 된다.
  const skipped: string[] = [];
  const load = <S extends z.ZodTypeAny>(prefix: string, schema: S, into: Map<string, z.infer<S>>) => {
    for (const [k, v] of kv.list({ prefix })) {
      const r = schema.safeParse(v);
      if (r.success) into.set(k.slice(prefix.length), r.data);
      else skipped.push(k);
    }
  };
  const loadAll = () => {
    load('user:', UserSchema, users as Map<string, any>);
    load('mentor:', MentorStateSchema, mentors as Map<string, any>);
    load('app:', ApplicationSchema, apps as Map<string, any>);
    load('explore:', ExploreStateSchema, explores);
    const prev = kv.get<number>(K.schema);
    if (skipped.length || (prev !== undefined && prev !== SCHEMA_VERSION)) console.warn(`[store] 스키마 ${prev ?? '없음'}→${SCHEMA_VERSION}, 모양이 맞지 않아 건너뛴 레코드 ${skipped.length}개${skipped.length ? `: ${skipped.slice(0, 5).join(', ')}` : ''}`);
    if (prev !== SCHEMA_VERSION) kv.put(K.schema, SCHEMA_VERSION);
  };
  loadAll();
  // 인증 기능 이전에 만든 시드 사용자는 인증된 것으로 본다.
  if (seedUsers) for (const s of SEED_USERS) {
    const u = users.get(s.id);
    if (u && !u.emailVerified) { u.emailVerified = true; kv.put(K.user(u.id), check(UserSchema, u, K.user(u.id))); }
  }

  /** 조회 중복 방지 표 (viewer 해시만 둔다). 프로세스 메모리라 재시작하면 비워진다. */
  const seenViews = new Map<string, number>();
  const store: Store = {
    programs: seedPrograms(now),
    agencies: SEED_AGENCIES,
    findUser: (id) => users.get(id),
    findUserByEmail(email) {
      const id = kv.get<string>(K.email(email));
      return id ? users.get(id) : undefined;
    },
    allUsers: () => [...users.values()],
    addUser(u) {
      kv.put(K.user(u.id), check(UserSchema, u, K.user(u.id)));
      kv.put(K.email(u.email), u.id);
      users.set(u.id, u);
    },
    deleteUser(id) {
      const u = users.get(id);
      if (u) kv.delete(K.email(u.email));
      kv.delete(K.user(id));
      kv.delete(K.mentor(id));
      kv.delete(K.explore(id));
      const v = VerifySchema.safeParse(kv.get(K.verify(id)));
      if (v.success) kv.delete(K.vtoken(v.data.tokenHash));
      kv.delete(K.verify(id));
      kv.delete(K.recovery(id));
      kv.delete(K.quota(`u:${id}`));
      kv.delete(K.profile(id));
      kv.delete(K.likes(id));
      explores.delete(id);
      users.delete(id);
      mentors.delete(id);
      for (const [k, v] of kv.list<{ userId: string }>({ prefix: 'session:' })) if (v?.userId === id) kv.delete(k);
      for (const [aid, a] of apps) if (a.userId === id) { kv.delete(K.app(aid)); apps.delete(aid); }
    },
    createSession(t, uid, mustChangePassword = false) {
      kv.put(K.session(t), check(SessionSchema, { userId: uid, createdAt: new Date().toISOString(), mustChangePassword }, 'session'));
    },
    sessionMustChange(t) {
      const s = kv.get(K.session(t));
      return s === undefined ? false : SessionSchema.safeParse(s).data?.mustChangePassword ?? false;
    },
    clearSessionMustChange(t) {
      const s = SessionSchema.safeParse(kv.get(K.session(t)));
      if (s.success) kv.put(K.session(t), { ...s.data, mustChangePassword: false });
    },
    deleteOtherSessions(userId, keep) {
      for (const [k, v] of kv.list<{ userId: string }>({ prefix: 'session:' })) if (v?.userId === userId && k !== K.session(keep)) kv.delete(k);
    },
    verification(uid) {
      const r = VerifySchema.safeParse(kv.get(K.verify(uid)));
      return r.success ? r.data : undefined;
    },
    userIdOfVerifyToken: (h) => kv.get<string>(K.vtoken(h)),
    setVerification(uid, v) {
      const old = VerifySchema.safeParse(kv.get(K.verify(uid)));
      if (old.success) kv.delete(K.vtoken(old.data.tokenHash));
      kv.put(K.verify(uid), check(VerifySchema, v, K.verify(uid)));
      kv.put(K.vtoken(v.tokenHash), uid);
    },
    deleteVerification(uid) {
      const old = VerifySchema.safeParse(kv.get(K.verify(uid)));
      if (old.success) kv.delete(K.vtoken(old.data.tokenHash));
      kv.delete(K.verify(uid));
    },
    recovery(uid) {
      const r = RecoverySchema.safeParse(kv.get(K.recovery(uid)));
      return r.success ? r.data : undefined;
    },
    setRecovery(uid, r) { kv.put(K.recovery(uid), check(RecoverySchema, r, K.recovery(uid))); },
    deleteRecovery(uid) { kv.delete(K.recovery(uid)); },
    lastRequest: (kind, h) => kv.get<string>(K.rate(kind, h)),
    setLastRequest(kind, h, at) { kv.put(K.rate(kind, h), at); },
    userIdOfSession(t) {
      const s = kv.get(K.session(t));
      return s === undefined ? undefined : SessionSchema.safeParse(s).data?.userId;
    },
    deleteSession(t) { kv.delete(K.session(t)); },
    mentor(userId) {
      let m = mentors.get(userId);
      if (!m) { m = emptyMentor(); mentors.set(userId, m); }
      touchedMentors.add(userId);
      return m;
    },
    allMentors: () => [...mentors.values()],
    setMentor(uid, m) { mentors.set(uid, m); touchedMentors.add(uid); },
    applicationsOf(uid) {
      const list = [...apps.values()].filter((a) => a.userId === uid).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      for (const a of list) touchedApps.add(a.id);
      return list;
    },
    allApplications: () => [...apps.values()],
    basicProfile(uid) {
      const r = BasicProfileSchema.safeParse(kv.get(K.profile(uid)));
      return r.success ? r.data : { ...EMPTY_BASIC_PROFILE };
    },
    setBasicProfile(uid, p) { kv.put(K.profile(uid), check(BasicProfileSchema, p, K.profile(uid))); },
    addFeedback(r) { kv.put(K.feedback(r.id), check(FeedbackRecordSchema, r, K.feedback(r.id))); },
    allFeedback() {
      const out: FeedbackRecord[] = [];
      for (const [, v] of kv.list({ prefix: 'feedback:' })) { const r = FeedbackRecordSchema.safeParse(v); if (r.success) out.push(r.data); }
      return out;
    },
    bufsLock(h) {
      const r = BufsLockSchema.safeParse(kv.get(K.bufsLock(h)));
      return r.success ? r.data : { fails: 0, lockedUntil: null };
    },
    setBufsLock(h, v) { kv.put(K.bufsLock(h), check(BufsLockSchema, v, K.bufsLock(h))); },
    clearBufsLock(h) { kv.delete(K.bufsLock(h)); },
    createBufsSession(t, expiresAt) { kv.put(K.bufs(t), check(BufsSessionSchema, { expiresAt }, K.bufs(t))); },
    bufsSessionValid(t, now) {
      const r = BufsSessionSchema.safeParse(kv.get(K.bufs(t)));
      return r.success && Date.parse(r.data.expiresAt) > now.getTime();
    },
    deleteBufsSession(t) { kv.delete(K.bufs(t)); },
    getApplication(id) {
      const a = apps.get(id);
      if (a) touchedApps.add(id);
      return a;
    },
    saveApplication(a) {
      kv.put(K.app(a.id), check(ApplicationSchema, a, K.app(a.id)));
      apps.set(a.id, a);
    },
    quota(key) {
      const r = QuotaSchema.safeParse(kv.get(K.quota(key)));
      return r.success ? r.data : [];
    },
    setQuota(key, times) { kv.put(K.quota(key), check(QuotaSchema, times, K.quota(key))); },
    likes(uid) {
      const r = LikesSchema.safeParse(kv.get(K.likes(uid)));
      return r.success ? r.data : [];
    },
    setLikes(uid, ids) {
      if (ids.length === 0) kv.delete(K.likes(uid));
      else kv.put(K.likes(uid), check(LikesSchema, ids, K.likes(uid)));
    },
    viewCount(id) {
      const r = ViewsSchema.safeParse(kv.get(K.views(id)));
      return r.success ? r.data : 0;
    },
    viewCounts() {
      const out = new Map<string, number>();
      for (const [k, v] of kv.list({ prefix: 'views:' })) { const r = ViewsSchema.safeParse(v); if (r.success) out.set(k.slice('views:'.length), r.data); }
      return out;
    },
    recordView(id, viewer, now) {
      const t = now.getTime();
      const key = `${id}|${viewer}`;
      if ((seenViews.get(key) ?? 0) > t) return false;
      if (seenViews.size > 20_000) for (const [k, until] of seenViews) if (until <= t) seenViews.delete(k);
      seenViews.set(key, t + VIEW_WINDOW_MS);
      const prev = ViewsSchema.safeParse(kv.get(K.views(id)));
      kv.put(K.views(id), check(ViewsSchema, (prev.success ? prev.data : 0) + 1, K.views(id)));
      return true;
    },
    limitHits: () => kv.get<number>(K.limitHits) ?? 0,
    addLimitHit() { kv.put(K.limitHits, (kv.get<number>(K.limitHits) ?? 0) + 1); },
    explore(id) {
      const e = explores.get(id);
      if (e) touchedExplores.add(id);
      return e;
    },
    allExplores: () => [...explores],
    setExplore(id, e) { explores.set(id, e); touchedExplores.add(id); },
    deleteExplore(id) { explores.delete(id); touchedExplores.delete(id); kv.delete(K.explore(id)); },
    flush() {
      // 바뀐 레코드만 쓴다. 비교는 직렬화 결과로 한다 (해커톤 규모에서 충분).
      for (const uid of touchedMentors) {
        const m = mentors.get(uid);
        if (!m || !users.has(uid)) continue;
        const key = K.mentor(uid);
        const v = check(MentorStateSchema, m, key);
        if (JSON.stringify(kv.get(key)) !== JSON.stringify(v)) kv.put(key, v);
      }
      for (const id of touchedApps) {
        const a = apps.get(id);
        if (!a) continue;
        const key = K.app(id);
        const v = check(ApplicationSchema, a, key);
        if (JSON.stringify(kv.get(key)) !== JSON.stringify(v)) kv.put(key, v);
      }
      for (const id of touchedExplores) {
        const e = explores.get(id);
        if (!e) continue;
        const key = K.explore(id);
        const v = check(ExploreStateSchema, e, key);
        if (JSON.stringify(kv.get(key)) !== JSON.stringify(v)) kv.put(key, v);
      }
      touchedExplores.clear();
      touchedMentors.clear();
      touchedApps.clear();
    },
  };
  if (opts.purgeTestData && !kv.get(K.purged)) purgeTestRecords(kv, store);
  return store;
}

/** 운영 KV 의 테스트 기록을 지운다 (한 번만, meta:purged-test-v1 로 표시). */
function purgeTestRecords(kv: KvLike, store: Store): void {
  let users = 0, keys = 0;
  for (const u of store.allUsers()) if (u.email.toLowerCase().endsWith('@test.local')) { store.deleteUser(u.id); users++; }
  const live = new Set(store.allUsers().map((u) => u.id));
  const drop: string[] = [];
  for (const [k] of kv.list({ prefix: 'explore:g-' })) drop.push(k); // 예전 비회원 탐색 기록
  for (const p of ['quota:c:', 'quota:ip:']) for (const [k] of kv.list({ prefix: p })) drop.push(k); // 예전 쿠키·IP 횟수
  for (const p of ['mentor:', 'explore:', 'profile:', 'likes:']) for (const [k] of kv.list({ prefix: p })) if (!live.has(k.slice(p.length))) drop.push(k);
  for (const k of drop) { kv.delete(k); keys++; }
  kv.delete(K.seeded);
  kv.put(K.purged, new Date().toISOString());
  console.log(`[store] 테스트 기록 삭제: 계정 ${users}개, 레코드 ${keys}개`);
}
