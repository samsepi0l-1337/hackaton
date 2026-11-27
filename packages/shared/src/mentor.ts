// F2·F3 목업. 실제 LLM 연결 전까지 규칙 문장을 쓴다. 지원사업 이름·금액·마감일은 말하지 않는다.
import { MENTOR_QUESTION_COUNT } from './constants';
import type { ChatMessage, ConsultProfile, IdeaSummary } from './types';

export const DEFAULT_MENTOR_QUESTIONS = [
  '지금 고객은 어떤 대안을 쓰고 있고, 그 대안의 어떤 점이 가장 불편한가요?',
  '첫 고객 10명은 어디에서, 어떻게 만날 계획인가요?',
  '이 사업을 왜 부산에서 해야 하나요? 부산이라서 유리한 점이 있나요?',
] as const;

/** 폼에서 비어 있거나 짧은 항목을 먼저 묻는다. 결과는 항상 3개. */
export function pickMentorQuestions(p: ConsultProfile): string[] {
  const out: string[] = [];
  if (!p.alternative || p.alternative.trim().length < 10) out.push(DEFAULT_MENTOR_QUESTIONS[0]);
  if (!p.revenue || p.revenue.length === 0 || p.revenue.includes('아직 모름')) out.push('고객은 무엇에 돈을 낼까요? 가격은 얼마쯤이면 좋을까요?');
  if ((p.customerDesc ?? '').trim().length < 15) out.push('가장 먼저 쓸 고객을 한 사람으로 그려 주세요. 나이, 사는 곳, 하루 일과는요?');
  for (const q of DEFAULT_MENTOR_QUESTIONS) if (!out.includes(q)) out.push(q);
  return out.slice(0, MENTOR_QUESTION_COUNT);
}

export function mentorOpening(p: ConsultProfile): string {
  const who = p.customerDesc || '고객';
  return `${who}을(를) 위해 '${p.idea ?? '아이디어'}'를 하려는 거군요. 몇 가지만 더 여쭤볼게요.`;
}

export const MENTOR_PROGRAM_DEFLECT = '지원사업 이름·금액·마감일은 결과 화면에서 공고 데이터로 보여드릴게요.';

/** 사용자가 지원사업 정보를 물었는지 대략 판단. */
export function asksAboutPrograms(text: string): boolean {
  return /(지원\s*사업|공고|마감|지원금|얼마|금액)/.test(text);
}

/** F3 요약 목업. 폼과 답변에서 문장을 모은다. */
export function draftSummary(p: ConsultProfile, messages: ChatMessage[]): IdeaSummary {
  const answers = messages.filter((m) => m.role === 'user' && !m.skipped).map((m) => m.text);
  return {
    problem: p.problem ?? '',
    customer: [p.customerType, p.customerAges?.join('·'), p.customerDesc].filter(Boolean).join(' / '),
    solution: [p.idea, p.bizForm && `(${p.bizForm})`].filter(Boolean).join(' '),
    revenue: p.revenue?.length ? p.revenue.join(', ') : '아직 정하지 않음',
    busan: answers[2] ?? (p.district ? `${p.district}에서 시작` : '부산에서 시작'),
  };
}
