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
  text(slide, '부산 창업 길잡이', 0.72, 7.02, 5, 0.27, 18, { color: muted });
  text(slide, String(index), 12.05, 7.02, 0.45, 0.27, 18, { color: muted, align: 'right' });
  slide.addNotes(notes[index - 1]);
  return slide;
}
function card(slide, x, y, w, h, heading, detail) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.12, line: { color: 'D5E4F5', width: 1 }, fill: { color: pale } });
  text(slide, heading, x + 0.25, y + 0.28, w - 0.5, 0.55, 25, { bold: true, color: blue, align: 'center' });
  text(slide, detail, x + 0.24, y + 1.05, w - 0.48, h - 1.25, 20, { align: 'center', valign: 'top', breakLine: false });
}

let s = base('부산 창업 길잡이', 1);
text(s, '지원사업을 놓치지 않도록,\n부산 청년의 첫 창업 준비를 잇습니다', 0.95, 1.75, 11.4, 1.55, 34, { bold: true, breakLine: false });
text(s, '찾기 어려운 지원  ·  알기 어려운 자격', 0.98, 3.75, 11.2, 0.52, 25, { color: muted });
text(s, '탐색 상담에서 근거 있는 지역 경로까지', 0.98, 4.55, 11.2, 0.6, 27, { color: blue, bold: true });

s = base('창업의 첫 질문부터 막힐 수 있습니다', 2);
card(s, 0.9, 1.75, 5.45, 2.45, '무엇을 준비해야 할까?', '경험이 적으면 생각을 정리하고\n필요한 도움을 구분하기 어렵다');
card(s, 6.7, 1.75, 5.65, 2.45, '어떤 지원을 이용할까?', '공고마다 다른 조건을\n직접 살펴봐야 한다');
text(s, '문제 가설: PRD §2  ·  사용자 인터뷰 전', 1, 4.72, 11.5, 0.45, 20, { color: muted });
text(s, '[사용자 테스트 n명 · 결과 입력 필요]', 1, 5.42, 11.5, 0.5, 22, { color: blue, bold: true });

s = base('생각 정리부터 다음 준비까지', 3);
card(s, 0.8, 2.0, 3.55, 2.55, '탐색 상담', '관심과 상황을 입력하고\n쉬운 질문으로 구상 정리');
card(s, 4.88, 2.0, 3.55, 2.55, '지역 경로 최대 Top 3', '조건과 관련 이유,\n공식 원문 확인');
card(s, 8.96, 2.0, 3.55, 2.55, '준비 계획', '현재 단계에 필요한\n우선 준비사항 안내');
text(s, '→', 4.4, 2.85, 0.4, 0.5, 28, { color: blue, align: 'center' });
text(s, '→', 8.48, 2.85, 0.4, 0.5, 28, { color: blue, align: 'center' });
text(s, '맞는 경로가 없으면 없다고 안내합니다.', 0.95, 5.35, 11.5, 0.5, 22, { color: muted });

s = base('AI는 설명하고, 자격은 규칙으로 비교', 4);
card(s, 0.85, 1.7, 3.75, 2.55, 'Solar', '상담 · 추천 이유\n공고 요약');
card(s, 4.8, 1.7, 3.75, 2.55, 'Solar Decide', '관련도 순위와 확률\n자격 판정은 아님');
card(s, 8.75, 1.7, 3.75, 2.55, 'Document Parse', 'HWP · HWPX · PDF\n공고 양식 읽기');
text(s, '자격은 규칙으로 대조  ·  모르면 확인 필요', 0.95, 4.85, 11.7, 0.55, 24, { color: blue, bold: true });
text(s, '금액과 날짜는 공고 근거로 확인합니다.', 0.95, 5.62, 11.7, 0.45, 21, { color: muted });

s = base('테스트로 고치고, 더 가볍게', 5);
card(s, 0.85, 1.72, 3.75, 2.4, '312개 통과', '단위 테스트\n라인 커버리지 99.90%');
card(s, 4.8, 1.72, 3.75, 2.4, 'E2E 13개', '개발·프로덕션 빌드\n각각 2회 연속 통과');
card(s, 8.75, 1.72, 3.75, 2.4, '초기 JS −20%', 'gzip 90.29 → 72.60 kB\n경로별 코드 분할');
text(s, '발견·수정: 직접 입력 오류, 하트 되돌림, 날짜 예외, 요약 재시도', 0.95, 4.7, 11.65, 0.65, 21, { color: muted });

s = base('부산에서 시작해 동남권으로', 6);
text(s, '검수된 지역 자료와 실제 사용자 피드백을 바탕으로\n울산·경남까지 확장하겠습니다.', 0.95, 1.65, 11.6, 1.05, 27, { bold: true });
text(s, '진행 중  |  Rust · WebAssembly 전환', 0.95, 3.3, 11.6, 0.5, 24, { color: blue, bold: true });
text(s, '동등성 확인 전까지 기존 TypeScript 서비스 운영', 0.95, 4.02, 11.6, 0.5, 21, { color: muted });
text(s, '탐색     ·     근거     ·     준비', 0.95, 5.4, 11.6, 0.75, 32, { color: blue, bold: true, align: 'center' });

await pptx.writeFile({ fileName: fileURLToPath(new URL('./gil-pitch.pptx', import.meta.url)) });
