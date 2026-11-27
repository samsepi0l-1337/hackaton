// 탐색(F2·F3·F5)용 AI 보조. 모든 문장은 사실 검사(guard)를 거치고, 실패하면 null 을 돌려줘 규칙 문장을 쓰게 한다.
// 출처 표시(provenance)는 여기서 정하지 않는다. 호출한 쪽(코드)이 붙인다.
import { RESOURCES, type AiFill, type ProblemCard, type Resource } from '@gil/shared';
import { guardText, parseJson } from '../ai/guard';
import { SYSTEM_PROMPTS } from '../ai/prompts';
import type { TextAi } from '../ai/solar';

const RULES = '당신은 창업을 처음 생각하는 청년의 생각 정리를 돕는 한국어 도우미예요. 해요체로 짧게 써요. 점수를 매기거나 성공 가능성을 평가하거나 과하게 칭찬하지 않아요. 기관·프로그램 이름, 금액, 마감일, 날짜, 숫자를 절대 쓰지 않아요. 사용자가 말하지 않은 경험·인터뷰·매출·팀을 지어내지 않아요. 확인되지 않은 것은 가설이라고 써요.';

export interface AiCall { text: string | null; /** 한도 때문에 부르지 않음 */ limited: boolean; /** AI 가 켜져 있는데 응답이 없음 */ failed: boolean }

/** 행위자별 시간당 호출 한도. 메모리 기준(재시작하면 초기화)이라 열린 게스트가 AI 예산을 태우는 것을 막는 정도다. */
export function createLimiter(max: number, windowMs = 3_600_000) {
  const hits = new Map<string, number[]>();
  return (id: string, now: number): boolean => {
    const recent = (hits.get(id) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) { hits.set(id, recent); return false; }
    recent.push(now);
    hits.set(id, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    return true;
  };
}

export function exploreAi(ai: TextAi, allow: (id: string, now: number) => boolean, actorId: string, now: number) {
  const call = async (task: 'mentor' | 'reason' | 'summary', system: string, user: string): Promise<AiCall> => {
    if (ai.mode === 'off') return { text: null, limited: false, failed: false };
    if (!allow(actorId, now)) return { text: null, limited: true, failed: false };
    const text = await ai.generate(task, [{ role: 'system', content: system }, { role: 'user', content: user }], { userId: actorId });
    return { text, limited: false, failed: text === null };
  };
  const otherTitles = (own?: string[]) => RESOURCES.map((r) => r.title).filter((t) => !own?.includes(t));

  return {
    /** 질문 말투. 질문 뜻은 규칙이 정하고 AI 는 직전 답에 가볍게 반응하며 바꿔 말한다. */
    async question(base: string, lastAnswer: string): Promise<{ text: string; failed: boolean }> {
      const r = await call('mentor', SYSTEM_PROMPTS.mentor, `질문: ${base}\n사용자의 직전 답: ${lastAnswer || '(없음)'}`);
      return { text: guardText(r.text, { allowedText: [base, lastAnswer], knownTitles: otherTitles(), maxLength: 220 }) ?? base, failed: r.failed };
    },

    /** 접근 방향 예시 최대 2개. 사용자가 요청했을 때만 부른다. 통과한 것만 돌려준다. */
    async suggestions(context: string, userTexts: string[], avoid: string[]): Promise<{ items: string[]; failed: boolean }> {
      const r = await call('mentor', `${RULES}\n사용자가 요청해서 더 알아볼 만한 접근 방향 예시를 정확히 2개 제안해요. 사업 아이템을 확정하지 말고 "무엇을 알아볼지" 방향으로 써요. JSON 문자열 배열만 출력해요. 각 항목은 한 문장이에요.`,
        `${context}\n이미 거절한 방향(다시 쓰지 않기): ${avoid.join(' / ') || '없음'}`);
      const j = parseJson(r.text);
      const items = (Array.isArray(j) ? j : []).filter((x): x is string => typeof x === 'string')
        .map((x) => guardText(x, { allowedText: [context, ...userTexts], knownTitles: otherTitles(), maxLength: 120 }))
        .filter((x): x is string => !!x && !avoid.some((a) => a.replace(/\s/g, '') === x.replace(/\s/g, ''))).slice(0, 2);
      return { items, failed: r.failed };
    },

    /** 사용자가 말하지 않은 칸의 가설. 모든 칸은 'AI 제안·미검증'으로 표시된다. */
    async fill(context: string, userTexts: string[], want: { target: boolean; value: boolean }): Promise<{ fill: AiFill; regionalHypothesis?: string; failed: boolean }> {
      const r = await call('summary', `${RULES}\n주어진 정보로 아직 비어 있는 칸에 대한 제안만 JSON 객체로 출력해요: {"target":"도움받을 사람 가설","value":"해결해볼 불편 가설","hypotheses":"확인할 고객·시장 가설과 확인 질문","regional":"지역 고객 가설과 확인 질문"}. 모르면 빈 문자열이에요. 각 값은 한두 문장이에요.`, context);
      const j = parseJson(r.text) as Record<string, unknown> | null;
      const g = (k: string) => {
        const v = j && typeof j === 'object' ? j[k] : undefined;
        return typeof v === 'string' ? guardText(v, { allowedText: [context, ...userTexts], knownTitles: otherTitles(), maxLength: 200 }) ?? undefined : undefined;
      };
      const fill: AiFill = {};
      if (want.target) { const v = g('target'); if (v) fill.target = v; }
      if (want.value) { const v = g('value'); if (v) fill.value = v; }
      const h = g('hypotheses'); if (h) fill.hypotheses = h;
      return { fill, regionalHypothesis: g('regional'), failed: r.failed };
    },

    /** 추천 이유 개선. 해당 경로의 자료만 쓰고, 통과 못 하면 규칙 이유를 둔다. */
    async reason(r: Resource, ruleReason: string, context: string): Promise<string | null> {
      const facts = `경로 종류: ${r.type}\n제공 내용: ${r.content}\n대상: ${r.target ?? '확인 필요'}\n규칙 이유: ${ruleReason}\n사용자 상황: ${context}`;
      const out = await call('reason', `${RULES}\n이 경로가 사용자의 어떤 준비를 돕는지 한두 문장으로 써 주세요. 기관 이름과 '이 지역이라서'라는 이유는 쓰지 않아요. 주어진 제공 내용 밖의 도움은 쓰지 않아요. 문장만 출력해요.`, facts);
      return guardText(out.text, { allowedText: [ruleReason, r.content, r.target ?? '', context], knownTitles: otherTitles([r.title]), maxLength: 160 });
    },
  };
}
export type ExploreAi = ReturnType<typeof exploreAi>;
export const problemContext = (p: ProblemCard | undefined): string => (p ? `선택한 문제: ${p.title} / 대상: ${p.affectedUser} / 상황: ${p.situation} / 근거 수준: ${p.evidenceLevel}` : '선택한 문제 없음');
