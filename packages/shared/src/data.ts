// F21 자료 불러오기와 참조 검사.
import problemsJson from '../data/problems.json';
import contextsJson from '../data/contexts.json';
import resourcesJson from '../data/resources.json';
import type { ProblemCard, RegionalContext, Resource } from './explore';

// 검수된 실제 자료만 data/*.json 에 둔다 (2026-11-27: [테스트] 자료 삭제). 비어 있으면 화면은 빈 상태를 보여준다.
export const PROBLEMS: ProblemCard[] = [...(problemsJson as ProblemCard[])];
export const CONTEXTS: RegionalContext[] = [...(contextsJson as RegionalContext[])];
export const RESOURCES: Resource[] = [...(resourcesJson as Resource[])];

/** 테스트 전용: 자료를 바꿔 넣는다 (배열을 그 자리에서 바꾸므로 모든 import 가 같은 값을 본다). */
export function replaceExploreData(d: { problems?: ProblemCard[]; contexts?: RegionalContext[]; resources?: Resource[] }): void {
  if (d.problems) PROBLEMS.splice(0, PROBLEMS.length, ...d.problems);
  if (d.contexts) CONTEXTS.splice(0, CONTEXTS.length, ...d.contexts);
  if (d.resources) RESOURCES.splice(0, RESOURCES.length, ...d.resources);
}

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
