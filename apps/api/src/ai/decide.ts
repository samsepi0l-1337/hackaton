// Solar Decide 관련도. 후보 공고 id 를 선택지로 보내 확률을 받는다. 실패하면 null → 규칙 점수.
import { DECIDE_ATTEMPTS, DECIDE_MAX_CHOICES, DECIDE_MODEL, DECIDE_TIMEOUT_MS, UPSTAGE_BASE_URL, type Program } from '@gil/shared';
import type { Bindings } from '../env';
import { resolveMode, type AiDeps } from './solar';
import { upstageHeaders, upstageReady } from './upstage';

/** Decide 선택지 하나: id 와 설명 글. */
export interface DecideChoice { id: string; text: string }
export interface Decide {
  enabled: boolean;
  relevance(stateText: string, candidates: Program[]): Promise<Record<string, number> | null>;
  /** 일반 선택지 관련도 (0..1, 가장 높은 것이 1). 실패·꺼짐이면 null. */
  rank(stateText: string, choices: DecideChoice[], instructions: string): Promise<Record<string, number> | null>;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);

/**
 * 확률은 후보 전체 합이 1이라 값이 작다. 점수에 쓰려면 0..1 로 펴야 하므로
 * 가장 높은 후보를 1로 두고 나머지를 비율로 나눈다(p / max). 순서는 그대로다.
 */
export function normalizeByMax(probs: Record<string, number>): Record<string, number> {
  const max = Math.max(...Object.values(probs));
  if (!(max > 0)) return {};
  return Object.fromEntries(Object.entries(probs).map(([k, v]) => [k, Math.min(1, Math.max(0, v / max))]));
}

export function createDecide(env: Partial<Bindings> = {}, deps: AiDeps = {}): Decide {
  const doFetch = deps.fetch ?? fetch;
  const enabled = resolveMode(env) !== 'off' && upstageReady(env) && env.DECIDE_ENABLED === '1';
  const base = (env.UPSTAGE_BASE_URL || UPSTAGE_BASE_URL).replace(/\/+$/, '');
  const rank = async (stateText: string, choices: DecideChoice[], instructions: string): Promise<Record<string, number> | null> => {
      const list = choices.slice(0, DECIDE_MAX_CHOICES);
      if (!enabled || list.length < 2) return null;
    const once = async (): Promise<Record<string, number> | null> => {
      const ctl = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => { ctl.abort(); rej(new Error('timeout')); }, DECIDE_TIMEOUT_MS); });
      try {
        const criteria = Object.fromEntries(list.map((p) => [p.id, clip(p.text, 240)]));
        const headers = upstageHeaders(env, { 'content-type': 'application/json', 'cf-aig-metadata': JSON.stringify({ app: 'gil', task: 'decide', user_id: 'server' }) });
        const res = await Promise.race([timeout, doFetch(`${base}/systemone`, {
          method: 'POST', headers, signal: ctl.signal,
          body: JSON.stringify({
            model: DECIDE_MODEL,
            state: clip(stateText, 2000),
            questions: { fit: { type: 'choice', instructions, criteria } },
          }),
        })]);
        if (!res.ok) throw new Error(`http ${res.status}`);
        const probs = ((await Promise.race([timeout, res.json()])) as any)?.answers?.fit?.probabilities;
        if (!probs || typeof probs !== 'object') throw new Error('no probabilities');
        const clean: Record<string, number> = {};
        for (const p of list) { const v = probs[p.id]; if (typeof v === 'number' && Number.isFinite(v)) clean[p.id] = v; }
        const out = normalizeByMax(clean);
        return Object.keys(out).length ? out : null;
      } finally { clearTimeout(timer); }
    };
      for (let i = 1; i <= DECIDE_ATTEMPTS; i++) {
        try { return await once(); } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (i === DECIDE_ATTEMPTS || !/timeout|http 5/.test(msg)) { console.warn(`[ai] decide 실패, 규칙 점수를 씁니다: ${msg}`); return null; }
        }
      }
      return null;
  };
  return {
    enabled,
    rank,
    relevance: (stateText, candidates) => rank(stateText, candidates.map((p) => ({ id: p.id, text: `${p.title} / ${p.category} / ${p.content}` })), '예비 창업자의 아이디어와 가장 관련이 큰 지원사업을 고르세요.'),
  };
}
