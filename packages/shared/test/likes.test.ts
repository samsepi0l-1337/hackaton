import { describe, expect, test } from 'bun:test';
import { likeProfile, likeSimilarity, likeTopics, recommendResources, type Resource } from '../src';

const NOW = new Date('2026-11-27T01:00:00Z');
const res = (o: Partial<Resource> = {}): Resource => ({
  id: 'r', type: '상담', title: 't', agency: 'a', url: null, target: null, stages: ['no_idea', 'has_idea', 'preparing'], content: 'c', procedure: null, prep: null,
  regions: ['부산'], affiliationLimit: null, costPeriod: null, recruitStatus: 'unknown', endDate: null, checkedAt: null, sourceExcerpt: null,
  industryTags: [], capabilityTags: ['상담'], contextIds: [], conditions: null, test: false, ...o,
});

describe('관심 표시 비슷함', () => {
  const liked = [res({ id: 'l1', type: '교육', capabilityTags: ['교육'], industryTags: ['AI'], agency: '부산대' }), res({ id: 'l2', type: '교육', capabilityTags: ['교육', '상담'], industryTags: ['AI'] })];
  const p = likeProfile(liked);
  test('하트가 없으면 0, 특징이 같을수록 크다', () => {
    expect(likeSimilarity(res(), null)).toBe(0);
    const same = likeSimilarity(res({ type: '교육', capabilityTags: ['교육'], industryTags: ['AI'], agency: '부산대' }), p);
    const half = likeSimilarity(res({ type: '상담', capabilityTags: ['상담'], industryTags: [] }), p);
    const none = likeSimilarity(res({ type: '공간', capabilityTags: ['공간'], industryTags: [], agency: '다른 기관' }), p);
    expect(same).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(none);
    expect(none).toBe(0);
    expect(same).toBeLessThanOrEqual(1);
  });
  test('관심 주제: 많이 나온 순', () => {
    expect(likeTopics(p).slice(0, 2).sort()).toEqual(['AI', '교육']);
  });
  test('추천: 같은 점수 묶음 안에서만 순서를 바꾸고, 후보를 새로 만들지 않는다', () => {
    const rs = [
      res({ id: 'a-sangdam', capabilityTags: ['상담'] }),
      res({ id: 'b-edu', type: '교육', capabilityTags: ['교육'], industryTags: ['AI'] }),
      res({ id: 'c-fund', type: '지원사업', capabilityTags: ['자금'], industryTags: ['AI'] }), // 단계에 맞는 도움이 아니라 후보 아님
    ];
    const plain = recommendResources({ now: NOW, readiness: 'no_idea', resources: rs, problems: [] }).items.map((x) => x.resource.id);
    expect(plain).toEqual(['a-sangdam', 'b-edu']);
    const withLikes = recommendResources({ now: NOW, readiness: 'no_idea', resources: rs, problems: [], likes: p }).items.map((x) => x.resource.id);
    expect(withLikes).toEqual(['b-edu', 'a-sangdam']);
  });
});
