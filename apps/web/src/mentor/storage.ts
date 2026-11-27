import type { EvidenceLevel, ExploreStep, ProblemCard, StartProfile, SummaryV2 } from '@gil/shared';

/** F9: 새로고침 복구용. 현재 기기·브라우저에만 남고 다른 기기에서는 이어지지 않는다. */
const KEY = 'gil.explore.v1';

export interface ProblemInfo {
  id: string;
  title: string;
  industry: string;
  region: string;
  source: string | null;
  sourceDate: string | null;
  evidenceLevel: EvidenceLevel;
}
export interface Snapshot {
  view: ExploreStep;
  start: StartProfile;
  summary: SummaryV2 | null;
  problem: ProblemInfo | null;
}

export function toInfo(p: ProblemCard): ProblemInfo {
  return { id: p.id, title: p.title, industry: p.industryTags.join('·'), region: p.region, source: p.sourceRef, sourceDate: p.sourceDate, evidenceLevel: p.evidenceLevel };
}

export function loadSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch { return null; }
}
export function saveSnapshot(s: Snapshot): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 저장소를 쓸 수 없어도 흐름은 계속된다 */ }
}
export function clearSnapshot(): void {
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
}
