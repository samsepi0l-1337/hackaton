// 규칙 기반 신청 양식 항목 추출. Document Parse 의 markdown/text 를 받는다.
import type { ExtractedField } from '@gil/shared';

export const MAX_FIELDS = 40;
const MAX_LABEL = 40;

const LIMIT_RES: RegExp[] = [
  /(?:최대\s*)?(\d[\d,]*)\s*자\s*(?:이내|이하|내외|까지|미만)?/,
  /(\d[\d,]*)\s*(?:byte|bytes|바이트)\s*(?:이내|이하|내외)?/i,
];
const REQUIRED_RE = /[(\[（<]\s*필수\s*[)\]）>]|\*+\s*$|^\s*\*+(?!\*)|필수\s*입력/;
// 번호·기호 머리표
const BULLET_RE =
  /^(?:\d{1,2}\s*-\s*\d{1,2}\s*[.)]?\s*|\d{1,2}\s*[.)]\s*|\(\s*\d{1,2}\s*\)\s*|[가-힣]\s*[.)]\s+|[①-⑳]\s*|[□■○●◦◯▶▷▪▫◆◇ㅇ]\s*|제\s*\d+\s*[장절항호]\s*|[-•·]\s+)+/;
const STRUCT_START_RE = /^(?:\d{1,2}\s*-\s*\d{1,2}\s*[.)]?\s*\S|\d{1,2}\s*[.)]\s*\S|\(\s*\d{1,2}\s*\)\s*\S|[가-힣]\s*[.)]\s+\S|[①-⑳]|[□■○●◦◯▶▷▪▫◆◇ㅇ]|제\s*\d+\s*[장절항호])/;

function parseLimit(s: string): number | null {
  for (const re of LIMIT_RES) {
    const m = s.match(re);
    if (m) {
      const n = Number(m[1].replace(/,/g, ''));
      if (n > 0 && n < 1_000_000) return n;
    }
  }
  return null;
}

function cleanLabel(raw: string): string {
  let s = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/\*\*|__|`/g, '')
    .replace(/^#+\s*/, '')
    .trim();
  s = s.replace(BULLET_RE, '');
  // 괄호 안의 글자수·필수 표기를 제거
  s = s.replace(/[(\[（<][^)\]）>]*(?:자|byte|바이트|필수)[^)\]）>]*[)\]）>]/gi, ' ');
  s = s.replace(/(?:최대\s*)?\d[\d,]*\s*(?:자|byte|바이트)\s*(?:이내|이하|내외|까지|미만)?/gi, ' ');
  s = s.replace(/\*+/g, ' ').replace(/[:：]\s*$/, '');
  return s.replace(/\s+/g, ' ').trim();
}

function looksLikeLabel(label: string): boolean {
  if (label.length < 2 || label.length > MAX_LABEL) return false;
  if (!/[가-힣A-Za-z]/.test(label)) return false;
  if (/^[-=:|\s]+$/.test(label)) return false;
  if (/(?:다|요|음|함)[.。]$/.test(label)) return false; // 서술문
  return true;
}

const HEADER_WORDS = new Set(['구분', '항목', '내용', '비고', '순번', '번호', '연번']);

function tableCells(line: string): string[] | null {
  const t = line.trim();
  if (!t.startsWith('|') || !t.includes('|', 1)) return null;
  const cells = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '')) return [];
  return cells;
}

interface Hit {
  label: string;
  maxLength: number | null;
  required: boolean;
}

function toHit(raw: string, context?: string): Hit | null {
  const label = cleanLabel(raw);
  if (!looksLikeLabel(label)) return null;
  const src = context ?? raw;
  return { label, maxLength: parseLimit(src), required: REQUIRED_RE.test(src) };
}

function fromTableRow(cells: string[]): Hit[] {
  const nonEmpty = cells.filter(Boolean);
  if (nonEmpty.length === 0) return [];
  // 모든 칸이 차 있으면 표 머리글이거나 이미 작성된 행이다 (표시가 있는 칸만 항목으로 본다)
  if (cells.length > 1 && nonEmpty.length === cells.length && !cells.some((c) => parseLimit(c) !== null || REQUIRED_RE.test(c))) return [];
  const hits: Hit[] = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!c || HEADER_WORDS.has(c)) continue;
    const next = cells[i + 1];
    const valueEmpty = next === undefined || next === '';
    // 라벨 칸: 뒤 칸이 비었거나, 제한 표기가 붙은 항목 칸
    const hasMarker = parseLimit(c) !== null || REQUIRED_RE.test(c);
    if (valueEmpty || hasMarker) {
      const h = toHit(c);
      if (h) hits.push(h);
      i++; // 값 칸은 건너뜀
    }
  }
  return hits;
}

export function extractFields(input: string): ExtractedField[] {
  const out: ExtractedField[] = [];
  const seen = new Map<string, ExtractedField>();
  const add = (h: Hit | null) => {
    if (!h) return;
    const key = h.label.replace(/\s+/g, '').toLowerCase();
    const prev = seen.get(key);
    if (prev) {
      // 같은 항목이 다시 나오면 더 구체적인 정보만 보충
      if (prev.maxLength == null && h.maxLength != null) prev.maxLength = h.maxLength;
      if (!prev.required && h.required) prev.required = true;
      return;
    }
    if (out.length >= MAX_FIELDS) return;
    const f: ExtractedField = { label: h.label, maxLength: h.maxLength, required: h.required };
    seen.set(key, f);
    out.push(f);
  };

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.replace(/<\/?(?:br|p|div|span)[^>]*>/gi, ' ').trim();
    if (!line) continue;
    const cells = tableCells(line);
    if (cells) {
      for (const h of fromTableRow(cells)) add(h);
      continue;
    }
    if (line.length > 90) continue; // 긴 본문 문장
    const isHeading = /^#{1,6}\s+/.test(line); // 번호·표시가 없는 제목(일반현황 등)은 항목이 아니다
    const stripped = line.replace(/^#{1,6}\s+/, '').replace(/^\*\*(.+)\*\*$/, '$1');
    if (/^[※*]\s*\S/.test(stripped) && !isHeading && parseLimit(stripped) === null) continue; // 안내 주석
    if (/^[-•·]\s+/.test(stripped) && parseLimit(stripped) === null && !REQUIRED_RE.test(stripped)) continue;
    const hasMarker = parseLimit(stripped) !== null || REQUIRED_RE.test(stripped);
    if (STRUCT_START_RE.test(stripped) || hasMarker) {
      // 번호·기호로 시작하거나 제목이면서 짧은 줄, 또는 글자수·필수 표기가 있는 줄
      if (!isHeading && !hasMarker && /(?:다|요|음|함)[.。]?$/.test(stripped)) continue;
      add(toHit(stripped));
    }
  }
  return out;
}
