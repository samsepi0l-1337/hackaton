// F21 자료 불러오기와 참조 검사.
import problemsJson from '../data/problems.json';
import contextsJson from '../data/contexts.json';
import resourcesJson from '../data/resources.json';
import type { ProblemCard, RegionalContext, Resource } from './explore';

export const PROBLEMS = problemsJson as ProblemCard[];
export const CONTEXTS = contextsJson as RegionalContext[];
export const RESOURCES = resourcesJson as Resource[];

/** 잘못된 참조 id 목록 (화면에서는 무시하고 '확인 필요'). 테스트에서 빈 배열이어야 한다. */
export function brokenReferences(problems = PROBLEMS, contexts = CONTEXTS, resources = RESOURCES): string[] {
  const ctx = new Set(contexts.map((c) => c.id));
  const rs = new Set(resources.map((r) => r.id));
  const out: string[] = [];
  for (const p of problems) {
    for (const id of p.contextIds) if (!ctx.has(id)) out.push(`${p.id}→${id}`);
    for (const id of p.resourceIds) if (!rs.has(id)) out.push(`${p.id}→${id}`);
  }
  for (const r of resources) for (const id of r.contextIds) if (!ctx.has(id)) out.push(`${r.id}→${id}`);
  return out;
}
