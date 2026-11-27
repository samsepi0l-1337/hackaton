// F2 질문 표와 선택 규칙. 질문 뜻은 여기서 정하고, AI 는 말투만 바꾼다.
import { industriesOf, problemOf, REVIEW_REGIONS, type Exploration, type ProblemCard, type StartProfile } from '@gil/shared';

export const MAX_QUESTIONS = 3;

export const QUESTIONS: Record<string, string> = {
  trigger: '이 일을 해보고 싶어진 경험이 있나요? (예: 가족 일을 도우면서 불편한 점을 본 적이 있어요)',
  reason: '이 문제의 어떤 부분이 관심을 끌었나요?',
  contact: '관련해 겪거나 알고 있는 경험이 있나요? 없어도 괜찮아요.',
  direction: '이 문제에서 더 알아보고 싶은 부분이나 도움이 될 수 있다고 생각하는 점이 있나요?',
  target: '어떤 사람이 이용하면 좋을까요? 아직 정하지 않아도 괜찮아요.',
  prepared: '지금까지 알아보거나 준비한 것이 있나요?',
  region: '부울경의 조선·해양, 자동차, 항공, 방산, 수소·에너지, 데이터센터, AI, 2차전지 분야 중 이 구상과 연결해보고 싶은 분야가 있나요? 잘 모르겠으면 그렇다고 해도 돼요.',
  interestOnly: '선택한 산업에서 제품을 만드는 일과 관련 업무를 돕는 서비스 중 살펴보고 싶은 방향이 있나요?',
};

export const OPENING = '몇 가지만 가볍게 여쭤볼게요. 모르면 "아직 모르겠어요", 넘기고 싶으면 "건너뛰기"를 눌러도 돼요. 정답은 없어요.';
export const CLOSING = '질문은 여기까지예요. 정리된 내용을 같이 볼까요?';

type PlanInput = { start: Partial<StartProfile>; exploration: Exploration | null; answers: { key: string }[] };

/** 질문 3개를 고른다. 지역 접점 질문은 기존 질문 하나를 대체한다(4번째로 늘리지 않음). 이미 답했으면 넣지 않는다. */
export function planQuestions(s: PlanInput): string[] {
  const hasProblem = !!s.exploration && (s.exploration.origin === 'card' || s.exploration.origin === 'custom');
  const base: Record<string, string[]> = {
    no_idea: hasProblem ? ['reason', 'contact', 'target'] : ['trigger', 'interestOnly', 'target'],
    has_idea: ['trigger', 'target', 'prepared'],
    preparing: ['prepared', 'target', 'direction'],
  };
  const plan = [...(base[s.start.readiness ?? 'has_idea'] ?? base.has_idea!)];
  const region = s.start.reviewRegion;
  const regionAsked = s.answers.some((a) => a.key === 'region');
  if (region && region !== '미정' && (REVIEW_REGIONS as readonly string[]).includes(region) && !regionAsked) {
    // 대상 질문은 지키고, 덜 급한 질문 하나를 지역 질문으로 바꾼다.
    const slot = ['interestOnly', 'prepared', 'contact', 'trigger', 'direction', 'reason'].map((k) => plan.indexOf(k)).find((i) => i >= 0) ?? 1;
    plan[slot] = 'region';
  }
  return plan;
}

const norm = (x: string) => x.replace(/\s/g, '');

/** AI 를 못 쓸 때의 방향 예시. 확정이 아니라 "무엇을 알아볼지"만 말한다. 거절한 것은 다시 내지 않는다. */
export function ruleSuggestions(start: Partial<StartProfile>, exploration: Exploration | null, rejected: string[], problems?: ProblemCard[]): string[] {
  const problem = problemOf(exploration?.problemId, problems);
  const tag = problem?.industryTags[0] ?? industriesOf(start.interests)[0];
  const pool: string[] = problem
    ? [`${problem.affectedUser}가 이 상황을 언제 겪는지 직접 들어보는 방향`, '지금 쓰는 방법과 불편한 점을 비교해 보는 방향', '비슷한 문제를 다른 곳에서는 어떻게 푸는지 찾아보는 방향']
    : tag
      ? [`${tag} 분야에서 제품을 만드는 일을 돕는 서비스를 알아보는 방향`, `${tag} 분야 일을 하는 사람의 관련 업무를 돕는 서비스를 알아보는 방향`, `${tag} 분야에서 일하는 사람의 하루를 먼저 들어보는 방향`]
      : ['관심 분야에서 직접 본 불편을 먼저 적어 보는 방향', '관심 분야에서 일하는 사람의 이야기를 들어보는 방향'];
  const dead = new Set(rejected.map(norm));
  return pool.filter((x) => !dead.has(norm(x))).slice(0, 2);
}
