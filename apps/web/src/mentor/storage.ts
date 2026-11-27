import type {
  ChatMessage, ConsultQuota, EvidenceLevel, Exploration, ExploreFeedbackRequest, ExploreOptionsResponse, ExploreResultResponse,
  ExploreStep, ProblemCard, RegionalContextCard, StartProfile, SummaryV2,
} from '@gil/shared';

/**
 * F9: 새로고침 복구용. 현재 기기·브라우저에만 남고 다른 기기에서는 이어지지 않는다.
 * v2 한 키에 모두 모은다. 읽기·쓰기는 전부 try/catch 로 감싸고, 크기가 크면 오래된 대화부터 줄인다.
 */
const KEY = 'gil.explore.v2';
const KEY_V1 = 'gil.explore.v1';
// 창업 준비 기록만 지운다. 유형 검사 결과(gil.typeTest)·브라우저 AI 설정(gil.localai.off)은 계정과 무관하다.
const PREFIX = 'gil.explore.';
export const MAX_MESSAGES = 100;
const MAX_BYTES = 400_000;

export interface ProblemInfo {
  id: string;
  title: string;
  industry: string;
  region: string;
  source: string | null;
  sourceDate: string | null;
  evidenceLevel: EvidenceLevel;
}

export function toInfo(p: ProblemCard): ProblemInfo {
  return { id: p.id, title: p.title, industry: p.industryTags.join('·'), region: p.region, source: p.sourceRef, sourceDate: p.sourceDate, evidenceLevel: p.evidenceLevel };
}

export interface Store {
  v: 2;
  view: ExploreStep;
  start: StartProfile;
  problem: ProblemCard | null; // 고른 카드 전체 (제목·근거·출처 포함)
  exploration: Exploration | null;
  messages: ChatMessage[];
  questionIndex: number;
  draft: string; // 보내지 않은 답변
  suggestions: string[];
  summary: SummaryV2 | null;
  regional: RegionalContextCard | null;
  result: ExploreResultResponse | null; // 준비사항·자원·맥락·현장 질문·안내 문구
  prepDone: Record<string, boolean>;
  fieldEdits: Record<string, string>; // 현장 질문 id → 내가 고친 문장
  feedback: ExploreFeedbackRequest;
  quota: ConsultQuota | null;
  options: ExploreOptionsResponse | null; // 서버 응답 전에도 시작 화면을 그리려고 둔다
  startedAt: string | null;
  updatedAt: string | null; // 이 기기에 마지막으로 쓴 시각
  serverUpdatedAt: string | null; // 마지막으로 맞춘 서버 세션 시각
}

export const emptyStore = (): Store => ({
  v: 2, view: 'start', start: {}, problem: null, exploration: null, messages: [], questionIndex: 0, draft: '', suggestions: [],
  summary: null, regional: null, result: null, prepDone: {}, fieldEdits: {}, feedback: {}, quota: null, options: null,
  startedAt: null, updatedAt: null, serverUpdatedAt: null,
});

/** 이 기기에 사용자가 남긴 진행 기록이 있는지. */
export function hasLocalProgress(s: Store): boolean {
  return !!(s.start.readiness || s.start.idea || s.start.interests?.length || s.exploration || s.messages.length || s.summary);
}

/** 이 기기에 저장되는 항목 (안내 문구용). */
export const STORED_ITEMS = [
  '시작 정보', '고른 문제 카드', '탐색 방향', '대화 내용(최근 100개)', '보내지 않은 답변', '구상 요약',
  '준비사항·지원 경로 결과', '준비 완료 표시', '현장 질문 수정본', '의견 초안', '남은 상담 횟수', '저장 시각',
];

interface V1 { view?: ExploreStep; start?: StartProfile; summary?: SummaryV2 | null; problem?: ProblemInfo | null }

let cache: Store | null = null;

function trim(s: Store): Store {
  const t = { ...s, messages: s.messages.slice(-MAX_MESSAGES) };
  return t;
}

function fromStorage(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Store>;
      if (p && p.v === 2) return { ...emptyStore(), ...p };
    }
    const old = localStorage.getItem(KEY_V1);
    if (old) {
      const o = JSON.parse(old) as V1;
      const migrated: Store = { ...emptyStore(), view: o.view ?? 'start', start: o.start ?? {}, summary: o.summary ?? null, updatedAt: new Date().toISOString() };
      // v1 은 카드 일부만 있었다. 카드 전체는 복원할 수 없으므로 버린다.
      write(migrated);
      localStorage.removeItem(KEY_V1);
      return migrated;
    }
  } catch { /* 깨진 저장본은 없는 것으로 본다 */ }
  return emptyStore();
}

function write(s: Store): void {
  try {
    let t = trim(s);
    let json = JSON.stringify(t);
    if (json.length > MAX_BYTES) {
      t = { ...t, messages: t.messages.slice(-30), result: t.result ? { ...t.result, contexts: t.result.contexts.slice(0, 3) } : null };
      json = JSON.stringify(t);
    }
    if (json.length > MAX_BYTES) { t = { ...t, messages: t.messages.slice(-10), result: null }; json = JSON.stringify(t); }
    localStorage.setItem(KEY, json);
  } catch { /* 저장소를 쓸 수 없어도 흐름은 계속된다 */ }
}

export function readStore(): Store {
  if (!cache) cache = fromStorage();
  return cache;
}

export function patchStore(patch: Partial<Store>): Store {
  const cur = readStore();
  const now = new Date().toISOString();
  cache = { ...cur, ...patch, startedAt: cur.startedAt ?? now, updatedAt: now };
  write(cache);
  return cache;
}

/** 서버가 새 세션을 돌려줬을 때 서버 쪽 값을 반영한다. 이 기기에만 있는 값(수정본·의견 초안·준비 표시)은 남긴다. */
export function adoptServer(patch: Partial<Store>, serverUpdatedAt: string | null): Store {
  return patchStore({ ...patch, serverUpdatedAt });
}

/** 초기화: 이 앱이 쓴 gil.* 키를 모두 지운다. */
export function clearSnapshot(): void {
  cache = null;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) keys.push(k); }
    for (const k of keys) localStorage.removeItem(k);
  } catch { /* 무시 */ }
  cache = emptyStore();
}
