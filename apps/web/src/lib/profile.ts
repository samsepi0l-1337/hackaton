import { BUSAN_DISTRICTS, OUTSIDE_BUSAN } from '@gil/shared';
import type { BasicProfile, UserConditions } from '@gil/shared';

const AFFILIATION_OF: Record<string, string> = { 대학생: '대학생', 대학원생: '대학원생', 직장인: '직장인', '구직 중': '무직' };

/** 내 정보의 기본 정보를 '내 조건 확인'의 기본값으로 바꾼다. 비어 있는 칸은 채우지 않는다 (최종 자격 판정이 아님). */
export function profileToConditions(p: BasicProfile | null | undefined): UserConditions | undefined {
  if (!p) return undefined;
  const c: UserConditions = {};
  if (p.age !== null) c.age = p.age;
  if (p.residence) {
    if ((BUSAN_DISTRICTS as readonly string[]).includes(p.residence)) c.residence = `부산 ${p.residence}`;
    else if (p.residence !== '부산') c.residence = OUTSIDE_BUSAN;
  }
  if (p.hasBusiness !== null) c.hasBusiness = p.hasBusiness;
  if (p.occupation) c.affiliation = AFFILIATION_OF[p.occupation] ?? '기타';
  return Object.keys(c).length ? c : undefined;
}
