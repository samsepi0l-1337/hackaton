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
card(s, 0.9, 1.75, 5.45, 2.45, '무엇을 준비해야 할까?', '경험이 적으면 생각을 정리하고\n필요한 도움을 구분하기 어렵다');
card(s, 6.7, 1.75, 5.65, 2.45, '어떤 지원을 이용할까?', '공고마다 다른 조건을\n직접 살펴봐야 한다');
text(s, '내 생각을 정리하고 필요한 도움을 찾는 것부터', 1, 5.05, 11.5, 0.5, 22, { color: blue, bold: true });

s = base('생각 정리부터 다음 준비까지', 3);
card(s, 0.8, 2.0, 3.55, 2.55, '탐색 상담', '관심과 상황을 입력하고\n쉬운 질문으로 구상 정리');
card(s, 4.88, 2.0, 3.55, 2.55, '지역 경로 최대 3개', '조건과 관련 이유,\n공식 원문 확인');
card(s, 8.96, 2.0, 3.55, 2.55, '준비 계획', '현재 단계에 필요한\n우선 준비사항 안내');
text(s, '→', 4.4, 2.85, 0.4, 0.5, 28, { color: blue, align: 'center' });
text(s, '→', 8.48, 2.85, 0.4, 0.5, 28, { color: blue, align: 'center' });
text(s, '맞는 경로가 없으면 없다고 안내합니다.', 0.95, 5.35, 11.5, 0.5, 22, { color: muted });

s = base('AI는 설명하고, 자격은 규칙으로 비교', 4);
card(s, 0.85, 1.7, 3.75, 2.55, 'Solar', '상담 · 추천 이유\n공고 요약');
card(s, 4.8, 1.7, 3.75, 2.55, 'Solar Decide', '관련도 순위와 확률\n자격 판정은 아님');
card(s, 8.75, 1.7, 3.75, 2.55, 'Document Parse', 'HWP · HWPX · PDF\n공고 양식 읽기');
text(s, '자격은 규칙으로 대조  ·  모르면 확인 필요', 0.95, 4.85, 11.7, 0.55, 24, { color: blue, bold: true });
text(s, '금액·날짜는 공고 근거로 확인', 0.95, 5.62, 11.7, 0.45, 21, { color: muted });

s = base('준비 방향과 공식 경로를 함께', 5);
text(s, '내 생각을 구체화하고\n지금 필요한 준비를 살펴봅니다', 0.95, 1.8, 11.5, 1.4, 34, { bold: true });
text(s, '관련 이유와 공식 원문을 확인해 다음 행동을 선택합니다.', 0.95, 3.75, 11.5, 0.7, 24, { color: blue });
text(s, '테스트 312개 · E2E 13개 · 초기 로딩 JS 약 20% 감소', 0.95, 5.3, 11.5, 0.65, 22, { color: muted });

s = base('부산에서 시작해 동남권으로', 6);
text(s, '검수된 지역 자료와 실제 사용자 피드백을 바탕으로\n울산·경남까지 확장하겠습니다.', 0.95, 1.65, 11.6, 1.05, 27, { bold: true });
text(s, 'Rust 전환 진행 중', 0.95, 3.15, 11.6, 0.5, 22, { color: blue, bold: true });
text(s, '시연: https://gil-api.samsepi0l1337.workers.dev\n테이블에서 바로 보여드립니다', 0.95, 4.05, 11.6, 0.9, 21, { color: muted });
text(s, '탐색     ·     근거     ·     준비', 0.95, 5.4, 11.6, 0.75, 32, { color: blue, bold: true, align: 'center' });

await pptx.writeFile({ fileName: fileURLToPath(new URL('./gil-pitch.pptx', import.meta.url)) });
