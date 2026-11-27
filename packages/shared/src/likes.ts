// 관심 표시(하트). 사용자가 하트를 누른 자료의 특징(도움 종류·산업·유형·기관)으로 비슷한 자료를 앞으로 올린다.
// 자료 id 가 아니라 특징을 본다. 추천 후보를 새로 만들지는 않는다 (조건·단계 필터를 통과한 자료의 순서에만 쓴다).
import type { Resource } from './explore';

export const LIKES_MAX = 200;

export interface LikeProfile {
  /** 하트 누른 자료 수 */
  count: number;
  caps: Map<string, number>;
  industries: Map<string, number>;
  types: Map<string, number>;
  agencies: Map<string, number>;
  ids: Set<string>;
}

const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

export function likeProfile(liked: readonly Resource[]): LikeProfile {
  const p: LikeProfile = { count: liked.length, caps: new Map(), industries: new Map(), types: new Map(), agencies: new Map(), ids: new Set() };
  for (const r of liked) {
    p.ids.add(r.id);
    for (const t of r.capabilityTags) bump(p.caps, t);
    for (const t of r.industryTags) bump(p.industries, t);
    bump(p.types, r.type);
    if (r.agency) bump(p.agencies, r.agency);
  }
  return p;
}

/**
 * 하트 누른 자료와 비슷한 정도 (0..1). 하트가 없으면 0.
 * 가중치: 도움 종류 0.4, 산업 0.3, 유형 0.2, 같은 기관 0.1. 각 항목은 하트 누른 자료 중 같은 특징의 비율.
 */
export function likeSimilarity(r: Resource, p: LikeProfile | null | undefined): number {
  if (!p || p.count === 0) return 0;
  const share = (m: Map<string, number>, keys: readonly string[]) => (keys.length ? Math.max(0, ...keys.map((k) => m.get(k) ?? 0)) / p.count : 0);
  const s = 0.4 * share(p.caps, r.capabilityTags) + 0.3 * share(p.industries, r.industryTags) + 0.2 * share(p.types, [r.type]) + 0.1 * share(p.agencies, r.agency ? [r.agency] : []);
  return Math.min(1, Math.round(s * 1000) / 1000);
}

/** 하트 누른 자료에서 가장 많이 나온 도움 종류·산업 (화면 안내용, 최대 3개). */
export function likeTopics(p: LikeProfile | null | undefined): string[] {
  if (!p || p.count === 0) return [];
  return [...p.caps, ...p.industries].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([k]) => k);
}
