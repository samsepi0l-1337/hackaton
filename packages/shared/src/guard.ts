// 생성 문장의 사실 검사 (서버 Solar·브라우저 로컬 AI 공통). 금액·날짜·공고 이름을 새로 만들었으면 버린다(null).
import type { Program } from './types';

const MONEY = /\d[\d,.]*\s*(?:천|백)?\s*(?:만|억|조)?\s*원|\$\s?\d[\d,.]*|\d[\d,.]*\s*(?:만|억)(?![가-힣])/g;
const DATE = /\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}\s*월\s*\d{1,2}\s*일|\bD\s*[-+]\s*\d+\b|D-day/gi;
const QUOTED = /['"‘“「『]([^'"’”」』]{3,60})['"’”」』]/g;

const norm = (s: string) => s.replace(/[\s,]/g, '').toLowerCase();

export interface GuardOptions {
  /** 이 공고들의 금액·날짜·이름은 써도 된다. */
  programs?: Program[];
  /** 사용자가 직접 쓴 글 등, 여기 나온 숫자·날짜는 써도 된다. */
  allowedText?: string[];
  /** 이 이름 중 허용 목록에 없는 것이 글에 나오면 버린다. */
  knownTitles?: string[];
  maxLength?: number;
}

function dateForms(d: string | null): string[] {
  const m = d?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? [d!, `${+m[2]!}월${+m[3]!}일`] : [];
}

export function guardText(text: string | null | undefined, opts: GuardOptions = {}): string | null {
  if (!text) return null;
  const max = opts.maxLength ?? 300;
  let t = text.replace(/```[a-z]*|```/gi, '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const programs = opts.programs ?? [];
  const source = norm([...(opts.allowedText ?? []), ...programs.flatMap((p) => [p.title, p.content, p.target ?? '', p.targetAge ?? '', ...dateForms(p.endDate), ...dateForms(p.startDate)])].join(' '));
  for (const re of [MONEY, DATE]) {
    for (const m of t.matchAll(re)) if (!source.includes(norm(m[0]))) return null;
  }
  const allowedTitles = new Set(programs.map((p) => norm(p.title)));
  for (const k of opts.knownTitles ?? []) if (!allowedTitles.has(norm(k)) && norm(t).includes(norm(k))) return null;
  for (const m of t.matchAll(QUOTED)) {
    const q = norm(m[1]!);
    const isTitle = /사업|지원|공모|프로그램|챌린지|캠프|센터/.test(m[1]!);
    if (isTitle && !allowedTitles.has(q) && !source.includes(q)) return null;
  }
  if (t.length > max) {
    const cut = t.slice(0, max);
    const end = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('요'), cut.lastIndexOf('다'));
    t = end > max * 0.5 ? cut.slice(0, end + 1) : cut;
  }
  return t;
}

/** 모델이 JSON 앞뒤에 붙인 코드 펜스·설명을 걷어내고 파싱한다. 실패하면 null. */
export function parseJson(text: string | null): unknown {
  if (!text) return null;
  const m = text.match(/[\[{][\s\S]*[\]}]/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
