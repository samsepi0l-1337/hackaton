// 저장소. 지금은 메모리. D1/KV로 바꿀 때 이 모듈만 바꾼다.
import {
  SEED_AGENCIES, SEED_USERS, seedPrograms,
  type Agency, type Application, type ChatMessage, type ConsultProfile, type IdeaSummary, type MentorStep,
  type PlanItem, type Program, type User,
} from '@gil/shared';
import { hashPassword } from './password';

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
  getApplication(id: string): Application | undefined;
  saveApplication(a: Application): void;
}

export async function createStore(now: Date): Promise<Store> {
  const users = new Map<string, UserRecord>();
  const sessions = new Map<string, string>();
  const mentors = new Map<string, MentorState>();
  const apps = new Map<string, Application>();

  for (const s of SEED_USERS) {
    users.set(s.id, { id: s.id, email: s.email, isTeam: s.isTeam, createdAt: now.toISOString(), passwordHash: await hashPassword(s.password) });
    if (s.profile) mentors.set(s.id, emptyMentor({ ...s.profile }));
  }

  return {
    programs: seedPrograms(now),
    agencies: SEED_AGENCIES,
    findUser: (id) => users.get(id),
    findUserByEmail: (email) => [...users.values()].find((u) => u.email === email),
    allUsers: () => [...users.values()],
    addUser: (u) => { users.set(u.id, u); },
    deleteUser(id) {
      users.delete(id);
      mentors.delete(id);
      for (const [t, uid] of sessions) if (uid === id) sessions.delete(t);
      for (const [aid, a] of apps) if (a.userId === id) apps.delete(aid);
    },
    createSession: (t, uid) => { sessions.set(t, uid); },
    userIdOfSession: (t) => sessions.get(t),
    deleteSession: (t) => { sessions.delete(t); },
    mentor(userId) {
      let m = mentors.get(userId);
      if (!m) { m = emptyMentor(); mentors.set(userId, m); }
      return m;
    },
    allMentors: () => [...mentors.values()],
    setMentor: (uid, m) => { mentors.set(uid, m); },
    applicationsOf: (uid) => [...apps.values()].filter((a) => a.userId === uid).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    allApplications: () => [...apps.values()],
    getApplication: (id) => apps.get(id),
    saveApplication: (a) => { apps.set(a.id, a); },
  };
}
