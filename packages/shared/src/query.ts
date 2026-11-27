// F18 공고 모음 필터·검색·정렬, F20 메인 요약. API가 쓰고, 웹은 같은 파라미터 이름을 URL에 쓴다.
import { DUE_SOON_DAYS, PAGE_SIZE } from './constants';
import { dDay, isClosed } from './date';
import { judge, parseAgeRanges, parseYearBuckets } from './eligibility';
import type { ConsultProfile, Program, ProgramCard, Stage, Verdict } from './types';
import type { HomeResponse, ProgramListQuery, ProgramListResponse } from './api';

function matchesStage(p: Program, stage: Stage): boolean {
  const b = parseYearBuckets(p.bizYears);
  if (b === null || b === 'open') return true;
  if (stage === 'pre') return b.pre;
  const need = stage === 'lt1' ? 1 : stage === '1to3' ? 3 : 7;
  return (b.maxYears ?? 0) >= need;
}

function matchesAge(p: Program, age: number): boolean {
  const r = parseAgeRanges(p.targetAge);
  return r === null || r === 'open' || r.some(([lo, hi]) => age >= lo && age <= hi);
}

export function toCard(p: Program, now: Date, profile: ConsultProfile | null): ProgramCard {
  return { program: p, dDay: dDay(p.endDate, now), eligibility: profile ? judge(p, profile, now) : null };
}

export function listPrograms(programs: Program[], q: ProgramListQuery, now: Date, profile: ConsultProfile | null): ProgramListResponse {
  const kw = q.q?.trim().toLowerCase();
  let cards = programs
    .filter((p) => q.includeClosed || (p.recruiting && !isClosed(p.endDate, now)))
    .filter((p) => !kw || [p.title, p.agency, p.content, ...p.tags].some((t) => t.toLowerCase().includes(kw)))
    .filter((p) => !q.region || (p.region ?? '').split(',').map((s) => s.trim()).includes(q.region))
    .filter((p) => !q.category || p.category === q.category)
    .filter((p) => !q.stage || matchesStage(p, q.stage))
    .filter((p) => q.age === undefined || matchesAge(p, q.age))
    .filter((p) => {
      if (!q.due) return true;
      const d = dDay(p.endDate, now);
      if (q.due === 'always') return d === null;
      return d !== null && d >= 0 && d <= Number(q.due);
    })
    .map((p) => toCard(p, now, profile));
  if (q.verdict && profile) cards = cards.filter((c) => c.eligibility?.verdict === q.verdict);
  cards.sort(q.sort === 'latest'
    ? (a, b) => b.program.registeredAt.localeCompare(a.program.registeredAt) || a.program.id.localeCompare(b.program.id)
    : (a, b) => (a.dDay ?? 1e9) - (b.dDay ?? 1e9) || a.program.id.localeCompare(b.program.id));
  const offset = Math.max(0, q.offset ?? 0);
  const limit = Math.min(100, Math.max(1, q.limit ?? PAGE_SIZE));
  const items = cards.slice(offset, offset + limit);
  return { total: cards.length, items, nextOffset: offset + limit < cards.length ? offset + limit : null };
}

export function homeSummary(programs: Program[], now: Date): HomeResponse {
  const open = programs.filter((p) => p.recruiting && !isClosed(p.endDate, now));
  const closingSoon = open
    .filter((p) => p.endDate !== null)
    .sort((a, b) => a.endDate!.localeCompare(b.endDate!) || a.id.localeCompare(b.id));
  return {
    openCount: open.length,
    closingThisWeek: closingSoon.filter((p) => (dDay(p.endDate, now) ?? 1e9) <= DUE_SOON_DAYS).length,
    closingSoon: closingSoon.slice(0, 3).map((p) => toCard(p, now, null)),
  };
}

export function parseVerdict(v: unknown): Verdict | undefined {
  return v === 'eligible' || v === 'check' || v === 'ineligible' ? v : undefined;
}
