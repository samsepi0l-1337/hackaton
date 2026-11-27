// 탐색(F2·F3·F5)용 AI 보조. 모든 문장은 사실 검사(guard)를 거치고, 실패하면 null 을 돌려줘 규칙 문장을 쓰게 한다.
// 출처 표시(provenance)는 여기서 정하지 않는다. 호출한 쪽(코드)이 붙인다.
import { FIELD_PRESUPPOSE, RESOURCES, type AiFill, type FieldQuestion, type LocalAiTask, type ProblemCard, type Resource } from '@gil/shared';
import { guardText, parseJson } from '../ai/guard';
import type { TextAi } from '../ai/solar';

const RULES = '당신은 창업을 처음 생각하는 청년의 생각 정리를 돕는 한국어 도우미예요. 해요체로 짧게 써요. 점수를 매기거나 성공 가능성을 평가하거나 과하게 칭찬하지 않아요. 기관·프로그램 이름, 금액, 마감일, 날짜, 숫자를 절대 쓰지 않아요. 사용자가 말하지 않은 경험·인터뷰·매출·팀을 지어내지 않아요. 확인되지 않은 것은 가설이라고 써요.';

/** 반응 문장 프롬프트. 질문·조언·평가를 하지 않고, 사용자가 한 말만 짧게 받아 준다. */
export const REACTION_PROMPT = `${RULES}
사용자의 직전 답을 듣고 짧게 받아 주는 반응 한 문장만 써요. 예: "동네 어르신들의 장보기 불편을 직접 보셨군요."
- 사용자가 한 말만 바탕으로 써요. 새로운 사실·조언·평가·칭찬을 더하지 않아요.
- 질문하지 않아요. 물음표를 쓰지 않아요. 다음 질문은 코드가 붙여요.
- 40자 안팎, 마침표로 끝나는 한 문장만 출력해요.`;
export const REACTION_MAX = 60;

/** 반응 문장 검사: 한 문장, 질문 아님, 너무 길지 않음. 통과 못 하면 null (규칙 질문만 쓴다). */
export function cleanReaction(t: string | null): string | null {
  if (!t) return null;
  const s = t.replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '').replace(/\s+/g, ' ');
  if (!s || s.length > REACTION_MAX || /[?？]/.test(s)) return null;
  // 두 문장 이상이면 쓰지 않는다 (끝의 마침표 하나만 허용).
  if ((s.match(/[.!。]/g) ?? []).length > 1) return null;
  if (/(까요|나요|세요|신가요|인가요)[.!]?$/.test(s)) return null; // 질문·권유형 끝맺음
  return /[.!。]$/.test(s) ? s : `${s}.`;
}

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

/** 로컬 AI 가 다듬는 작업(mentor·reason·field)은 서버가 Solar 를 부르지 않고 규칙 문장을 돌려준다. */
export function exploreAi(ai: TextAi, allow: (id: string, now: number) => boolean, actorId: string, now: number, local: ReadonlySet<LocalAiTask> = new Set()) {
  const call = async (task: 'mentor' | 'reason' | 'summary', system: string, user: string, rewrite?: LocalAiTask): Promise<AiCall> => {
    if (ai.mode === 'off' || (rewrite && local.has(rewrite))) return { text: null, limited: false, failed: false };
    if (!allow(actorId, now)) return { text: null, limited: true, failed: false };
    const text = await ai.generate(task, [{ role: 'system', content: system }, { role: 'user', content: user }], { userId: actorId });
    return { text, limited: false, failed: text === null };
  };
  const otherTitles = (own?: string[]) => RESOURCES.map((r) => r.title).filter((t) => !own?.includes(t));

  return {
    /**
     * 질문. 질문 문장은 규칙 원문을 그대로 쓴다 (2026-11-27 평가: AI 가 다시 쓰면 11건 중 6건의 뜻이 바뀜).
     * AI 는 직전 답에 대한 짧은 반응 한 문장만 쓰고, 코드가 그 뒤에 규칙 질문을 붙인다. 직전 답이 없으면 AI 를 부르지 않는다.
     */
    async question(base: string, lastAnswer: string): Promise<{ text: string; failed: boolean }> {
      if (!lastAnswer.trim()) return { text: base, failed: false };
      const r = await call('mentor', REACTION_PROMPT, `사용자의 직전 답: ${lastAnswer}`, 'mentor');
      const reaction = cleanReaction(guardText(r.text, { allowedText: [lastAnswer], knownTitles: otherTitles(), maxLength: REACTION_MAX }));
      return { text: reaction ? `${reaction} ${base}` : base, failed: r.failed };
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

    /**
     * 현장 확인 질문 문장 다듬기 (task 'field', mentor 모델). 질문 뜻은 규칙이 정하고, 사실 검사·전제 검사에 걸리면 규칙 문장을 둔다.
     * 응답자·답변·검증 결과는 만들지 않는다. 하나라도 AI 문장이 쓰이면 changed = true.
     */
    async field(rules: FieldQuestion[], context: string): Promise<{ items: FieldQuestion[]; changed: boolean }> {
      let changed = false;
      const items = await Promise.all(rules.map(async (q) => {
        const out = await call('mentor', `${RULES}\n현장 사람에게 물어볼 질문 한 문장을 같은 뜻으로 자연스럽게 바꿔 써요. 어려움·불편·구매 의향·비용 지불을 전제하지 말고, 현재 방식과 실제 경험을 묻는 열린 질문으로 써요. 응답자나 답변을 지어내지 않아요. 문장만 출력해요.`,
          `질문: ${q.question}\n상황: ${context}`, 'field');
        const t = guardText(out.text, { allowedText: [q.question, q.purpose, context], knownTitles: otherTitles(), maxLength: 140 });
        if (!t || !/[?？]\s*$/.test(t) || FIELD_PRESUPPOSE.test(t)) return q;
        changed = true;
        return { ...q, question: t, source: 'ai' as const };
      }));
      return { items, changed };
    },

    /** 추천 이유 개선. 해당 경로의 자료만 쓰고, 통과 못 하면 규칙 이유를 둔다. */
    async reason(r: Resource, ruleReason: string, context: string): Promise<string | null> {
      const facts = `경로 종류: ${r.type}\n제공 내용: ${r.content}\n대상: ${r.target ?? '확인 필요'}\n규칙 이유: ${ruleReason}\n사용자 상황: ${context}`;
      const out = await call('reason', `${RULES}\n이 경로가 사용자의 어떤 준비를 돕는지 한두 문장으로 써 주세요. 기관 이름과 '이 지역이라서'라는 이유는 쓰지 않아요. 주어진 제공 내용 밖의 도움은 쓰지 않아요. 문장만 출력해요.`, facts, 'reason');
      return guardText(out.text, { allowedText: [ruleReason, r.content, r.target ?? '', context], knownTitles: otherTitles([r.title]), maxLength: 160 });
    },
  };
}
export type ExploreAi = ReturnType<typeof exploreAi>;
export const problemContext = (p: ProblemCard | undefined): string => (p ? `선택한 문제: ${p.title} / 대상: ${p.affectedUser} / 상황: ${p.situation} / 근거 수준: ${p.evidenceLevel}` : '선택한 문제 없음');
