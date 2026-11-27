import { describe, expect, test } from 'bun:test';
import { cleanReaction, exploreAi } from '../src/explore/ai';
import type { TextAi } from '../src/ai/solar';

const fakeAi = (out: string | null): TextAi & { calls: number } => {
  const o = { mode: 'upstage', calls: 0, async generate() { o.calls++; return out; } };
  return o as unknown as TextAi & { calls: number };
};
const BASE = '그 일로 가장 먼저 도와주고 싶은 사람은 누구인가요?';

describe('반응 문장 검사', () => {
  test('짧은 한 문장만 통과', () => {
    expect(cleanReaction('동네 어르신 장보기를 직접 보셨군요.')).toBe('동네 어르신 장보기를 직접 보셨군요.');
    expect(cleanReaction('"좋은 출발이에요"')).toBe('좋은 출발이에요.');
    expect(cleanReaction('누구를 돕고 싶으세요?')).toBeNull();
    expect(cleanReaction('그렇군요. 그럼 다음으로 넘어가요.')).toBeNull();
    expect(cleanReaction('한번 직접 물어보세요.')).toBeNull();
    expect(cleanReaction('가'.repeat(80) + '.')).toBeNull();
    expect(cleanReaction(null)).toBeNull();
  });
});

describe('질문: 규칙 질문 원문 + 반응 한 문장', () => {
  test('질문 문장은 바뀌지 않고 반응이 앞에 붙는다', async () => {
    const ai = fakeAi('동네 어르신 장보기를 직접 보셨군요.');
    const q = await exploreAi(ai, () => true, 'u', 0).question(BASE, '동네 어르신 장보기를 도와드리고 싶어요');
    expect(q.text).toBe(`동네 어르신 장보기를 직접 보셨군요. ${BASE}`);
    expect(q.text.endsWith(BASE)).toBe(true);
  });
  test('AI 가 질문을 다시 쓰면 버리고 규칙 질문만', async () => {
    const ai = fakeAi('가장 먼저 도움을 청하고 싶은 사람은 누구인가요?');
    expect((await exploreAi(ai, () => true, 'u', 0).question(BASE, '장보기')).text).toBe(BASE);
  });
  test('직전 답이 없으면 AI 를 부르지 않는다', async () => {
    const ai = fakeAi('반가워요.');
    expect((await exploreAi(ai, () => true, 'u', 0).question(BASE, '')).text).toBe(BASE);
    expect(ai.calls).toBe(0);
  });
  test('사용자가 말하지 않은 숫자·금액은 사실 검사에서 막는다', async () => {
    const ai = fakeAi('3천만 원 지원을 받을 수 있겠네요.');
    expect((await exploreAi(ai, () => true, 'u', 0).question(BASE, '장보기')).text).toBe(BASE);
  });
});
