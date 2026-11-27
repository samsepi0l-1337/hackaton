import type { ExploreOptionsResponse } from '@gil/shared';

export type Coverage = ExploreOptionsResponse['coverage'];

/** 지역에 확인된 자료가 하나도 없으면 true. 자료 수는 성과가 아니라 제공 범위 안내로만 쓴다. */
export function hasNoData(coverage: Coverage | undefined, region: string): boolean {
  const c = coverage?.[region];
  return !c || c.problems + c.resources + c.contexts === 0;
}

export function coverageLine(coverage: Coverage | undefined): string {
  if (!coverage) return '';
  const ready = Object.entries(coverage).filter(([, c]) => c.problems + c.resources + c.contexts > 0).map(([r]) => r);
  const prep = Object.keys(coverage).filter((r) => !ready.includes(r));
  const a = ready.length ? `현재 확인된 자료가 있는 지역: ${ready.join(', ')}.` : '현재 확인된 지역 자료가 아직 없어요.';
  const b = prep.length ? ` ${prep.join(', ')}은(는) 상세 지원 경로 준비 중이에요.` : '';
  return a + b;
}
