import { expect, test } from 'bun:test';
import { setup, team, lazyClient } from './helpers';

test('summary edits propagate exploration reason and direction to session', async () => {
  const t = setup();
  const c = lazyClient(t);
  expect((await c.put('/api/explore/start', { start: { readiness: 'no_idea', interests: ['조선·해양'] } })).status).toBe(200);
  const edit = await c.put('/api/explore/summary', { summary: { exploration: { reason: { text: '현장이 궁금해요' }, direction: { text: '현장 조사를 해요' } } } });
  expect(edit.status).toBe(200);
  const session = await c.get('/api/explore/session');
  expect(session.body.exploration).toMatchObject({ selectionReason: '현장이 궁금해요', direction: '현장 조사를 해요', directionStatus: 'user', suggestions: [] });
});

test('exploration endpoints reject malformed JSON bodies', async () => {
  const t = setup();
  const c = lazyClient(t);
  await c.get('/api/explore/session');
  const r = await t.app.request('/api/explore/start', { method: 'PUT', headers: { cookie: c.state.cookie, 'content-type': 'application/json' }, body: '[]' });
  expect(r.status).toBe(400);
});

test('verification rejects missing token and code', async () => {
  const t = setup();
  const r = await t.client().post('/api/auth/verify', {});
  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('bad_request');
});

test('admin document probe validates URL and reports missing worker', async () => {
  const t = setup();
  const admin = await team(t);
  expect((await admin.post('/api/admin/form-probe', { pageUrl: 'bad' })).status).toBe(400);
  expect((await admin.post('/api/admin/form-probe', { pageUrl: 'https://example.test' })).status).toBe(409);
});

test('admin document probe can discover attachments without downloading', async () => {
  const calls: string[] = [];
  const t = setup({ docWorkerFor: () => ({ fetch: async (path) => { calls.push(path); return Response.json({ attachments: [] }); } }) });
  const admin = await team(t);
  const result = await admin.post('/api/admin/form-probe', { pageUrl: 'https://example.test', discoverOnly: true });
  expect(result.status).toBe(200);
  expect(result.body).toEqual({ status: 200, body: { attachments: [] } });
  expect(calls).toEqual(['/discover']);
});
