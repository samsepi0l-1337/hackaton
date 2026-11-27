import { describe, expect, test } from 'bun:test';
import { DOCUMENT_PARSE_MAX_BYTES, type Attachment } from '@gil/shared';
import { kindOf, parseDocument, MAX_TEXT_CHARS } from '../src/docs/parse';
import { pickAttachment, readAnnouncementForm, type DocWorkerClient } from '../src/docs/pipeline';
import { PRE_STARTUP_PLAN } from './docs-fixtures';

const env = { UPSTAGE_API_KEY: 'k' };
const file = { bytes: new TextEncoder().encode('x'), fileName: '사업계획서.hwpx' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const parseOk = (markdown: string, text = '') => async () => json({ content: { markdown, text, html: '' }, elements: [] });

describe('kindOf', () => {
  test('확장자, 대문자, 매직 바이트', () => {
    expect(kindOf('a.HWPX')).toBe('hwpx');
    expect(kindOf('양식.docx')).toBe('docx');
    expect(kindOf('a.pdf')).toBe('pdf');
    expect(kindOf('a.hwp')).toBe('hwp');
    expect(kindOf('noext', new TextEncoder().encode('%PDF-1.7'))).toBe('pdf');
    expect(kindOf('noext', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0]))).toBe('hwp');
    expect(kindOf('noext', new Uint8Array([1, 2, 3, 4]))).toBe('unknown');
  });
});

describe('parseDocument', () => {
  test('성공: markdown 우선, 요청 형식 확인', async () => {
    let seen: { url: string; headers: Headers; form: FormData } | null = null;
    const f = async (url: string, init?: RequestInit) => {
      seen = { url, headers: new Headers(init?.headers), form: init!.body as FormData };
      return json({ content: { markdown: '## 본문', text: '평문' } });
    };
    const r = await parseDocument({ ...env, CF_AIG_TOKEN: 't', UPSTAGE_BASE_URL: 'https://gw.example/v1/' }, file, { fetch: f });
    expect(r?.text).toBe('## 본문');
    expect(r?.kind).toBe('hwpx');
    expect(seen!.url).toBe('https://gw.example/v1/document-digitization');
    expect(seen!.headers.get('authorization')).toBe('Bearer k');
    expect(seen!.headers.get('cf-aig-authorization')).toBe('Bearer t');
    expect(seen!.form.get('model')).toBe('document-parse');
    expect((seen!.form.get('document') as File).name).toBe('사업계획서.hwpx');
  });
  test('기본 URL, 게이트웨이 헤더 없음', async () => {
    let url = '';
    let h: Headers | null = null;
    await parseDocument(env, file, { fetch: async (u, i) => ((url = u), (h = new Headers(i?.headers)), json({ content: { text: 't' } })) });
    expect(url).toBe('https://api.upstage.ai/v1/document-digitization');
    expect(h!.has('cf-aig-authorization')).toBe(false);
  });
  test('markdown 이 비면 text, 항목 추출 포함', async () => {
    const r = await parseDocument(env, file, { fetch: parseOk('', PRE_STARTUP_PLAN) });
    expect(r?.fields.length).toBeGreaterThan(5);
  });
  test('50,000자 초과는 자르고 경고', async () => {
    const r = await parseDocument(env, file, { fetch: parseOk('가'.repeat(60_000)) });
    expect(r?.text.length).toBe(MAX_TEXT_CHARS);
    expect(r?.warnings.length).toBe(1);
  });
  test('크기 초과는 호출 없이 null', async () => {
    let called = false;
    const big = { bytes: { byteLength: DOCUMENT_PARSE_MAX_BYTES + 1 } as unknown as Uint8Array, fileName: 'a.pdf' };
    expect(await parseDocument(env, big, { fetch: async () => ((called = true), json({})) })).toBeNull();
    expect(called).toBe(false);
  });
  test('500, 네트워크 오류, 빈 본문, 키 없음은 null', async () => {
    expect(await parseDocument(env, file, { fetch: async () => json({}, 500) })).toBeNull();
    expect(await parseDocument(env, file, { fetch: async () => { throw new Error('boom'); } })).toBeNull();
    expect(await parseDocument(env, file, { fetch: parseOk('', '') })).toBeNull();
    expect(await parseDocument({}, file, { fetch: parseOk('x') })).toBeNull();
  });
});

describe('pickAttachment', () => {
  const a = (name: string, kind: Attachment['kind']): Attachment => ({ name, kind, url: `https://x/${name}` });
  test('이름 힌트가 형식보다 우선, 같으면 hwpx>docx>hwp>pdf', () => {
    expect(pickAttachment([a('공고문.hwpx', 'hwpx'), a('사업계획서.pdf', 'pdf')])?.name).toBe('사업계획서.pdf');
    expect(pickAttachment([a('신청서.pdf', 'pdf'), a('신청서.hwp', 'hwp'), a('신청서.docx', 'docx')])?.name).toBe('신청서.docx');
    expect(pickAttachment([a('a.pdf', 'pdf'), a('b.hwpx', 'hwpx')])?.name).toBe('b.hwpx');
    expect(pickAttachment([a('x.zip', 'unknown')])).toBeNull();
    expect(pickAttachment([])).toBeNull();
  });
});

describe('readAnnouncementForm', () => {
  const b64 = (s: string) => Buffer.from(s).toString('base64');
  const att = { name: '사업계획서.hwpx', url: 'https://k/dl/1', kind: 'hwpx' as const };
  const worker = (over: Partial<Record<string, () => Response>> = {}): DocWorkerClient & { calls: [string, any][] } => {
    const calls: [string, any][] = [];
    return {
      calls,
      async fetch(path, body) {
        calls.push([path, body]);
        if (over[path]) return over[path]!();
        if (path === '/discover') return json({ pageUrl: 'p', title: 't', attachments: [{ name: '공고문.pdf', url: 'https://k/dl/0', kind: 'pdf' }, att] });
        return json({ fileName: '사업계획서.hwpx', kind: 'hwpx', bytes: 3, fileBase64: b64('abc') });
      },
    };
  };

  test('정상 흐름', async () => {
    const w = worker();
    const r = await readAnnouncementForm(env, { docWorker: w, fetch: parseOk(PRE_STARTUP_PLAN) }, 'https://k/page');
    if ('error' in r) throw new Error(r.error);
    expect(r.attachment.name).toBe('사업계획서.hwpx');
    expect(r.fields.map((f) => f.label)).toContain('창업 아이템 개요');
    expect(r.parsed.kind).toBe('hwpx');
    expect(w.calls[0]).toEqual(['/discover', { pageUrl: 'https://k/page' }]);
    expect(w.calls[1]).toEqual(['/download', { url: 'https://k/dl/1', referer: 'https://k/page' }]);
  });
  test('discover 실패, 첨부 없음, download 실패, 파싱 실패, 예외', async () => {
    const run = (w: DocWorkerClient, fetch = parseOk('x')) => readAnnouncementForm(env, { docWorker: w, fetch }, 'u');
    const err = { error: { code: 'fetch_failed', message: '막힘' } };
    expect(await run(worker({ '/discover': () => json(err, 502) }))).toEqual({ error: '/discover 502: 막힘' });
    expect(await run(worker({ '/discover': () => json({ pageUrl: 'u', title: null, attachments: [] }) }))).toHaveProperty('error');
    expect(await run(worker({ '/download': () => json(err, 502) }))).toHaveProperty('error');
    expect(await run(worker(), async () => json({}, 500))).toEqual({ error: '문서 읽기에 실패했습니다' });
    const thrower: DocWorkerClient = { fetch: async () => { throw new Error('do down'); } };
    expect(await run(thrower)).toHaveProperty('error');
  });
});
