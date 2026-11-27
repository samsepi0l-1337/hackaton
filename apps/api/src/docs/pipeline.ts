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
import type { ParsedDocRecord } from '../db/schema';
import { parseDocument, type FetchFn } from './parse';

export interface DocWorkerClient {
  /** path: '/discover' | '/download'. 응답은 doc-worker 의 JSON 응답 그대로. */
  fetch(path: string, body: unknown): Promise<Response>;
}

/** 파싱 결과 저장소 (store 의 `doc:` 레코드). 첨부 URL 로 찾는다. */
export interface ParsedDocCache {
  get(url: string): ParsedDocRecord | undefined;
  put(r: ParsedDocRecord): void;
}

export interface PipelineDeps {
  docWorker: DocWorkerClient;
  fetch?: FetchFn; // Document Parse 호출용
  /** 있으면 파싱 결과를 저장하고, 같은 첨부는 다시 내려받거나 파싱하지 않는다. */
  docs?: ParsedDocCache;
  /** Solar 로 문서 정리. 실패하면 null. */
  summarize?: (doc: ParsedDocument) => Promise<string | null>;
  /** 정리를 기다리는 최대 시간. 넘으면 정리 없이 저장한다 (양식 읽기 전체 시간 제한 안에 들어가야 한다). */
  summaryTimeoutMs?: number;
  now?: () => Date;
}

export const SUMMARY_TIMEOUT_MS = 10_000;
export const MAX_SUMMARY_ATTEMPTS = 3;

export type FormResult =
  | { attachment: Attachment; parsed: ParsedDocument; fields: ExtractedField[]; summary: string | null; cached: boolean }
  | { error: string };

async function summarizeSafe(deps: PipelineDeps, doc: ParsedDocument): Promise<string | null> {
  if (!deps.summarize) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((r) => { timer = setTimeout(() => r(null), deps.summaryTimeoutMs ?? SUMMARY_TIMEOUT_MS); });
    return await Promise.race([deps.summarize(doc), timeout]);
  } catch (e) {
    console.warn(`[docs] 문서 정리 실패: ${(e as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function saveSafe(deps: PipelineDeps, r: ParsedDocRecord) {
  try {
    deps.docs?.put(r);
  } catch (e) {
    console.warn(`[docs] 파싱 결과 저장 실패: ${(e as Error).message}`);
  }
}

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

  const hit = deps.docs?.get(attachment.url);
  if (hit) {
    const parsed: ParsedDocument = { fileName: hit.fileName, kind: hit.kind, text: hit.text, fields: hit.fields, warnings: hit.warnings };
    let summary = hit.summary;
    const attempts = hit.summaryAttempts ?? 0;
    if (summary === null && deps.summarize && attempts < MAX_SUMMARY_ATTEMPTS) {
      summary = await summarizeSafe(deps, parsed);
      saveSafe(deps, summary !== null ? { ...hit, summary } : { ...hit, summaryAttempts: attempts + 1 });
    }
    return { attachment, parsed, fields: parsed.fields, summary, cached: true };
  }

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
  const summary = await summarizeSafe(deps, parsed);
  saveSafe(deps, {
    url: attachment.url,
    fileName: parsed.fileName.slice(0, 300),
    kind: parsed.kind,
    text: parsed.text,
    fields: parsed.fields.slice(0, 200).map((f) => ({ ...f, label: f.label.slice(0, 300) })),
    warnings: parsed.warnings.slice(0, 20).map((w) => w.slice(0, 300)),
    summary,
    summaryAttempts: summary === null ? 1 : 0,
    parsedAt: (deps.now?.() ?? new Date()).toISOString(),
  });
  return { attachment, parsed, fields: parsed.fields, summary, cached: false };
}
