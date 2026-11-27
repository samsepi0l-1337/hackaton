// 개선 후 재평가 (2026-11-27): 창업 준비 순위에 연결한 Decide 형식, 반응 문장 + 규칙 질문.
// 같은 정답(labels.json)·후보 26건으로 run.ts 의 결과와 비교한다. 실행: EVAL_DEV_VARS=<.dev.vars 경로> bun apps/api/scripts/eval/run-v2.ts
import { DECIDE_INSTRUCTIONS, READINESS_OPTIONS, decideChoiceText, recommendResources, type ReadinessStage, type Resource } from '@gil/shared';
import { createDecide } from '../../src/ai/decide';
import { createTextAi } from '../../src/ai/solar';
import { exploreAi } from '../../src/explore/ai';
import labels from './labels.json';
import postingsFile from './data/postings.json';

const here = new URL('.', import.meta.url).pathname;
const MAX_CALLS = 80;
let calls = 0;
async function loadKey(): Promise<string> {
  const text = await Bun.file(process.env.EVAL_DEV_VARS ?? `${here}../../.dev.vars`).text();
  const key = text.split('\n').find((l) => l.startsWith('UPSTAGE_API_KEY='))?.slice(16).trim().replace(/^["']|["']$/g, '');
  if (!key) throw new Error('UPSTAGE_API_KEY 없음');
  return key;
}
const P = labels.postings as Record<string, { id: string }>;
const byId = new Map((postingsFile.items as unknown as Resource[]).map((r) => [r.id, r]));
const keyOf = new Map(Object.entries(P).map(([k, v]) => [v.id, k]));
const cand = labels.decideCandidates.map((k) => byId.get(P[k]!.id)!);
const NOW = new Date('2026-11-27T03:00:00Z');
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]!) : null; };
const BASE_Q = '그 일로 가장 먼저 도와주고 싶은 사람은 누구인가요?';

async function main() {
  const env = { AI_MODE: 'upstage', UPSTAGE_API_KEY: await loadKey(), DECIDE_ENABLED: '1' } as const;
  const decide = createDecide(env);
  const text = createTextAi(env);
  const counted = { mode: text.mode, generate: (...a: Parameters<typeof text.generate>) => { if (++calls > MAX_CALLS) throw new Error('호출 한도 초과'); return text.generate(...a); } };
  const xai = exploreAi(counted, () => true, 'eval', NOW.getTime());
  const choices = cand.map((r) => ({ id: r.id, text: decideChoiceText(r) }));

  const decideRows = [];
  for (const run of [1, 2]) {
    for (const p of labels.personas) {
      const rel = new Set(p.relevant);
      const score = (top: string[]) => { const hit = top.filter((k) => rel.has(k)).length; return { top, p3: hit / 3, hit: hit > 0 ? 1 : 0, first: rel.has(top[0] ?? '') ? 1 : 0 }; };
      // 운영(routes.ts decideRank)과 같은 모양의 입력
      const state = [
        `준비 상태: ${READINESS_OPTIONS.find((o) => o.value === p.readiness)?.label ?? '미정'}`,
        `하고 싶은 일: ${p.idea || '미정'}`, `검토 지역: ${p.residence}`, '선택한 문제 없음',
        `접근 방향: ${p.direction}`,
        `사용자 정보: 나이 ${p.age}세, 거주 ${p.residence}, ${p.hasBusiness ? '사업자 있음' : '사업자 없음(예비창업자)'}`,
      ].join('\n');
      calls++;
      const t0 = performance.now();
      const probs = await decide.rank(state, choices, DECIDE_INSTRUCTIONS);
      const ms = Math.round(performance.now() - t0);
      // 운영 경로: 관련도를 넣은 recommendResources (마감·조건 불일치·관련도 낮음 제외)
      const rec = recommendResources({ readiness: p.readiness as ReadinessStage, direction: p.direction, reviewRegion: p.residence, conditions: { age: p.age, residence: p.residence, hasBusiness: p.hasBusiness }, now: NOW, resources: cand, problems: [], relevance: probs });
      const rule = recommendResources({ readiness: p.readiness as ReadinessStage, direction: p.direction, reviewRegion: p.residence, conditions: { age: p.age, residence: p.residence, hasBusiness: p.hasBusiness }, now: NOW, resources: cand, problems: [] });
      decideRows.push({ run, key: p.key, ms, failed: probs === null, ai: score(rec.items.map((x) => keyOf.get(x.resource.id)!)), rule: score(rule.items.map((x) => keyOf.get(x.resource.id)!)) });
    }
  }
  const questionRows = [];
  for (const p of labels.personas) {
    const t0 = performance.now();
    const q = await xai.question(BASE_Q, p.direction);
    questionRows.push({ key: p.key, ms: Math.round(performance.now() - t0), out: q.text, keepsQuestion: q.text.endsWith(BASE_Q), reaction: q.text === BASE_Q ? null : q.text.slice(0, -BASE_Q.length).trim(), failed: q.failed });
  }
  const agg = (k: 'ai' | 'rule') => ({ p3: r3(mean(decideRows.map((r) => r[k].p3))), hit3: r3(mean(decideRows.map((r) => r[k].hit))), top1: r3(mean(decideRows.map((r) => r[k].first))), empty: decideRows.filter((r) => r[k].top.length === 0).length });
  const top2or3 = new Map<string, number>();
  for (const r of decideRows) for (const k of r.ai.top.slice(1)) top2or3.set(k, (top2or3.get(k) ?? 0) + 1);
  const summary = {
    calls,
    decide: { ai: agg('ai'), rule: agg('rule'), failed: decideRows.filter((r) => r.failed).length, p50: pct(decideRows.map((r) => r.ms), 0.5), p95: pct(decideRows.map((r) => r.ms), 0.95),
      mostRepeatedIn2nd3rd: [...top2or3].sort((a, b) => b[1] - a[1]).slice(0, 3) },
    question: { n: questionRows.length, keepsQuestion: questionRows.filter((r) => r.keepsQuestion).length, withReaction: questionRows.filter((r) => r.reaction).length, failed: questionRows.filter((r) => r.failed).length, p50: pct(questionRows.map((r) => r.ms), 0.5) },
  };
  await Bun.write(`${here}results-v2.json`, JSON.stringify({ ranAt: new Date().toISOString(), summary, decideRows, questionRows }, null, 1) + '\n');
  console.log(JSON.stringify(summary, null, 1));
  for (const q of questionRows) console.log(q.key, '|', q.reaction ?? '(반응 없음)');
}
main().catch((e) => { console.log(`평가 실패: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
