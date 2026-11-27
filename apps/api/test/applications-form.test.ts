import { describe, expect, test } from 'bun:test';
import type { DocWorkerClient } from '../src/docs/pipeline';
import { demo, setup } from './helpers';
import { PRE_STARTUP_PLAN } from './docs-fixtures';

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

function fakeWorker(fail = false): DocWorkerClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async fetch(path) {
      calls.push(path);
      if (fail) return json({ error: { code: 'fetch_failed', message: 'down' } }, 502);
      if (path === '/discover') return json({ pageUrl: 'x', title: 't', attachments: [{ name: '사업계획서 양식.hwpx', url: 'https://example.com/a.hwpx', kind: 'hwpx' }] });
      if (path === '/download') return json({ fileName: '사업계획서 양식.hwpx', kind: 'hwpx', bytes: 4, fileBase64: btoa('PK\u0003\u0004') });
      return json({ error: { code: 'bad_request', message: '?' } }, 400);
    },
  };
}

const parseFetch = (async () => json({ api: '2.0', content: { markdown: PRE_STARTUP_PLAN, text: '', html: '' }, elements: [] })) as unknown as typeof fetch;

describe('F16 양식 준비: doc-worker + Document Parse', () => {
  test('공고 첨부 양식 항목으로 지원서를 만든다', async () => {
    const worker = fakeWorker();
    const t = setup({ env: { UPSTAGE_API_KEY: 'test' }, fetch: parseFetch, docWorkerFor: () => worker });
    const c = await demo(t);
    const r = await c.post('/api/applications', { programId: 'T-0001' });
    expect(r.status).toBe(201);
    expect(worker.calls).toEqual(['/discover', '/download']);
    expect(r.body.channel).toBe('web');
    expect(r.body.formFileName).toBe('사업계획서 양식.hwpx');
    expect(r.body.fields.length).toBeGreaterThan(0);
    expect(r.body.fields.every((f: { value: string; identity?: boolean }) => !f.identity || f.value === '')).toBe(true);
  });

  test('doc-worker 실패면 모의 양식', async () => {
    const t = setup({ env: { UPSTAGE_API_KEY: 'test' }, fetch: parseFetch, docWorkerFor: () => fakeWorker(true) });
    const c = await demo(t);
    const r = await c.post('/api/applications', { programId: 'T-0001' });
    expect(r.status).toBe(201);
    expect(r.body.channel).toBe('mock');
  });

  test('doc-worker 없으면 호출 없이 모의 양식', async () => {
    const t = setup();
    const c = await demo(t);
    const r = await c.post('/api/applications', { programId: 'T-0001' });
    expect(r.body.channel).toBe('mock');
  });
});
