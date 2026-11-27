// 저장소. 키-값 저장소(KvLike) 위에 Zod 로 검사한 레코드를 둔다.
// - 로컬·테스트: memoryKv() (Map)
// - Workers: Durable Object 의 ctx.storage.kv (SQLite, 동기 API)
// 핸들러가 객체를 직접 고치므로, 읽은 레코드는 메모리에 두고 요청이 끝날 때 flush() 로 바뀐 것만 저장한다.
import type { z } from 'zod';
import {
  SEED_AGENCIES, SEED_USERS, seedPrograms,
  type Agency, type Application, type ChatMessage, type ConsultProfile, type IdeaSummary, type MentorStep,
  type PlanItem, type Program, type User,
} from '@gil/shared';
import { hashPassword } from './password';
import { ApplicationSchema, ExploreStateSchema, MentorStateSchema, QuotaSchema, SessionSchema, UserSchema, type ExploreState } from './db/schema';

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
  createSession(token: string, userId: string): void;
  userIdOfSession(token: string): string | undefined;
  deleteSession(token: string): void;
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
  getApplication(id: string): Application | undefined;
  saveApplication(a: Application): void;
  /** 이번 요청에서 읽거나 바꾼 레코드를 검사해 저장한다. */
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

export class DbError extends Error {}

const K = {
  user: (id: string) => `user:${id}`,
  email: (e: string) => `email:${e.toLowerCase()}`,
  session: (t: string) => `session:${t}`,
  mentor: (uid: string) => `mentor:${uid}`,
  app: (id: string) => `app:${id}`,
  explore: (id: string) => `explore:${id}`,
  quota: (k: string) => `quota:${k}`,
  limitHits: 'meta:limitHits',
  seeded: 'meta:seeded',
  schema: 'meta:schema',
};

/** 저장 모양 버전. 레코드 모양을 깨는 변경을 하면 올린다. 예전 모양 레코드는 읽을 때 건너뛴다. */
export const SCHEMA_VERSION = 2;

function check<S extends z.ZodTypeAny>(schema: S, value: unknown, key: string): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw new DbError(`invalid record ${key}: ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  return r.data;
}

export async function createStore(now: Date, kv: KvLike = memoryKv()): Promise<Store> {
  // 시드 사용자는 처음 한 번만 넣는다 (Durable Object 에서는 재시작해도 남는다).
  if (!kv.get(K.seeded)) {
    for (const s of SEED_USERS) {
      if (kv.get(K.user(s.id))) continue;
      const u: UserRecord = { id: s.id, email: s.email, isTeam: s.isTeam, createdAt: now.toISOString(), passwordHash: await hashPassword(s.password) };
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
    load('user:', UserSchema, users);
    load('mentor:', MentorStateSchema, mentors as Map<string, any>);
    load('app:', ApplicationSchema, apps as Map<string, any>);
    load('explore:', ExploreStateSchema, explores);
    const prev = kv.get<number>(K.schema);
    if (skipped.length || (prev !== undefined && prev !== SCHEMA_VERSION)) console.warn(`[store] 스키마 ${prev ?? '없음'}→${SCHEMA_VERSION}, 모양이 맞지 않아 건너뛴 레코드 ${skipped.length}개${skipped.length ? `: ${skipped.slice(0, 5).join(', ')}` : ''}`);
    if (prev !== SCHEMA_VERSION) kv.put(K.schema, SCHEMA_VERSION);
  };
  loadAll();

  return {
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
      explores.delete(id);
      users.delete(id);
      mentors.delete(id);
      for (const [k, v] of kv.list<{ userId: string }>({ prefix: 'session:' })) if (v?.userId === id) kv.delete(k);
      for (const [aid, a] of apps) if (a.userId === id) { kv.delete(K.app(aid)); apps.delete(aid); }
    },
    createSession(t, uid) {
      kv.put(K.session(t), check(SessionSchema, { userId: uid, createdAt: new Date().toISOString() }, 'session'));
    },
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
}
