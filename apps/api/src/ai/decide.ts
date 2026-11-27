// Solar Decide 관련도. 후보 공고 id 를 선택지로 보내 확률을 받는다. 실패하면 null → 규칙 점수.
import { AI_TIMEOUT_MS, DECIDE_MAX_CHOICES, DECIDE_MODEL, UPSTAGE_BASE_URL, type Program } from '@gil/shared';
import type { Bindings } from '../env';
import { resolveMode, type AiDeps } from './solar';

export interface Decide {
  enabled: boolean;
  relevance(stateText: string, candidates: Program[]): Promise<Record<string, number> | null>;
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
  const enabled = resolveMode(env) !== 'off' && !!env.UPSTAGE_API_KEY && env.DECIDE_ENABLED === '1';
  const base = (env.UPSTAGE_BASE_URL || UPSTAGE_BASE_URL).replace(/\/+$/, '');
  return {
    enabled,
    async relevance(stateText, candidates) {
      const list = candidates.slice(0, DECIDE_MAX_CHOICES);
      if (!enabled || list.length < 2) return null;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), AI_TIMEOUT_MS);
      try {
        const criteria = Object.fromEntries(list.map((p) => [p.id, clip(`${p.title} / ${p.category} / ${p.content}`, 200)]));
        const headers: Record<string, string> = { 'content-type': 'application/json', authorization: `Bearer ${env.UPSTAGE_API_KEY}` };
        if (env.CF_AIG_TOKEN) headers['cf-aig-authorization'] = `Bearer ${env.CF_AIG_TOKEN}`;
        const res = await doFetch(`${base}/systemone`, {
          method: 'POST', headers, signal: ctl.signal,
          body: JSON.stringify({
            model: DECIDE_MODEL,
            state: clip(stateText, 2000),
            questions: { fit: { type: 'choice', instructions: '예비 창업자의 아이디어와 가장 관련이 큰 지원사업을 고르세요.', criteria } },
          }),
        });
        if (!res.ok) throw new Error(`http ${res.status}`);
        const probs = ((await res.json()) as any)?.answers?.fit?.probabilities;
        if (!probs || typeof probs !== 'object') throw new Error('no probabilities');
        const clean: Record<string, number> = {};
        for (const p of list) { const v = probs[p.id]; if (typeof v === 'number' && Number.isFinite(v)) clean[p.id] = v; }
        const out = normalizeByMax(clean);
        return Object.keys(out).length ? out : null;
      } catch (e) {
        console.warn(`[ai] decide 실패, 규칙 점수를 씁니다: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      } finally { clearTimeout(timer); }
    },
  };
}
