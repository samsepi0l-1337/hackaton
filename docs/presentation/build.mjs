import pptxgen from 'pptxgenjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = '부산 창업 길잡이';
pptx.subject = 'ICT INNOHACK 2026';
pptx.title = '부산 창업 길잡이';
pptx.lang = 'ko-KR';
pptx.theme = { headFontFace: 'Apple SD Gothic Neo', bodyFontFace: 'Apple SD Gothic Neo', lang: 'ko-KR' };
const blue = '1765C1', ink = '15273C', muted = '536579', pale = 'EDF4FC';
const notes = (await readFile(new URL('./script.md', import.meta.url), 'utf8'))
  .split(/^## \d+\s*$/m).slice(1).map(s => s.trim());
if (notes.length !== 6 || notes.some(s => !s)) throw new Error('슬라이드별 대본 6개가 필요합니다.');

function text(slide, value, x, y, w, h, size = 24, opts = {}) {
  slide.addText(value, { x, y, w, h, fontFace: 'Apple SD Gothic Neo', fontSize: size, color: ink, margin: 0, breakLine: false, valign: 'mid', ...opts });
}
function base(title, index) {
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  slide.addShape(pptx.ShapeType.rect, { x: 0.65, y: 0.52, w: 0.13, h: 0.55, line: { color: blue }, fill: { color: blue } });
  text(slide, title, 0.95, 0.45, 11.65, 0.75, 34, { bold: true });
  slide.addShape(pptx.ShapeType.line, { x: 0.7, y: 6.94, w: 11.9, h: 0, line: { color: 'DBE5F0', width: 1 } });
  if (index !== 1) text(slide, '부산 청년 창업 길잡이', 0.72, 7.02, 5, 0.27, 18, { color: muted });
  text(slide, String(index), 12.05, 7.02, 0.45, 0.27, 18, { color: muted, align: 'right' });
  slide.addNotes(notes[index - 1]);
  return slide;
}
function card(slide, x, y, w, h, heading, detail) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.12, line: { color: 'D5E4F5', width: 1 }, fill: { color: pale } });
  text(slide, heading, x + 0.25, y + 0.28, w - 0.5, 0.55, 25, { bold: true, color: blue, align: 'center' });
  text(slide, detail, x + 0.24, y + 1.05, w - 0.48, h - 1.25, 20, { align: 'center', valign: 'top', breakLine: false });
}

let s = base('부산 청년 창업 길잡이', 1);
text(s, '[팀명]', 0.98, 1.25, 4, 0.4, 18, { color: muted });
text(s, '막연한 창업 생각을\n다음 준비로', 0.95, 1.95, 11.4, 1.55, 38, { bold: true });
text(s, '창업 경험이 없는 부산 청년을 위해', 0.98, 3.95, 11.2, 0.52, 25, { color: muted });
text(s, '쉬운 질문에서 근거 있는 부산 준비 경로까지', 0.98, 4.75, 11.2, 0.6, 27, { color: blue, bold: true });

s = base('창업의 첫 질문부터 막힐 수 있습니다', 2);
card(s, 0.9, 1.75, 5.45, 2.45, '무엇을 준비해야 할까?', '생각을 설명하고\n이용 가능한 도움을 구분하기 어렵다');
card(s, 6.7, 1.75, 5.65, 2.45, '어떤 지원을 이용할까?', '공고마다 다른 조건을\n직접 살펴봐야 한다');
text(s, '사용자 인터뷰로 확인할 문제 가설입니다.', 1, 5.05, 11.5, 0.5, 22, { color: blue, bold: true });

s = base('생각 정리부터 다음 준비까지', 3);
card(s, 0.8, 2.0, 3.55, 2.55, '탐색 상담', '관심과 상황을 입력하고\n쉬운 질문으로 구상 정리');
card(s, 4.88, 2.0, 3.55, 2.55, '준비 계획', '현재 단계에 필요한\n우선 준비사항 안내');
card(s, 8.96, 2.0, 3.55, 2.55, '지역 경로 최대 3개', '조건과 관련 이유,\n공식 원문 확인');
text(s, '→', 4.4, 2.85, 0.4, 0.5, 28, { color: blue, align: 'center' });
text(s, '→', 8.48, 2.85, 0.4, 0.5, 28, { color: blue, align: 'center' });
text(s, '관심 분야: 조선·해양  ·  자동차  ·  수소·에너지 등', 0.95, 5.0, 11.5, 0.45, 20, { color: blue });
text(s, '맞는 경로가 없으면 없다고 안내합니다.', 0.95, 5.65, 11.5, 0.5, 20, { color: muted });

s = base('부산의 실제 자료와 연결합니다', 4);
card(s, 0.85, 1.7, 3.75, 2.55, '부산 기관', '교육·상담 기관\n공식 자료 7건');
card(s, 4.8, 1.7, 3.75, 2.55, '실제 공고', 'K-Startup 공고\n공식 원문 연결');
card(s, 8.75, 1.7, 3.75, 2.55, '조건 확인', '규칙으로 대조\n모르면 확인 필요');
text(s, '국산 AI는 대화와 공고 이해를 돕습니다.', 0.95, 4.85, 11.7, 0.55, 24, { color: blue, bold: true });
text(s, '가상 평가 · 11명·공고 30건: 질문 의미 유지 2/11 → 11/11, 첫 추천 적중 0.09 → 0.91', 0.95, 5.55, 11.7, 0.65, 18, { color: muted });

s = base('테이블에서 직접 보여드립니다', 5);
text(s, '설명용 예시: AI에 관심이 있고 조선·해양 분야\n업무를 지원하는 서비스를 구상하는 청년', 0.95, 1.55, 11.5, 1.1, 24, { color: muted });
text(s, '창업 준비 → 쉬운 질문 → 구상 요약', 0.95, 3.05, 11.5, 0.75, 28, { bold: true });
text(s, '준비사항 → 지역 경로 → 공식 원문', 0.95, 4.2, 11.5, 0.75, 28, { bold: true, color: blue });

s = base('부산에서 시작해 동남권으로', 6);
text(s, '사용자 검증과 지역 자료 검수를 바탕으로\n동남권 확장을 준비합니다.', 0.95, 1.65, 11.6, 1.05, 27, { bold: true });
text(s, '현장 사용자 검증 예정', 0.95, 3.15, 11.6, 0.5, 22, { color: blue, bold: true });
text(s, '시연: https://gil-api.samsepi0l1337.workers.dev\n테이블에서 바로 보여드립니다', 0.95, 4.05, 11.6, 0.9, 21, { color: muted });
text(s, '탐색     ·     근거     ·     준비', 0.95, 5.4, 11.6, 0.75, 32, { color: blue, bold: true, align: 'center' });

await pptx.writeFile({ fileName: fileURLToPath(new URL('./gil-pitch.pptx', import.meta.url)) });
