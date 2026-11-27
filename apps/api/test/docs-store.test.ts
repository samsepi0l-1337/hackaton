import { describe, expect, test } from 'bun:test';
import type { ParsedDocRecord } from '../src/db/schema';
import { readAnnouncementForm, type DocWorkerClient, type ParsedDocCache } from '../src/docs/pipeline';
import * as pipeline from '../src/docs/pipeline';
import { createAiTasks } from '../src/ai/tasks';
import { createStore, memoryKv, urlHash } from '../src/store';
import { PRE_STARTUP_PLAN } from './docs-fixtures';

const env = { UPSTAGE_API_KEY: 'k' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const att = { name: '공고문.pdf', url: 'https://k/dl/9', kind: 'pdf' as const };
const worker = (): DocWorkerClient & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    async fetch(path) {
      calls.push(path);
      if (path === '/discover') return json({ pageUrl: 'p', title: 't', attachments: [att] });
      return json({ fileName: '공고문.pdf', kind: 'pdf', bytes: 3, fileBase64: Buffer.from('%PDF').toString('base64') });
    },
  };
};
const memCache = (): ParsedDocCache & { data: Map<string, ParsedDocRecord> } => {
  const data = new Map<string, ParsedDocRecord>();
  return { data, get: (u) => data.get(u), put: (r) => void data.set(r.url, r) };
};
const now = () => new Date('2026-11-27T09:00:00Z');

describe('Document Parse 결과 저장', () => {
  test('처음에는 파싱·정리 후 저장, 두 번째는 저장본을 쓴다', async () => {
    const docs = memCache();
    let parses = 0;
    let sums = 0;
    const fetch = async () => ((parses++), json({ content: { markdown: PRE_STARTUP_PLAN } }));
    const summarize = async () => ((sums++), '지원 대상: 예비창업자');
    const w1 = worker();
    const r1 = await readAnnouncementForm(env, { docWorker: w1, fetch, docs, summarize, now }, 'https://k/page');
    if ('error' in r1) throw new Error(r1.error);
    expect(r1.cached).toBe(false);
    expect(r1.summary).toBe('지원 대상: 예비창업자');
    const saved = docs.data.get(att.url)!;
    expect(saved.kind).toBe('pdf');
    expect(saved.text).toContain('창업 아이템 개요');
    expect(saved.summary).toBe('지원 대상: 예비창업자');
    expect(saved.parsedAt).toBe('2026-11-27T09:00:00.000Z');

    const w2 = worker();
    const r2 = await readAnnouncementForm(env, { docWorker: w2, fetch, docs, summarize, now }, 'https://k/page');
    if ('error' in r2) throw new Error(r2.error);
    expect(r2.cached).toBe(true);
    expect(r2.fields).toEqual(r1.fields);
    expect(w2.calls).toEqual(['/discover']); // 내려받기 없음
    expect(parses).toBe(1); // Document Parse 다시 안 부름
    expect(sums).toBe(1);
  });

  test('정리가 실패하거나 늦으면 summary 없이 저장하고, 다음에 다시 정리한다', async () => {
    const docs = memCache();
    const fetch = async () => json({ content: { markdown: PRE_STARTUP_PLAN } });
    const slow = () => new Promise<string>((r) => setTimeout(() => r('늦음'), 200));
    const r1 = await readAnnouncementForm(env, { docWorker: worker(), fetch, docs, summarize: slow, summaryTimeoutMs: 10, now }, 'u');
    if ('error' in r1) throw new Error(r1.error);
    expect(r1.summary).toBeNull();
    expect(docs.data.get(att.url)!.summary).toBeNull();
    const boom = async () => { throw new Error('solar down'); };
    const r2 = await readAnnouncementForm(env, { docWorker: worker(), fetch, docs, summarize: boom, now }, 'u');
    expect('error' in r2 ? null : r2.summary).toBeNull();
    const r3 = await readAnnouncementForm(env, { docWorker: worker(), fetch, docs, summarize: async () => '정리됨', now }, 'u');
    expect('error' in r3 ? null : r3.summary).toBe('정리됨');
    expect(docs.data.get(att.url)!.summary).toBe('정리됨');
    expect((docs.data.get(att.url)! as ParsedDocRecord & { summaryAttempts: number }).summaryAttempts).toBe(2);
  });

  test('summary 실패는 최초 시도를 포함해 세 번까지만 재시도한다', async () => {
    const docs = memCache();
    let calls = 0;
    const summarize = async () => { calls++; return null; };
    const deps = { docWorker: worker(), fetch: async () => json({ content: { markdown: PRE_STARTUP_PLAN } }), docs, summarize, now };
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await readAnnouncementForm(env, deps, 'u'));
      if (i === 2) expect(calls).toBe(3);
    }
    expect(calls).toBe(3);
    expect((pipeline as typeof pipeline & { MAX_SUMMARY_ATTEMPTS: number }).MAX_SUMMARY_ATTEMPTS).toBe(3);
    expect(docs.data.get(att.url)!.summary).toBeNull();
    expect((docs.data.get(att.url)! as ParsedDocRecord & { summaryAttempts: number }).summaryAttempts).toBe(3);
    expect(results[3]).toMatchObject({ cached: true, summary: null });
  });

  test('summaryAttempts 없는 이전 저장본은 0회로 취급해 다시 정리한다', async () => {
    const old = { url: att.url, fileName: att.name, kind: att.kind, text: '본문', fields: [], warnings: [], summary: null, parsedAt: now().toISOString() };
    const docs = memCache();
    docs.data.set(att.url, old as unknown as ParsedDocRecord);
    let calls = 0;
    const result = await readAnnouncementForm(env, { docWorker: worker(), docs, summarize: async () => { calls++; return null; }, now }, 'u');
    expect(result).toMatchObject({ cached: true, summary: null });
    expect(calls).toBe(1);
    expect((docs.data.get(att.url)! as ParsedDocRecord & { summaryAttempts: number }).summaryAttempts).toBe(1);
  });

  test('store는 summaryAttempts 없는 이전 저장본에 기본값 0을 적용한다', async () => {
    const store = await createStore(now(), memoryKv(), { seedUsers: false });
    const old = { url: att.url, fileName: att.name, kind: att.kind, text: '본문', fields: [], warnings: [], summary: null, parsedAt: now().toISOString() };
    store.saveParsedDoc(old as unknown as ParsedDocRecord);
    expect((store.parsedDoc(att.url)! as ParsedDocRecord & { summaryAttempts: number }).summaryAttempts).toBe(0);
  });

  test('저장 실패는 양식 읽기를 막지 않는다', async () => {
    const docs: ParsedDocCache = { get: () => undefined, put: () => { throw new Error('kv full'); } };
    const r = await readAnnouncementForm(env, { docWorker: worker(), fetch: async () => json({ content: { markdown: PRE_STARTUP_PLAN } }), docs }, 'u');
    expect('error' in r).toBe(false);
  });

  test('store: doc 레코드 저장·조회, URL 이 다르면 없음', async () => {
    const kv = memoryKv();
    const store = await createStore(now(), kv, { seedUsers: false });
    const rec: ParsedDocRecord = { url: att.url, fileName: '공고문.pdf', kind: 'pdf', text: '본문', fields: [{ label: '개요', maxLength: 500, required: true }], warnings: [], summary: '정리', summaryAttempts: 0, parsedAt: now().toISOString() };
    store.saveParsedDoc(rec);
    expect(kv.data.has(`doc:${urlHash(att.url)}`)).toBe(true);
    expect(store.parsedDoc(att.url)).toEqual(expect.objectContaining(rec));
    expect(store.parsedDoc('https://k/other')).toBeUndefined();
    expect(() => store.saveParsedDoc({ ...rec, kind: 'xls' as never })).toThrow();
  });
});

describe('docSummary (Solar)', () => {
  const doc = { fileName: '공고문.pdf', kind: 'pdf' as const, text: '신청 기간: 2026. 12. 1. ~ 12. 15. 지원 금액 최대 1,000만원', fields: [], warnings: [] };
  const chat = (content: string) => (async (_u: string, i?: RequestInit) => ((seen = JSON.parse(String(i?.body))), json({ choices: [{ message: { content } }] }))) as unknown as typeof fetch;
  let seen: any;
  test('extract 작업 모델로 부르고, 원문에 있는 숫자만 통과', async () => {
    const ai = createAiTasks({ ...env, AI_MODE: 'upstage' }, { fetch: chat('지원 금액은 최대 1,000만원이에요.') });
    expect(await ai.docSummary(doc)).toBe('지원 금액은 최대 1,000만원이에요.');
    expect(seen.model).toBe('solar-mini-4-5-preview');
    expect(seen.messages[1].content).toContain('공고문.pdf');
    const lines = createAiTasks({ ...env, AI_MODE: 'upstage' }, { fetch: chat('지원 대상: 문서에 없음\n지원 내용: 최대 1,000만원\n신청 기간: 문서에 없음') });
    expect(await lines.docSummary(doc)).toBe('지원 대상: 문서에 없음\n지원 내용: 최대 1,000만원\n신청 기간: 문서에 없음');
    const bad = createAiTasks({ ...env, AI_MODE: 'upstage' }, { fetch: chat('지원 금액은 최대 5,000만원이에요.') });
    expect(await bad.docSummary(doc)).toBeNull();
  });
  test('AI 꺼짐이면 부르지 않는다', async () => {
    let called = false;
    const off = createAiTasks({ AI_MODE: 'off' }, { fetch: (async () => ((called = true), json({}))) as unknown as typeof fetch });
    expect(await off.docSummary(doc)).toBeNull();
    expect(called).toBe(false);
  });
});
