// 문장 생성 어댑터. 어떤 실패든 null 을 돌려주고 호출한 쪽이 규칙 문장을 쓴다. 절대 throw 하지 않는다.
import { AI_GATEWAY_ID_DEFAULT, AI_ROUTE, AI_TIMEOUT_MS, AI_TIMEOUT_BY_TASK, SOLAR_MODELS, UPSTAGE_BASE_URL, type AiMetadata, type AiMode, type AiTask } from '@gil/shared';
import type { Bindings } from '../env';
import { upstageHeaders, upstageReady } from './upstage';

export interface ChatMsg { role: 'system' | 'user' | 'assistant'; content: string }
export interface AiDeps { fetch?: typeof fetch }
export interface TextAi {
  mode: AiMode;
  generate(task: AiTask, messages: ChatMsg[], meta?: { userId?: string }): Promise<string | null>;
}

export function resolveMode(env: Partial<Bindings>): AiMode {
  const m = (env.AI_MODE ?? 'off').trim().toLowerCase();
  if (m === 'upstage') return upstageReady(env) ? 'upstage' : 'off';
  if (m === 'route') return env.AI ? 'route' : 'off';
  return 'off';
}

const contentOf = (j: any): string | null => {
  const t = j?.choices?.[0]?.message?.content ?? j?.response ?? j?.result?.response;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
};

export function createTextAi(env: Partial<Bindings> = {}, deps: AiDeps = {}): TextAi {
  const mode = resolveMode(env);
  const doFetch = deps.fetch ?? fetch;
  const base = (env.UPSTAGE_BASE_URL || UPSTAGE_BASE_URL).replace(/\/+$/, '');

  const withTimeout = async <T>(run: (signal: AbortSignal) => Promise<T>, ms = AI_TIMEOUT_MS): Promise<T> => {
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => { ctl.abort(); rej(new Error('timeout')); }, ms); });
    try { return await Promise.race([run(ctl.signal), timeout]); } finally { clearTimeout(timer); }
  };

  return {
    mode,
    async generate(task, messages, meta = {}) {
      if (mode === 'off') return null;
      const metadata: AiMetadata = { app: 'gil', task, user_id: meta.userId ?? 'anon' };
      try {
        if (mode === 'route') {
          const out = await withTimeout(() => env.AI!.run(AI_ROUTE as any, { messages } as any, { gateway: { id: env.AI_GATEWAY_ID || AI_GATEWAY_ID_DEFAULT, metadata } } as any), AI_TIMEOUT_BY_TASK[task]);
          return contentOf(out);
        }
        const headers = upstageHeaders(env, { 'content-type': 'application/json', 'cf-aig-metadata': JSON.stringify(metadata) });
        return await withTimeout(async (signal) => {
          const res = await doFetch(`${base}/chat/completions`, { method: 'POST', headers, signal, body: JSON.stringify({ model: SOLAR_MODELS[task], messages }) });
          if (!res.ok) throw new Error(`http ${res.status}`);
          return contentOf(await res.json());
        }, AI_TIMEOUT_BY_TASK[task]);
      } catch (e) {
        console.warn(`[ai] ${task} 실패, 규칙 결과를 씁니다: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    },
  };
}
