import { describe, expect, test } from 'bun:test';
import { decideCandidates, decideChoiceText, recommendResources, RELEVANCE_MIN, type Resource } from '../src';

const NOW = new Date('2026-11-27T01:00:00Z');
const res = (o: Partial<Resource> = {}): Resource => ({
  id: 'r', type: '상담', title: 't', agency: '기관', url: null, target: null, stages: ['has_idea', 'preparing'], content: 'c', procedure: null, prep: null,
  regions: ['부산'], affiliationLimit: null, costPeriod: null, recruitStatus: 'open', endDate: '2026-12-31', checkedAt: null, sourceExcerpt: null,
  industryTags: [], capabilityTags: ['상담'], contextIds: [], conditions: null, test: false, ...o,
});
const RS = [
  res({ id: 'a', capabilityTags: ['상담'] }),
  res({ id: 'b', type: '교육', capabilityTags: ['교육'] }),
  res({ id: 'c', type: '지원사업', capabilityTags: ['자금'] }), // 도움 종류는 안 맞아도 Decide 후보
  res({ id: 'old', recruitStatus: 'closed' }),
  res({ id: 'age', conditions: { ageMax: 30 } }),
  res({ id: 'pre-only', stages: ['preparing'] }),
];
const base = { now: NOW, readiness: 'has_idea' as const, resources: RS, problems: [], conditions: { age: 35 } };

describe('Decide 후보', () => {
  test('마감·명시 조건 불일치·단계 불일치는 빼고, 도움 종류가 달라도 넣는다', () => {
    expect(decideCandidates(base).map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
  });
  test("'아이디어 없음'은 예비창업자 대상(has_idea) 자료도 받는다", () => {
    expect(decideCandidates({ ...base, readiness: 'no_idea' }).map((r) => r.id)).toContain('a');
    expect(recommendResources({ ...base, readiness: 'no_idea' }).items.length).toBeGreaterThan(0);
  });
  test('최대 26건', () => {
    const many = Array.from({ length: 40 }, (_, i) => res({ id: `m${i}` }));
    expect(decideCandidates({ ...base, resources: many }).length).toBe(26);
  });
  test('선택지 글에 기관 이름을 넣지 않는다', () => {
    const t = decideChoiceText(res({ agency: '부산창조경제혁신센터', title: '원스톱 상담', content: '전문가 상담' }));
    expect(t).not.toContain('부산창조경제혁신센터');
    expect(t).toContain('원스톱 상담');
  });
});

describe('Decide 관련도 순위', () => {
  test('관련도 순으로 고르고, 낮은 것과 후보 밖 자료는 넣지 않는다', () => {
    const out = recommendResources({ ...base, relevance: { c: 1, a: 0.5, b: RELEVANCE_MIN / 2, age: 1, old: 1 } });
    expect(out.items.map((x) => x.resource.id)).toEqual(['c', 'a']);
  });
  test('모두 낮으면 비우고 안내 문구', () => {
    const out = recommendResources({ ...base, relevance: { a: 0.01 } });
    expect(out.items).toEqual([]);
    expect(out.noMatchReason).not.toBeNull();
  });
  test('관련도가 없으면 규칙 순위', () => {
    // 같은 함수끼리 비교하면 규칙 순서가 바뀌어도 통과한다. 기대 순서를 직접 적는다.
    expect(recommendResources({ ...base, relevance: null }).items.map((x) => x.resource.id)).toEqual(['a', 'b']);
  });
});
