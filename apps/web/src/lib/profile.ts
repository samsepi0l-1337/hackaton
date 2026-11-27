import { BUSAN_DISTRICTS, OUTSIDE_BUSAN } from '@gil/shared';
import type { BasicProfile, UserConditions } from '@gil/shared';

const AFFILIATION_OF: Record<string, string> = { 대학생: '대학생', 대학원생: '대학원생', 직장인: '직장인', '구직 중': '무직' };

const AREA_NAMES = ['부산', '울산', '경남'];

/** '부산 해운대구' 같은 글자를 지역 선택기의 (지역, 구·군)로 바꾼다. 지역으로 시작하지 않으면 그대로 지역 칸(기타 항목)에 둔다. */
export function splitRegionText(v: string): { region?: string; district?: string } {
  if (!v) return {};
  const area = AREA_NAMES.find((a) => v === a || v.startsWith(`${a} `));
  if (!area) return { region: v };
  const rest = v.slice(area.length).trim();
  return rest ? { region: area, district: rest } : { region: area };
}

/** 지역 선택기의 (지역, 구·군)를 '부산 해운대구' 같은 글자로 되돌린다. */
export function joinRegionText(region: string | undefined, district: string | undefined): string {
  if (!region) return '';
  return district && AREA_NAMES.includes(region) ? `${region} ${district}` : region;
}

/** 내 정보의 기본 정보를 '내 조건 확인'의 기본값으로 바꾼다. 비어 있는 칸은 채우지 않는다 (최종 자격 판정이 아님). */
export function profileToConditions(p: BasicProfile | null | undefined): UserConditions | undefined {
  if (!p) return undefined;
  const c: UserConditions = {};
  if (p.age !== null) c.age = p.age;
  if (p.residence) {
    if ((BUSAN_DISTRICTS as readonly string[]).includes(p.residence)) c.residence = `부산 ${p.residence}`;
    else if (/^(울산|경남)( |$)/.test(p.residence)) c.residence = p.residence;
    else if (p.residence !== '부산') c.residence = OUTSIDE_BUSAN;
  }
  if (p.hasBusiness !== null) c.hasBusiness = p.hasBusiness;
  if (p.occupation) c.affiliation = AFFILIATION_OF[p.occupation] ?? '기타';
  return Object.keys(c).length ? c : undefined;
}
