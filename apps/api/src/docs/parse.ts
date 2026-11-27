import { upstageHeaders, upstageReady } from '../ai/upstage';
// Upstage Document Parse 호출. 실패해도 던지지 않고 null 을 돌려준다.
import {
  DOCUMENT_PARSE_MAX_BYTES,
  DOCUMENT_PARSE_MODEL,
  UPSTAGE_BASE_URL,
  type DocKind,
  type ParsedDocument,
} from '@gil/shared';
import type { Bindings } from '../env';
import { extractFields } from './fields';

export const MAX_TEXT_CHARS = 50_000;

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface DocFile {
  bytes: Uint8Array;
  fileName: string;
}

const EXT_KIND: Record<string, DocKind> = { hwpx: 'hwpx', docx: 'docx', pdf: 'pdf', hwp: 'hwp' };

/** 확장자 우선, 없으면 매직 바이트로 종류를 정한다. */
export function kindOf(fileName: string, bytes?: Uint8Array): DocKind {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)\s*$/)?.[1];
  if (ext && EXT_KIND[ext]) return EXT_KIND[ext];
  if (!bytes || bytes.length < 4) return 'unknown';
  const at = (...b: number[]) => b.every((v, i) => bytes[i] === v);
  if (at(0x25, 0x50, 0x44, 0x46)) return 'pdf'; // %PDF
  if (at(0xd0, 0xcf, 0x11, 0xe0)) return 'hwp'; // OLE2 (HWP 5.x)
  if (at(0x50, 0x4b, 0x03, 0x04)) {
    // zip: hwpx 는 mimetype 파일이 맨 앞에 있고, docx 는 [Content_Types].xml 이 있다.
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 2048)));
    if (head.includes('hwpml') || head.includes('mimetype')) return 'hwpx';
    if (head.includes('[Content_Types]') || head.includes('word/')) return 'docx';
  }
  return 'unknown';
}

const trimSlash = (s: string) => s.replace(/\/+$/, '');

export async function parseDocument(
  env: Bindings,
  file: DocFile,
  opts: { fetch?: FetchFn } = {},
): Promise<ParsedDocument | null> {
  const kind = kindOf(file.fileName, file.bytes);
  const warnings: string[] = [];
  if (file.bytes.byteLength > DOCUMENT_PARSE_MAX_BYTES) {
    console.warn(`[docs] 파일이 너무 큼: ${file.fileName} (${file.bytes.byteLength} bytes)`);
    return null;
  }
  if (!upstageReady(env)) {
    console.warn('[docs] Upstage 설정 없음 (키 또는 게이트웨이), 문서 파싱 생략');
    return null;
  }
  const doFetch: FetchFn = opts.fetch ?? ((u, i) => fetch(u, i));
  const url = `${trimSlash(env.UPSTAGE_BASE_URL || UPSTAGE_BASE_URL)}/document-digitization`;
  const form = new FormData();
  form.set('model', DOCUMENT_PARSE_MODEL);
  form.set('mode', 'standard'); // Enhanced(Premium) 과금 금지. auto 는 복잡한 쪽을 Enhanced 로 돌린다
  form.set('ocr', 'auto');
  form.set('output_formats', "['markdown','text']");
  form.set('coordinates', 'false');
  form.set('document', new Blob([file.bytes as BlobPart]), file.fileName);
  const headers = upstageHeaders(env);

  try {
    const res = await doFetch(url, { method: 'POST', headers, body: form });
    if (!res.ok) {
      console.warn(`[docs] Document Parse ${res.status}`);
      return null;
    }
    const json = (await res.json()) as {
      content?: { markdown?: string; text?: string; html?: string };
      elements?: { content?: { markdown?: string; text?: string } }[];
    };
    let text = json.content?.markdown?.trim() || json.content?.text?.trim() || '';
    if (!text && json.elements?.length) {
      text = json.elements
        .map((e) => e.content?.markdown || e.content?.text || '')
        .filter(Boolean)
        .join('\n');
    }
    if (!text) {
      console.warn('[docs] Document Parse 응답에 본문 없음');
      return null;
    }
    if (text.length > MAX_TEXT_CHARS) {
      text = text.slice(0, MAX_TEXT_CHARS);
      warnings.push(`본문이 ${MAX_TEXT_CHARS}자를 넘어 잘랐습니다`);
    }
    return { fileName: file.fileName, kind, text, fields: extractFields(text), warnings };
  } catch (e) {
    console.warn(`[docs] Document Parse 실패: ${(e as Error).message}`);
    return null;
  }
}
