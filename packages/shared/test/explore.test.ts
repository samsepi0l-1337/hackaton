import { describe, expect, test } from 'bun:test';
import { INDUSTRY_TAGS, PROBLEMS, RESOURCES, CONTEXTS, brokenReferences, EVIDENCE_LEVELS } from '../src';

describe('F21 테스트 자료', () => {
  test('참조가 모두 맞다', () => expect(brokenReferences()).toEqual([]));
  test('산업 태그·근거 수준은 정해진 값만', () => {
    for (const p of PROBLEMS) {
      expect(p.industryTags.every((t) => (INDUSTRY_TAGS as readonly string[]).includes(t))).toBe(true);
      expect((EVIDENCE_LEVELS as readonly string[]).includes(p.evidenceLevel)).toBe(true);
    }
  });
  test('테스트 자료는 표시가 있고, 테스트가 아니면 공식 URL·확인일이 있다', () => {
    for (const x of [...PROBLEMS, ...RESOURCES, ...CONTEXTS] as { test: boolean; title?: string; checkedAt: string | null; url?: string | null; sourceRef?: string | null }[]) {
      if (x.test) { if (x.title) expect(x.title.startsWith('[테스트]')).toBe(true); }
      else { expect(x.checkedAt).toBeTruthy(); expect(x.url ?? x.sourceRef).toBeTruthy(); }
    }
  });
  test('문제 카드는 한 분야만 있다 (다른 분야는 빈 상태)', () => {
    expect(PROBLEMS.filter((p) => p.industryTags.includes('자동차'))).toHaveLength(0);
  });
});

describe('서비스 데이터 (data/*.json)', () => {
  test('[테스트] 자료가 없다 — 검수된 자료(공식 URL·확인일)만 둔다', async () => {
    for (const n of ['problems', 'contexts', 'resources']) {
      const items = (await import(`../data/${n}.json`)).default as { test?: boolean; title?: string; checkedAt?: string | null }[];
      for (const x of items) {
        expect(x.test).toBe(false);
        expect(x.title?.startsWith('[테스트]') ?? false).toBe(false);
        expect(x.checkedAt).toBeTruthy();
      }
    }
  });
});
