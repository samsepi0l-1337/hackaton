// F19 창업 유형 테스트. 문항·설명은 팀이 새로 쓴 것이다(공식 MBTI 문항 아님). 재미·참고용.
import type { TypeAxis, TypeQuestion, TypeResult } from './types';

export const TYPE_AXES: { axis: TypeAxis; left: string; right: string; leftName: string; rightName: string }[] = [
  { axis: 'AP', left: 'A', right: 'P', leftName: '먼저 해 본다', rightName: '먼저 계획한다' },
  { axis: 'ST', left: 'S', right: 'T', leftName: '혼자 빠르게', rightName: '함께 크게' },
  { axis: 'DH', left: 'D', right: 'H', leftName: '기술·제품', rightName: '사람·서비스' },
  { axis: 'CK', left: 'C', right: 'K', leftName: '도전', rightName: '안정' },
];

const q = (id: number, axis: TypeAxis, text: string, a: string, b: string): TypeQuestion => {
  const ax = TYPE_AXES.find((x) => x.axis === axis)!;
  return { id, axis, text, options: [{ letter: ax.left, text: a }, { letter: ax.right, text: b }] };
};

export const TYPE_QUESTIONS: TypeQuestion[] = [
  q(1, 'AP', '새 아이디어가 떠오르면?', '일단 작게 만들어 본다', '자료부터 찾아 정리한다'),
  q(2, 'AP', '해커톤 첫 1시간에 나는?', '바로 화면부터 그린다', '기능 목록과 일정을 짠다'),
  q(3, 'AP', '계획이 틀어지면?', '그 자리에서 방향을 바꾼다', '계획을 다시 세운다'),
  q(4, 'ST', '일이 몰릴 때 나는?', '혼자 밤새 끝낸다', '사람을 모아 나눈다'),
  q(5, 'ST', '창업 파트너는?', '없어도 된다, 빠른 게 좋다', '꼭 있어야 한다'),
  q(6, 'ST', '네트워킹 행사는?', '필요할 때만 간다', '자주 가서 사람을 만난다'),
  q(7, 'DH', '더 끌리는 일은?', '제품 기능을 다듬는 일', '고객을 만나 이야기 듣는 일'),
  q(8, 'DH', '좋은 서비스의 기준은?', '기술이 뛰어나다', '쓰는 사람이 편하다'),
  q(9, 'DH', '주말에 보는 콘텐츠는?', '신기술·제품 리뷰', '사람·브랜드 이야기'),
  q(10, 'CK', '안정적인 월급 vs 큰 가능성?', '큰 가능성', '안정적인 월급'),
  q(11, 'CK', '첫 자금은?', '투자를 받아 빠르게 키운다', '작게 벌면서 키운다'),
  q(12, 'CK', '실패할 확률 50%인 기회라면?', '해 본다', '더 확실한 기회를 기다린다'),
];

const LETTER_TRAITS: Record<string, { word: string; strength: string; industry: string; category: string }> = {
  A: { word: '실행가', strength: '빠른 시제품 제작', industry: '앱·웹 서비스', category: '사업화' },
  P: { word: '설계자', strength: '꼼꼼한 사업 계획', industry: '교육', category: '창업교육' },
  S: { word: '솔로', strength: '빠른 의사결정', industry: '커머스', category: '시설·공간·보육' },
  T: { word: '팀빌더', strength: '사람을 모으는 힘', industry: '관광·문화', category: '행사·네트워크' },
  D: { word: '메이커', strength: '제품 완성도', industry: 'IT·플랫폼', category: '기술개발(R&D)' },
  H: { word: '커넥터', strength: '고객 공감', industry: '식품·외식', category: '멘토링·컨설팅' },
  C: { word: '챌린저', strength: '과감한 도전', industry: '해양·물류', category: '사업화' },
  K: { word: '키퍼', strength: '안정적인 운영', industry: '친환경', category: '융자' },
};

const CAUTION: Record<string, string> = {
  A: '계획 없이 달리다 서류 마감을 놓칠 수 있어요',
  P: '준비만 하다 시작이 늦어질 수 있어요',
};

/** answers: 문항 id → 고른 글자. 12문항이 다 있어야 한다. */
export function scoreTypeTest(answers: Record<number, string>): TypeResult {
  const axisScores = {} as TypeResult['axisScores'];
  let code = '';
  for (const ax of TYPE_AXES) {
    const qs = TYPE_QUESTIONS.filter((x) => x.axis === ax.axis);
    const left = qs.filter((x) => answers[x.id] === ax.left).length;
    const right = qs.filter((x) => answers[x.id] === ax.right).length;
    axisScores[ax.axis] = { left, right };
    code += left >= right ? ax.left : ax.right;
  }
  return describeType(code, axisScores);
}

export function describeType(code: string, axisScores?: TypeResult['axisScores']): TypeResult {
  const t = code.split('').map((l) => LETTER_TRAITS[l]!);
  return {
    code,
    name: `${t[0]!.word}형 ${t[2]!.word}`,
    oneLine: `${TYPE_AXES[0]!.axis === 'AP' && code[0] === 'A' ? '먼저 해 보고' : '먼저 계획하고'}, ${code[1] === 'S' ? '혼자 빠르게' : '함께 크게'} 움직이는 ${code[3] === 'C' ? '도전형' : '안정형'} 창업가`,
    strengths: [t[0]!.strength, t[2]!.strength],
    caution: CAUTION[code[0]!]!,
    industries: [...new Set([t[2]!.industry, t[1]!.industry])],
    categories: [...new Set([t[0]!.category, t[3]!.category])],
    axisScores: axisScores ?? (Object.fromEntries(TYPE_AXES.map((a) => [a.axis, { left: 0, right: 0 }])) as TypeResult['axisScores']),
  };
}

export function isValidTypeCode(code: unknown): code is string {
  return typeof code === 'string' && /^[AP][ST][DH][CK]$/.test(code);
}
