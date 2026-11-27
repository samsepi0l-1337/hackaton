// F4 자격 판정. AI를 쓰지 않는다. 같은 입력이면 항상 같은 결과다.
import { BUSAN_DISTRICTS, OUTSIDE_BUSAN } from './constants';
import { addYears, dDay, dDayLabel, kstDate } from './date';
import type { CheckStatus, ConsultProfile, Eligibility, EligibilityCheck, Program, Verdict } from './types';

const OPEN_WORDS = ['전체', '무관', '제한없음', '제한 없음'];

function tokens(raw: string | null): string[] {
  return (raw ?? '').split(/[,·/]/).map((t) => t.trim()).filter(Boolean);
}

/** 'biz_trgt_age' 값을 [최소, 최대] 범위 목록으로 바꾼다. 읽을 수 없으면 null. 'open' = 제한 없음. */
export function parseAgeRanges(raw: string | null): Array<[number, number]> | 'open' | null {
  const list = tokens(raw);
  if (list.length === 0) return null;
  if (list.some((t) => OPEN_WORDS.includes(t))) return 'open';
  const ranges: Array<[number, number]> = [];
  for (const t of list) {
    const both = t.match(/(\d+)\s*세\s*이상\s*~\s*만?\s*(\d+)\s*세\s*(이하|미만)/);
    if (both) {
      ranges.push([Number(both[1]), Number(both[2]) - (both[3] === '미만' ? 1 : 0)]);
      continue;
    }
    const lower = t.match(/(\d+)\s*세\s*이상/);
    if (lower) { ranges.push([Number(lower[1]), Infinity]); continue; }
    const upper = t.match(/(\d+)\s*세\s*(이하|미만)/);
    if (upper) { ranges.push([0, Number(upper[1]) - (upper[2] === '미만' ? 1 : 0)]); continue; }
    return null;
  }
  return ranges;
}

/**
 * 'biz_enyy' 값을 읽는다. 'N년미만' 은 개업일부터 N년이 되는 날까지(그날 포함) 가능으로 본다.
 * 예: 2023-11-27 개업, '3년미만' → 2026-11-27 까지 가능, 2026-11-28 부터 불가.
 */
export function parseYearBuckets(raw: string | null): { pre: boolean; maxYears: number | null } | 'open' | null {
  const list = tokens(raw);
  if (list.length === 0) return null;
  if (list.some((t) => OPEN_WORDS.includes(t))) return 'open';
  let pre = false;
  let maxYears: number | null = null;
  for (const t of list) {
    if (t.includes('예비')) { pre = true; continue; }
    const m = t.match(/(\d+)\s*년\s*(미만|이내|이하)/);
    if (m) { maxYears = Math.max(maxYears ?? 0, Number(m[1])); continue; }
    return null;
  }
  return { pre, maxYears };
}

function check(key: EligibilityCheck['key'], label: string, status: CheckStatus, detail: string): EligibilityCheck {
  return { key, label, status, detail };
}

export function checkDeadline(p: Program, now: Date): EligibilityCheck {
  if (!p.recruiting) return check('deadline', '마감', 'fail', '모집이 끝났어요');
  const d = dDay(p.endDate, now);
  if (d === null) return check('deadline', '마감', 'pass', '상시 모집');
  if (d < 0) return check('deadline', '마감', 'fail', `${p.endDate} 마감됨`);
  return check('deadline', '마감', 'pass', `${p.endDate} 마감 (${dDayLabel(d)})`);
}

export function checkRegion(p: Program, profile: ConsultProfile): EligibilityCheck {
  const list = tokens(p.region);
  if (list.length === 0) return check('region', '지역', 'unknown', '공고에 지역 정보가 없어요');
  if (list.includes('전국')) return check('region', '지역', 'pass', '전국 대상');
  if (!list.includes('부산')) return check('region', '지역', 'fail', `${list.join(', ')} 한정`);
  if (!profile.district) return check('region', '지역', 'unknown', '사업장 지역을 입력해 주세요');
  if (profile.district === OUTSIDE_BUSAN) return check('region', '지역', 'fail', '부산 소재 사업장만 대상');
  if ((BUSAN_DISTRICTS as readonly string[]).includes(profile.district)) {
    return check('region', '지역', 'pass', `부산 대상 · 내 지역 ${profile.district}`);
  }
  return check('region', '지역', 'unknown', '사업장 지역을 확인할 수 없어요');
}

export function checkAge(p: Program, profile: ConsultProfile): EligibilityCheck {
  const ranges = parseAgeRanges(p.targetAge);
  if (ranges === 'open') return check('age', '나이', 'pass', '나이 제한 없음');
  if (ranges === null) return check('age', '나이', 'unknown', p.targetAge ? `조건 확인 필요: ${p.targetAge}` : '공고에 나이 조건이 없어요');
  if (profile.age === undefined) return check('age', '나이', 'unknown', '나이를 입력해 주세요');
  const ok = ranges.some(([lo, hi]) => profile.age! >= lo && profile.age! <= hi);
  return check('age', '나이', ok ? 'pass' : 'fail', `대상 ${p.targetAge} · 나 만 ${profile.age}세`);
}

export function checkYears(p: Program, profile: ConsultProfile, now: Date): EligibilityCheck {
  const buckets = parseYearBuckets(p.bizYears);
  if (buckets === 'open') return check('years', '창업 연차', 'pass', '연차 제한 없음');
  if (buckets === null) return check('years', '창업 연차', 'unknown', p.bizYears ? `조건 확인 필요: ${p.bizYears}` : '공고에 창업 연차 조건이 없어요');
  if (!profile.stage) return check('years', '창업 연차', 'unknown', '창업 단계를 입력해 주세요');
  if (profile.stage === 'pre') {
    return buckets.pre
      ? check('years', '창업 연차', 'pass', '예비창업자 대상')
      : check('years', '창업 연차', 'fail', '사업자가 있는 창업자만 대상');
  }
  if (!profile.openedAt) return check('years', '창업 연차', 'unknown', '개업일을 입력해 주세요');
  if (buckets.maxYears === null) return check('years', '창업 연차', 'fail', '예비창업자만 대상');
  const limit = addYears(profile.openedAt, buckets.maxYears);
  const ok = kstDate(now) <= limit;
  return check('years', '창업 연차', ok ? 'pass' : 'fail', `창업 ${buckets.maxYears}년 이내 대상 (${limit}까지)`);
}

export function verdictOf(checks: EligibilityCheck[]): Verdict {
  if (checks.some((c) => c.status === 'fail')) return 'ineligible';
  if (checks.some((c) => c.status === 'unknown')) return 'check';
  return 'eligible';
}

export function judge(p: Program, profile: ConsultProfile, now: Date): Eligibility {
  const checks = [checkDeadline(p, now), checkRegion(p, profile), checkAge(p, profile), checkYears(p, profile, now)];
  return { programId: p.id, verdict: verdictOf(checks), checks };
}
