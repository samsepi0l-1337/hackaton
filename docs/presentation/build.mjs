import pptxgen from 'pptxgenjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = '해보까';
pptx.subject = 'ICT INNOHACK 2026';
pptx.title = '해보까';
pptx.lang = 'ko-KR';
pptx.theme = { headFontFace: 'Apple SD Gothic Neo', bodyFontFace: 'Apple SD Gothic Neo', lang: 'ko-KR' };
const blue = '1765C1', ink = '15273C', muted = '536579', pale = 'EDF4FC';
const notes = (await readFile(new URL('./script.md', import.meta.url), 'utf8'))
  .split(/^## \d+\s*$/m).slice(1).map(s => s.trim());
if (notes.length !== 7 || notes.some(s => !s)) throw new Error('슬라이드별 대본 7개가 필요합니다.');

function text(slide, value, x, y, w, h, size = 24, opts = {}) {
  slide.addText(value, { x, y, w, h, fontFace: 'Apple SD Gothic Neo', fontSize: size, color: ink, margin: 0, breakLine: false, valign: 'mid', ...opts });
}
function base(title, index) {
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  slide.addShape(pptx.ShapeType.rect, { x: 0.65, y: 0.52, w: 0.13, h: 0.55, line: { color: blue }, fill: { color: blue } });
  text(slide, title, 0.95, 0.45, 11.65, 0.75, 34, { bold: true });
  slide.addShape(pptx.ShapeType.line, { x: 0.7, y: 6.94, w: 11.9, h: 0, line: { color: 'DBE5F0', width: 1 } });
  if (index !== 1) text(slide, '해보까', 0.72, 7.02, 5, 0.27, 18, { color: muted });
  text(slide, String(index), 12.05, 7.02, 0.45, 0.27, 18, { color: muted, align: 'right' });
  slide.addNotes(notes[index - 1]);
  return slide;
}
function card(slide, x, y, w, h, heading, detail) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.12, line: { color: 'D5E4F5', width: 1 }, fill: { color: pale } });
  text(slide, heading, x + 0.25, y + 0.28, w - 0.5, 0.55, 25, { bold: true, color: blue, align: 'center' });
  text(slide, detail, x + 0.24, y + 1.05, w - 0.48, h - 1.25, 20, { align: 'center', valign: 'top', breakLine: false });
}

let s = base('해보까', 1);
text(s, '[팀명]', 0.98, 1.25, 4, 0.4, 18, { color: muted });
text(s, '부산 청년 창업,\n한번 해볼까?', 0.95, 1.95, 11.4, 1.55, 40, { bold: true });
text(s, '막연한 창업 생각을 지원사업과 지원서 초안까지', 0.98, 3.95, 11.2, 0.52, 25, { color: muted });
text(s, 'haeboka.dreamp.org', 0.98, 4.75, 11.2, 0.6, 27, { color: blue, bold: true });

s = base('창업의 첫 질문부터 막힙니다', 2);
card(s, 0.9, 1.75, 3.6, 2.6, '무엇부터?', '생각은 있는데\n무엇을 준비할지\n모른다');
card(s, 4.85, 1.75, 3.6, 2.6, '어떤 지원?', '공고는 많고\n조건은 제각각이다');
card(s, 8.8, 1.75, 3.6, 2.6, '어떻게 쓰지?', '지원서 양식 앞에서\n다시 멈춘다');
text(s, '실사용자 13명 중 11명이 "무엇부터 알아봐야 할지 잘 모른다"고 답했어요.', 0.95, 5.0, 11.6, 0.55, 21, { color: blue, bold: true });

s = base('찾고, 정리하고, 써 봅니다', 3);
card(s, 0.8, 1.8, 3.55, 2.75, '맞춤형 공고', '지역·구·군 선택\n내 조건 대조\n마감 D-day');
card(s, 4.88, 1.8, 3.55, 2.75, 'AI 창업 상담', '관심 공고에서 시작\n쉬운 질문 3단계\n다음에 할 일');
card(s, 8.96, 1.8, 3.55, 2.75, '지원서 초안', '상담 내용으로\nAI가 양식을 채움\n주 2회 연습');
text(s, '→', 4.4, 2.85, 0.4, 0.5, 28, { color: blue, align: 'center' });
text(s, '→', 8.48, 2.85, 0.4, 0.5, 28, { color: blue, align: 'center' });
text(s, '하트·최근 본 공고·관심 공고로 상담과 추천이 개인화됩니다.', 0.95, 5.1, 11.5, 0.5, 21, { color: blue, bold: true });

s = base('실제 자료와 국산 AI로 만듭니다', 4);
card(s, 0.85, 1.7, 3.75, 2.55, '실제 공고', 'K-Startup 공고 104건\n부산 기관 자료 7건\n매일 자동 갱신');
card(s, 4.8, 1.7, 3.75, 2.55, 'Upstage Solar', '질문·요약·추천 이유\n지원서 초안 작성');
card(s, 8.75, 1.7, 3.75, 2.55, '조건은 규칙으로', '나이·거주지·사업자\n모르면 확인 필요');
text(s, 'Rust → WebAssembly, Cloudflare Workers 한 곳에서 동작', 0.95, 4.85, 11.7, 0.55, 22, { color: blue, bold: true });
text(s, '가상 평가 · 11명·공고 30건: 질문 의미 유지 2/11 → 11/11, 첫 추천 적중 0.09 → 0.91', 0.95, 5.55, 11.7, 0.65, 18, { color: muted });

s = base('실사용자 13명이 써 봤습니다', 5);
card(s, 0.85, 1.7, 3.75, 2.4, '4.2 / 5', '서비스 목적을\n알 수 있었다');
card(s, 4.8, 1.7, 3.75, 2.4, '4.0 / 5', '이 서비스를\n이용할 의향이 있다');
card(s, 8.75, 1.7, 3.75, 2.4, '당일 반영', '페이지 정리·지역 선택\n결과 화면 다음 할 일');
text(s, '"결과가 어렵다" → 다음에 할 일과 지원서 초안으로 이어지게 바꿨어요.', 0.95, 4.75, 11.7, 0.55, 21, { color: blue, bold: true });

s = base('테이블에서 직접 보여드립니다', 6);
text(s, '공고 찾기 → 관심 공고로 AI 상담', 0.95, 1.9, 11.5, 0.75, 28, { bold: true });
text(s, '다음에 할 일 → 지원서 초안 → 모의 제출', 0.95, 3.0, 11.5, 0.75, 28, { bold: true, color: blue });
text(s, '모의 제출은 연습용이고, 실제 신청은 공식 사이트에서 해요.', 0.95, 4.3, 11.5, 0.6, 20, { color: muted });

s = base('부산에서 시작해 동남권으로', 7);
text(s, '부산·울산·경남 구·군 단위로\n지원 경로를 넓혀 갑니다.', 0.95, 1.65, 11.6, 1.05, 27, { bold: true });
text(s, '시연: https://haeboka.dreamp.org', 0.95, 3.4, 11.6, 0.6, 22, { color: blue, bold: true });
text(s, '찾고     ·     정리하고     ·     써 본다', 0.95, 5.2, 11.6, 0.75, 32, { color: blue, bold: true, align: 'center' });

await pptx.writeFile({ fileName: fileURLToPath(new URL('./gil-pitch.pptx', import.meta.url)) });
