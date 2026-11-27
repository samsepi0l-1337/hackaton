// Solar 독립 평가. 운영과 같은 코드(프롬프트·모델·시간 제한·사실 검사)를 부르고, 손으로 붙인 정답(labels.json)과 비교한다.
// 실행: EVAL_DEV_VARS=<.dev.vars 경로> bun apps/api/scripts/eval/run.ts
// 키는 .dev.vars 에서 UPSTAGE_API_KEY 만 읽어 메모리에 둔다. 출력·파일에 쓰지 않는다.
import { READINESS_OPTIONS, reasonFor, recommendResources, type Program, type ReadinessStage, type Resource } from '@gil/shared';
import { createDecide } from '../../src/ai/decide';
import { createTextAi, type TextAi } from '../../src/ai/solar';
import { exploreAi } from '../../src/explore/ai';
import labels from './labels.json';
import postingsFile from './data/postings.json';

const MAX_CALLS = 300;
const here = new URL('.', import.meta.url).pathname;

async function loadKey(): Promise<string> {
  if (process.env.UPSTAGE_API_KEY) return process.env.UPSTAGE_API_KEY;
  const path = process.env.EVAL_DEV_VARS ?? `${here}../../.dev.vars`;
  const text = await Bun.file(path).text();
  const line = text.split('\n').find((l) => l.startsWith('UPSTAGE_API_KEY='));
  const key = line?.slice('UPSTAGE_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
  if (!key) throw new Error('UPSTAGE_API_KEY 없음');
  return key;
}

type Persona = (typeof labels.personas)[number];
const P = labels.postings as Record<string, { id: string; type: string; also?: string[] }>;
const byId = new Map((postingsFile.items as unknown as Resource[]).map((r) => [r.id, r]));
const res = (k: string) => byId.get(P[k]!.id)!;
const keyOf = new Map(Object.entries(P).map(([k, v]) => [v.id, k]));
const NOW = new Date('2026-11-27T03:00:00Z');

// ---- 호출 기록 ---- (원문 기록을 행에 맞추려고 이유·질문·요약은 차례로 부른다)
let calls = 0;
const warns: string[] = [];
console.warn = (...a: unknown[]) => { warns.push(a.map(String).join(' ')); };
interface Rec { task: string; ms: number; raw: string | null; warn: string | null }
const recs: Rec[] = [];
function wrap(ai: TextAi): TextAi {
  return {
    mode: ai.mode,
    async generate(task, messages, meta) {
      if (++calls > MAX_CALLS) throw new Error('호출 한도 초과');
      const before = warns.length;
      const t0 = performance.now();
      const raw = await ai.generate(task, messages, meta);
      recs.push({ task, ms: performance.now() - t0, raw, warn: warns.slice(before).join(' | ') || null });
      return raw;
    },
  };
}
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const j = i++; out[j] = await fn(items[j]!); } }));
  return out;
}
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]!) : null; };
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r3 = (x: number) => Math.round(x * 1000) / 1000;

const contextOf = (p: Persona) => [
  `준비 상태: ${READINESS_OPTIONS.find((o) => o.value === p.readiness)?.label ?? '미정'}`,
  `하고 싶은 일: ${p.idea || '미정'}`,
  `검토 지역: ${p.residence}`,
  '선택한 문제 없음',
  `사용자 답변: direction=${p.direction}`,
].join('\n');

async function main() {
  const key = await loadKey();
  const env = { AI_MODE: 'upstage', UPSTAGE_API_KEY: key, DECIDE_ENABLED: '1' } as const;
  const text = wrap(createTextAi(env));
  const decide = createDecide(env);
  const xai = exploreAi(text, () => true, 'eval', NOW.getTime());
  const cand = labels.decideCandidates.map(res);
  const programs = cand.map((r) => ({ id: r.id, title: r.title, category: r.type, content: r.content } as unknown as Program));

  // ---- (1) 관련도: Decide (운영 형식 / 정보 추가) vs 규칙 vs 무작위 ----
  const decideRows = await pool(labels.personas, 3, async (p) => {
    const rel = new Set(p.relevant);
    const score = (top: string[]) => {
      const hit = top.filter((k) => rel.has(k)).length;
      return { top, p3: hit / 3, hit: hit > 0 ? 1 : 0, recall: hit / Math.min(3, rel.size) };
    };
    const states = {
      prod: `아이디어: ${p.idea}\n문제: \n고객: \n업종: \n필요한 지원: ${p.direction}`,
      rich: `나이 ${p.age}세, 거주 ${p.residence}, ${p.hasBusiness ? '사업자 있음' : '예비창업자'}\n아이디어: ${p.idea || '아직 없음'}\n원하는 도움: ${p.direction}`,
    };
    const out: Record<string, unknown> = { key: p.key, relevant: p.relevant, random: { p3: rel.size / cand.length } };
    for (const [name, state] of Object.entries(states)) {
      calls++;
      const t0 = performance.now();
      const probs = await decide.relevance(state, programs);
      const ms = performance.now() - t0;
      const top = probs ? Object.entries(probs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => keyOf.get(id)!) : [];
      out[name] = { ...score(top), ms: Math.round(ms), failed: probs === null };
    }
    const rule = recommendResources({ readiness: p.readiness as ReadinessStage, direction: p.direction, reviewRegion: p.residence, conditions: { age: p.age, residence: p.residence, hasBusiness: p.hasBusiness }, now: NOW, resources: cand, problems: [] });
    out.rule = score(rule.items.map((x) => keyOf.get(x.resource.id)!));
    return out;
  });

  // ---- (2) 추천 이유 (Solar Mini, 운영 exploreAi.reason) ----
  const reasonJobs = labels.personas.flatMap((p) => p.relevant.slice(0, 3).map((k) => ({ p, k })));
  const reasonRows = await pool(reasonJobs, 1, async ({ p, k }) => {
    const r = res(k);
    const rule = reasonFor(r, p.readiness as ReadinessStage, false);
    const before = recs.length;
    const kept = await xai.reason(r, rule, contextOf(p));
    const rec = recs.slice(before).find((x) => x.task === 'reason');
    const raw = rec?.raw ?? null;
    const digits = raw ? (raw.match(/\d[\d,.]*\s*(만|억|원|일|월|년|%|세|명)/g) ?? []).filter((m) => !(r.content + (r.target ?? '')).includes(m.replace(/\s/g, ''))) : [];
    return {
      key: p.key, posting: k, ms: Math.round(rec?.ms ?? 0), raw, kept,
      failed: raw === null, timeout: !!rec?.warn?.includes('timeout'), guardRejected: raw !== null && kept === null,
      agencyNamed: !!raw && !!r.agency && raw.includes(r.agency), regionReason: !!raw && /지역이라서|부산이라서|지역에 있어서/.test(raw), unsupportedNumbers: digits,
    };
  });

  // ---- (3) 질문 말투 (Solar Mini, 운영 exploreAi.question) ----
  const BASE_Q = '그 일로 가장 먼저 도와주고 싶은 사람은 누구인가요?';
  const questionRows = await pool(labels.personas, 1, async (p) => {
    const before = recs.length;
    const q = await xai.question(BASE_Q, p.direction);
    const rec = recs.slice(before).find((x) => x.task === 'mentor');
    return { key: p.key, ms: Math.round(rec?.ms ?? 0), raw: rec?.raw ?? null, out: q.text, usedAi: q.text !== BASE_Q, endsWithQuestion: /[?？]\s*$/.test(q.text), failed: q.failed };
  });

  // ---- (4) 요약 칸 채우기 (Solar Pro, 운영 exploreAi.fill) ----
  const fillPersonas = labels.personas.filter((p) => ['A', 'B', 'C', 'F', 'H', 'K'].includes(p.key));
  const fillRows = await pool(fillPersonas, 1, async (p) => {
    const before = recs.length;
    const f = await xai.fill(contextOf(p), [p.idea, p.direction], { target: true, value: true });
    const rec = recs.slice(before).find((x) => x.task === 'summary');
    const raw = rec?.raw ?? null;
    let json: Record<string, unknown> | null = null;
    try { const m = raw?.match(/[{][\s\S]*[}]/); json = m ? JSON.parse(m[0]) : null; } catch { json = null; }
    const wanted = ['target', 'value', 'hypotheses', 'regional'];
    return {
      key: p.key, ms: Math.round(rec?.ms ?? 0), failed: raw === null, timeout: !!rec?.warn?.includes('timeout'),
      jsonValid: json !== null, keysPresent: json ? wanted.filter((k) => typeof json![k] === 'string' && (json![k] as string).trim()).length : 0,
      kept: Object.keys(f.fill).length + (f.regionalHypothesis ? 1 : 0), fill: f.fill, regional: f.regionalHypothesis ?? null,
    };
  });

  // ---- (5) 공고 유형 분류: Solar Mini vs 손 정답 vs 규칙 ----
  const TYPES = ['교육', '상담', '공간', '지원사업'];
  const classRows = await pool(Object.keys(P), 4, async (k) => {
    const r = res(k);
    const raw = await text.generate('reason', [
      { role: 'system', content: '창업 지원 공고를 하나의 유형으로 분류해요. 교육(강의·특강·워크숍), 상담(멘토링·컨설팅·자문), 공간(입주·사무실·시설·장비 이용), 지원사업(자금·투자·바우처·경진대회·행사·홍보) 중 하나의 단어만 출력해요.' },
      { role: 'user', content: `제목: ${r.title}\n대상: ${r.target ?? ''}\n내용: ${r.content}` },
    ]);
    const ai = TYPES.find((t) => raw?.includes(t)) ?? null;
    const gold = [P[k]!.type, ...(P[k]!.also ?? [])];
    return { key: k, gold: P[k]!.type, accept: gold, rule: r.type, ai, aiOk: !!ai && gold.includes(ai), ruleOk: gold.includes(r.type), aiStrict: ai === P[k]!.type, ruleStrict: r.type === P[k]!.type };
  });

  // ---- 집계 ----
  const agg = (name: 'prod' | 'rich' | 'rule') => {
    const xs = decideRows.map((r) => r[name] as { p3: number; hit: number; recall: number });
    return { p3: r3(mean(xs.map((x) => x.p3))), hit3: r3(mean(xs.map((x) => x.hit))), recall3: r3(mean(xs.map((x) => x.recall))) };
  };
  const decideMs = decideRows.flatMap((r) => ['prod', 'rich'].map((n) => (r[n] as { ms: number }).ms));
  const reasonMs = reasonRows.map((r) => r.ms);
  const summary = {
    calls, maxCalls: MAX_CALLS,
    decide: { prod: agg('prod'), rich: agg('rich'), rule: agg('rule'), random: { p3: r3(mean(decideRows.map((r) => (r.random as { p3: number }).p3))) },
      failed: decideRows.flatMap((r) => ['prod', 'rich'].map((n) => (r[n] as { failed: boolean }).failed)).filter(Boolean).length, p50: pct(decideMs, 0.5), p95: pct(decideMs, 0.95) },
    reason: { n: reasonRows.length, failed: reasonRows.filter((r) => r.failed).length, timeout: reasonRows.filter((r) => r.timeout).length,
      guardRejected: reasonRows.filter((r) => r.guardRejected).length, agencyNamed: reasonRows.filter((r) => r.agencyNamed).length,
      regionReason: reasonRows.filter((r) => r.regionReason).length, unsupportedNumbers: reasonRows.filter((r) => r.unsupportedNumbers.length).length,
      p50: pct(reasonMs, 0.5), p95: pct(reasonMs, 0.95) },
    question: { n: questionRows.length, usedAi: questionRows.filter((r) => r.usedAi).length, failed: questionRows.filter((r) => r.failed).length, p50: pct(questionRows.map((r) => r.ms), 0.5), p95: pct(questionRows.map((r) => r.ms), 0.95) },
    fill: { n: fillRows.length, jsonValid: fillRows.filter((r) => r.jsonValid).length, failed: fillRows.filter((r) => r.failed).length, timeout: fillRows.filter((r) => r.timeout).length,
      keysPresent: fillRows.reduce((a, r) => a + r.keysPresent, 0), keptAfterGuard: fillRows.reduce((a, r) => a + r.kept, 0), keysAsked: fillRows.length * 4, p50: pct(fillRows.map((r) => r.ms), 0.5), p95: pct(fillRows.map((r) => r.ms), 0.95) },
    classify: { n: classRows.length, ai: classRows.filter((r) => r.aiOk).length, rule: classRows.filter((r) => r.ruleOk).length, aiStrict: classRows.filter((r) => r.aiStrict).length, ruleStrict: classRows.filter((r) => r.ruleStrict).length, aiNoAnswer: classRows.filter((r) => !r.ai).length },
  };
  await Bun.write(`${here}results.json`, JSON.stringify({ ranAt: new Date().toISOString(), summary, decideRows, reasonRows, questionRows, fillRows, classRows }, null, 1) + '\n');
  console.log(JSON.stringify(summary, null, 1));
}

main().catch((e) => { console.log(`평가 실패: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
