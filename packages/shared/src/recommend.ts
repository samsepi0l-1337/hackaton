// F5 Top3, F6 추천 이유(규칙 템플릿), F11 기관, F12 7일 계획. AI 장애 시에도 이 결과를 쓴다.
import { CATEGORY_TO_NEEDS, DUE_SOON_DAYS, SCORE, TOP_N } from './constants';
import { dDay, dDayLabel } from './date';
import { judge } from './eligibility';
import type { Agency, ConsultProfile, IdeaSummary, PlanItem, Program, Recommendation } from './types';

function words(text: string): string[] {
  return text.toLowerCase().split(/[^0-9a-z가-힣]+/).filter((w) => w.length >= 2);
}

export function relevanceKeywords(p: Program, profile: ConsultProfile, summary?: IdeaSummary | null): string[] {
  const mine = new Set(words([profile.idea, profile.problem, profile.customerDesc, summary?.solution].filter(Boolean).join(' ')));
  const hay = [...p.tags.map((t) => t.toLowerCase()), ...words(p.title + ' ' + p.content)];
  return [...new Set(hay.filter((w) => mine.has(w)))];
}

export interface ScoreParts {
  relevance: number;
  industry: number;
  need: number;
  due: number;
  penalty: number;
  matchedNeeds: string[];
  keywords: string[];
}

/** aiRelevance: 0..1 확률 (Solar Decide·jev). 없으면 키워드 규칙 점수. */
export function scoreProgram(p: Program, profile: ConsultProfile, now: Date, verdict: string, summary?: IdeaSummary | null, aiRelevance?: number): ScoreParts {
  const keywords = relevanceKeywords(p, profile, summary);
  const relevance = aiRelevance !== undefined && Number.isFinite(aiRelevance)
    ? Math.round(Math.min(1, Math.max(0, aiRelevance)) * SCORE.relevanceMax)
    : Math.min(SCORE.relevanceMax, keywords.length * SCORE.relevancePerKeyword);
  const industry = profile.industry && p.tags.includes(profile.industry) ? SCORE.industryMatch : 0;
  const offered = CATEGORY_TO_NEEDS[p.category] ?? [];
  const matchedNeeds = (profile.needs ?? []).filter((n) => offered.includes(n));
  const need = matchedNeeds.length > 0 ? SCORE.needMatch : 0;
  const d = dDay(p.endDate, now);
  const due = d !== null && d >= 0 && d <= DUE_SOON_DAYS ? SCORE.dueSoonBonus : 0;
  const penalty = verdict === 'check' ? SCORE.checkPenalty : 0;
  return { relevance, industry, need, due, penalty, matchedNeeds, keywords };
}

/** F6. 공고 데이터와 사용자 입력에 있는 사실만 쓴다. 금액·조건을 새로 만들지 않는다. */
export function ruleReason(p: Program, parts: ScoreParts, profile: ConsultProfile): string {
  const bits: string[] = [];
  if (parts.matchedNeeds.length) bits.push(`필요한 지원(${parts.matchedNeeds.join(', ')})과 지원 분야 '${p.category}'가 맞아요`);
  if (parts.industry) bits.push(`업종 '${profile.industry}' 관련 공고예요`);
  if (parts.keywords.length) bits.push(`아이디어의 '${parts.keywords.slice(0, 2).join(', ')}'와 공고 내용이 겹쳐요`);
  if (parts.due) bits.push('마감이 가까워 먼저 확인하면 좋아요');
  if (bits.length === 0) bits.push(`${p.region ?? ''} 대상 '${p.category}' 공고로 지금 신청할 수 있어요`.trim());
  return bits.slice(0, 2).join('. ') + '.';
}

export interface RecommendInput {
  programs: Program[];
  profile: ConsultProfile;
  now: Date;
  summary?: IdeaSummary | null;
  excludeIds?: Iterable<string>; // F10 '관련 없음'
  /** 공고 id → 0..1 관련도 확률 (Solar Decide). 없는 공고는 규칙 점수. */
  relevance?: Record<string, number>;
  feedback?: Record<string, boolean>;
  limit?: number;
}

export function recommend({ programs, profile, now, summary, excludeIds, relevance = {}, feedback = {}, limit = TOP_N }: RecommendInput): Recommendation[] {
  const excluded = new Set(excludeIds ?? []);
  return programs
    .filter((p) => !excluded.has(p.id))
    .map((p) => {
      const eligibility = judge(p, profile, now);
      const parts = scoreProgram(p, profile, now, eligibility.verdict, summary, relevance[p.id]);
      const score = parts.relevance + parts.industry + parts.need + parts.due + parts.penalty;
      return { p, eligibility, parts, score };
    })
    .filter((r) => r.eligibility.verdict !== 'ineligible')
    .sort((a, b) => b.score - a.score || (a.p.endDate ?? '9999').localeCompare(b.p.endDate ?? '9999') || a.p.id.localeCompare(b.p.id))
    .slice(0, limit)
    .map(({ p, eligibility, parts, score }) => ({
      program: p,
      dDay: dDay(p.endDate, now),
      eligibility,
      score,
      reason: ruleReason(p, parts, profile),
      feedback: feedback[p.id] ?? null,
    }));
}

/** F11. 지역(구)·소속에 맞는 기관 2~3곳. */
export function pickAgencies(agencies: Agency[], profile: ConsultProfile, limit = 3): Agency[] {
  const score = (a: Agency) =>
    (profile.district && a.districts.includes(profile.district) ? 2 : 0) +
    (profile.affiliation && a.forAffiliations.includes(profile.affiliation) ? 2 : 0) +
    (a.districts.length === 0 ? 1 : 0) -
    (a.forAffiliations.length > 0 && !(profile.affiliation && a.forAffiliations.includes(profile.affiliation)) ? 3 : 0);
  return [...agencies].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id)).slice(0, limit);
}

/** F12. 첫 항목은 Top3 중 마감이 가장 가까운 사업. */
export function buildPlan(top: Recommendation[], now: Date): PlanItem[] {
  const first = [...top].sort((a, b) => (a.dDay ?? 1e9) - (b.dDay ?? 1e9))[0];
  const items: Omit<PlanItem, 'done'>[] = [
    first
      ? { day: 1, task: `'${first.program.title}' 공고 원문 읽고 신청 자격·서류 확인 (${dDayLabel(dDay(first.program.endDate, now))})`, programId: first.program.id }
      : { day: 1, task: '공고 모음에서 조건 맞는 공고 3개 골라 원문 읽기' },
    { day: 2, task: '아이디어 1장 요약을 지원서 문장으로 다듬기' },
    { day: 3, task: '타겟 고객 5명에게 문제 인터뷰하기' },
    { day: 4, task: '인터뷰 결과로 해결책·수익 구조 수정하기' },
    { day: 5, task: '찾아갈 기관 1곳에 상담 예약하기' },
    { day: 6, task: '지원서 초안 만들고 팀원·지인에게 피드백 받기' },
    { day: 7, task: '지원서 최종 확인 후 제출하기' },
  ];
  return items.map((i) => ({ ...i, done: false }));
}

/** 관련도 모델(Solar Decide, 선택지 최대 26개)에 보낼 후보: 불가·제외를 뺀 공고. */
export function relevanceCandidates(programs: Program[], profile: ConsultProfile, now: Date, excludeIds?: Iterable<string>, max = 26): Program[] {
  const excluded = new Set(excludeIds ?? []);
  return programs
    .filter((p) => !excluded.has(p.id) && judge(p, profile, now).verdict !== 'ineligible')
    .sort((a, b) => (a.endDate ?? '9999').localeCompare(b.endDate ?? '9999') || a.id.localeCompare(b.id))
    .slice(0, max);
}
