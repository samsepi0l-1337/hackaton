// 공고 상세 페이지 → 첨부 찾기 → 내려받기 → 파싱 → 양식 항목 추출.
import type {
  Attachment,
  DiscoverResponse,
  DocKind,
  DownloadResponse,
  ExtractedField,
  ParsedDocument,
} from '@gil/shared';
import type { Bindings } from '../env';
import { parseDocument, type FetchFn } from './parse';

export interface DocWorkerClient {
  /** path: '/discover' | '/download'. 응답은 doc-worker 의 JSON 응답 그대로. */
  fetch(path: string, body: unknown): Promise<Response>;
}

export interface PipelineDeps {
  docWorker: DocWorkerClient;
  fetch?: FetchFn; // Document Parse 호출용
}

export type FormResult =
  | { attachment: Attachment; parsed: ParsedDocument; fields: ExtractedField[] }
  | { error: string };

const NAME_HINTS = ['신청서', '사업계획서', '양식', '서식'];
const KIND_RANK: Record<DocKind, number> = { hwpx: 0, docx: 1, hwp: 2, pdf: 3, unknown: 9 };

export function pickAttachment(list: Attachment[]): Attachment | null {
  const usable = list.filter((a) => a.kind !== 'unknown');
  if (!usable.length) return null;
  const score = (a: Attachment) => (NAME_HINTS.some((h) => a.name.includes(h)) ? 0 : 100) + KIND_RANK[a.kind];
  return [...usable].sort((a, b) => score(a) - score(b))[0];
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function call<T>(dw: DocWorkerClient, path: string, body: unknown): Promise<T | string> {
  try {
    const res = await dw.fetch(path, body);
    if (!res.ok) {
      let msg = `${path} ${res.status}`;
      try {
        const j = (await res.json()) as { error?: { message?: string } };
        if (j.error?.message) msg += `: ${j.error.message}`;
      } catch {}
      return msg;
    }
    return (await res.json()) as T;
  } catch (e) {
    return `${path} 호출 실패: ${(e as Error).message}`;
  }
}

export async function readAnnouncementForm(env: Bindings, deps: PipelineDeps, pageUrl: string): Promise<FormResult> {
  const found = await call<DiscoverResponse>(deps.docWorker, '/discover', { pageUrl });
  if (typeof found === 'string') return { error: found };
  const attachment = pickAttachment(found.attachments ?? []);
  if (!attachment) return { error: '공고 페이지에서 읽을 수 있는 첨부파일을 찾지 못했습니다' };

  const dl = await call<DownloadResponse>(deps.docWorker, '/download', { url: attachment.url, referer: pageUrl });
  if (typeof dl === 'string') return { error: dl };

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(dl.fileBase64);
  } catch {
    return { error: '내려받은 파일을 해석하지 못했습니다' };
  }
  const parsed = await parseDocument(env, { bytes, fileName: dl.fileName || attachment.name }, { fetch: deps.fetch });
  if (!parsed) return { error: '문서 읽기에 실패했습니다' };
  return { attachment, parsed, fields: parsed.fields };
}
