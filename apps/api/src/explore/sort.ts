// 지원 목록 정렬. 순수 함수: 페이지 나누기 전에 쓴다.
import { dDay, type ResourceCard, type ResourceSort } from '@gil/shared';

export const DEFAULT_SORT: ResourceSort = 'deadline';
const byId = (a: ResourceCard, b: ResourceCard) => (a.resource.id < b.resource.id ? -1 : a.resource.id > b.resource.id ? 1 : 0);
const views = (c: ResourceCard) => c.views ?? 0;

/** 마감 임박 묶음: 0 = 마감일이 오늘 이후, 1 = 마감일 없음(상시·확인 필요), 2 = 마감·종료. */
function deadlineGroup(c: ResourceCard, now: Date): 0 | 1 | 2 {
  const r = c.resource;
  if (r.recruitStatus === 'closed') return 2;
  if (r.endDate === null) return 1;
  return (dDay(r.endDate, now) ?? 0) >= 0 ? 0 : 2;
}

/** 마감일 오름차순. 마감일이 없으면 뒤. */
const byEnd = (a: ResourceCard, b: ResourceCard) => {
  const x = a.resource.endDate, y = b.resource.endDate;
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x < y ? -1 : 1;
};

function byDeadline(a: ResourceCard, b: ResourceCard, now: Date): number {
  const ga = deadlineGroup(a, now), gb = deadlineGroup(b, now);
  if (ga !== gb) return ga - gb;
  // 마감 지난 묶음은 최근에 닫은 것부터.
  const x = a.resource.endDate, y = b.resource.endDate;
  if (ga === 2 && x !== y && x !== null && y !== null) return x < y ? 1 : -1;
  return byEnd(a, b) || byId(a, b);
}

export function sortCards(cards: ResourceCard[], sort: ResourceSort, now: Date): ResourceCard[] {
  const out = [...cards];
  if (sort === 'recent') {
    return out.sort((a, b) => {
      const x = a.resource.startDate ?? null, y = b.resource.startDate ?? null;
      if (x !== y) { if (x === null) return 1; if (y === null) return -1; return x < y ? 1 : -1; }
      return byId(a, b);
    });
  }
  if (sort === 'popular') return out.sort((a, b) => views(b) - views(a) || byDeadline(a, b, now));
  if (sort === 'fit') {
    // 마감·종료는 점수와 상관없이 뒤. 같은 점수면 마감 임박 순.
    const closed = (c: ResourceCard) => Number(deadlineGroup(c, now) === 2);
    return out.sort((a, b) => closed(a) - closed(b) || (b.fit ?? 0) - (a.fit ?? 0) || byDeadline(a, b, now));
  }
  return out.sort((a, b) => byDeadline(a, b, now));
}
