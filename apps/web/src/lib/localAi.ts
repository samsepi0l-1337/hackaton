import { guardText, LOCAL_AI_HEADER, LOCAL_AI_TASKS } from '@gil/shared';
import type { LocalAiTask } from '@gil/shared';

/**
 * Chrome 내장 Prompt API 로 문장을 다듬는다. availability 가 정확히 'available' 일 때만 쓰고,
 * 다운로드는 절대 시작하지 않는다. 실패하면 서버가 준 규칙 문장을 그대로 쓴다.
 */
const TOGGLE_KEY = 'gil.localai.off';
const TIMEOUT_MS = 5000;
const IO = [{ type: 'text' as const, languages: ['ko'] }];
export const LOCAL_AI_NOTE = '이 기기의 AI로 다듬음';
export { LOCAL_AI_HEADER };

export function localAiEnabled(): boolean {
  try { return localStorage.getItem(TOGGLE_KEY) !== '1'; } catch { return true; }
}
export function setLocalAiEnabled(on: boolean): void {
  try { if (on) localStorage.removeItem(TOGGLE_KEY); else localStorage.setItem(TOGGLE_KEY, '1'); } catch { /* 무시 */ }
  probe = null;
}

let probe: Promise<boolean> | null = null;

/** 켜져 있고, 한국어 입출력이 이미 준비된 경우에만 true. */
export function localAiAvailable(): Promise<boolean> {
  if (!localAiEnabled()) return Promise.resolve(false);
  if (!probe) {
    probe = (async () => {
      try {
        const lm = globalThis.LanguageModel;
        if (!lm || typeof lm.availability !== 'function') return false;
        return (await lm.availability({ expectedInputs: IO, expectedOutputs: IO })) === 'available';
      } catch { return false; }
    })();
  }
  return probe;
}

/** 요청 헤더 값 (예: 'mentor,reason,field'). 쓸 수 없으면 null. */
export async function localAiHeaderValue(): Promise<string | null> {
  // 'mentor'(질문)는 기기에서 다시 쓰지 않는다. 서버가 반응 문장 + 규칙 질문을 만든다.
  return (await localAiAvailable()) ? LOCAL_AI_TASKS.filter((t) => t !== 'mentor').join(',') : null;
}

const SYSTEM: Record<LocalAiTask, string> = {
  mentor: '당신은 창업 준비를 돕는 한국어 안내자입니다. 주어진 질문의 뜻을 바꾸지 말고 더 쉬운 말로 다듬어 질문 한 문장만 쓰세요. 사업 이름, 금액, 날짜, 마감은 쓰지 마세요. 설명 없이 문장만 답하세요.',
  reason: '당신은 지역 창업 지원을 안내하는 한국어 도우미입니다. 주어진 사실만 사용해 관련 이유를 1~2문장으로 쓰세요. 없는 금액, 날짜, 사업 이름을 만들지 마세요. 설명 없이 문장만 답하세요.',
  field: '당신은 현장 확인 질문을 다듬는 한국어 도우미입니다. 뜻을 바꾸지 말고, 지금 쓰는 방법이나 실제 경험을 먼저 묻게 쓰세요. 어려움이나 구매 의향이 이미 있다고 가정하지 마세요. 질문 한 문장만 답하세요.',
};

export interface RewriteInput {
  task: LocalAiTask;
  original: string;
  /** 써도 되는 사실 문장들 (공고 내용, 사용자가 적은 글 등). */
  facts?: string[];
  maxLength?: number;
}

async function once(task: LocalAiTask, prompt: string): Promise<string | null> {
  const lm = globalThis.LanguageModel;
  if (!lm) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let session: LanguageModelSession | null = null;
  try {
    session = await lm.create({
      initialPrompts: [{ role: 'system', content: SYSTEM[task] }],
      expectedInputs: IO, expectedOutputs: IO, temperature: 0.3, signal: ctl.signal,
    });
    const aborted = new Promise<never>((_, rej) => ctl.signal.addEventListener('abort', () => rej(new Error('timeout'))));
    return await Promise.race([session.prompt(prompt, { signal: ctl.signal }), aborted]);
  } catch { return null; } finally {
    clearTimeout(timer);
    try { session?.destroy(); } catch { /* 무시 */ }
  }
}

/** 다듬은 문장을 돌려준다. 어떤 이유로든 믿기 어려우면 null (호출한 쪽은 원문을 그대로 둔다). */
export async function rewrite({ task, original, facts = [], maxLength = 200 }: RewriteInput): Promise<string | null> {
  if (!original.trim() || !(await localAiAvailable())) return null;
  const out = await once(task, `원문: ${original}${facts.length ? `\n사실:\n${facts.map((f) => `- ${f}`).join('\n')}` : ''}`);
  const safe = guardText(out, { allowedText: [original, ...facts], maxLength });
  if (!safe || safe === original.trim()) return null;
  if (task !== 'reason' && (safe.match(/[?？]/g)?.length ?? 0) > 1) return null; // 질문은 한 개만
  return safe;
}
