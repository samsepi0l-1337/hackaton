import { describe, expect, test } from 'bun:test';
import { setup, demo, team } from './helpers';

const FILL = { name: '홍길동', phone: '010-0000-0000', email: 'demo@test.local' };

async function draft(c: Awaited<ReturnType<typeof demo>>, programId = 'T-0001') {
  const r = await c.post('/api/applications', { programId });
  expect(r.status).toBe(201);
  return r.body;
}
const fillAndRequest = (c: Awaited<ReturnType<typeof demo>>, id: string) =>
  c.put(`/api/applications/${id}`, { values: FILL, requestApproval: true });

describe('applications', () => {
  test('create prefills non-identity fields, leaves identity empty', async () => {
    const t = setup();
    const c = await demo(t);
    const a = await draft(c);
    expect(a.status).toBe('drafting');
    expect(a.channel).toBe('mock');
    expect(a.program.id).toBe('T-0001');
    const f = Object.fromEntries(a.fields.map((x: any) => [x.key, x]));
    expect(f.name.value).toBe('');
    expect(f.phone.value).toBe('');
    expect(f.itemName.value.length).toBeGreaterThan(0);
    expect(f.itemName.value.length).toBeLessThanOrEqual(50); // 아이디어(30자 넘음)를 maxLength로 자름
    expect(f.problem.value).toContain('자취생');
  });

  test('unknown/closed program', async () => {
    const t = setup();
    const c = await demo(t);
    expect((await c.post('/api/applications', { programId: 'NOPE' })).status).toBe(404);
    const closed = await c.post('/api/applications', { programId: 'T-0010' });
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('closed');
    expect((await c.post('/api/applications', { programId: 'T-0011' })).body.error.code).toBe('closed');
  });

  test('update enforces maxLength and required before approval request', async () => {
    const t = setup();
    const c = await demo(t);
    const a = await draft(c);
    const long = await c.put(`/api/applications/${a.id}`, { values: { name: 'x'.repeat(21) } });
    expect(long.status).toBe(400);
    expect(long.body.error.code).toBe('validation');
    expect((await c.put(`/api/applications/${a.id}`, { values: { nope: 'x' } })).status).toBe(400);
    const missing = await c.put(`/api/applications/${a.id}`, { values: {}, requestApproval: true });
    expect(missing.status).toBe(400);
    expect(missing.body.error.fields.map((f: any) => f.field)).toContain('name');
    const ok = await fillAndRequest(c, a.id);
    expect(ok.body.status).toBe('awaiting_approval');
  });

  test('approve without request → 409 approval_required', async () => {
    const t = setup();
    const c = await demo(t);
    const a = await draft(c);
    const r = await c.post(`/api/applications/${a.id}/approve`, { confirm: true });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('approval_required');
  });

  test('approve requires confirm, then completes with receipt and history', async () => {
    const t = setup();
    const c = await demo(t);
    const a = await draft(c);
    await fillAndRequest(c, a.id);
    expect((await c.post(`/api/applications/${a.id}/approve`, {})).body.error.code).toBe('approval_required');
    const r = await c.post(`/api/applications/${a.id}/approve`, { confirm: true });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('completed');
    expect(r.body.receiptNo).toMatch(/^MOCK-[A-Z0-9]{6}$/);
    expect(r.body.approval.values.name).toBe('홍길동');
    expect(r.body.history.map((h: any) => h.status)).toEqual(['drafting', 'awaiting_approval', 'filling', 'submitting', 'completed']);
    // 이미 완료됐으니 다시 승인 불가
    expect((await c.post(`/api/applications/${a.id}/approve`, { confirm: true })).status).toBe(409);
  });

  test('duplicate submit for same program → 409 conflict', async () => {
    const t = setup();
    const c = await demo(t);
    const a = await draft(c);
    await fillAndRequest(c, a.id);
    await c.post(`/api/applications/${a.id}/approve`, { confirm: true });
    const b = await draft(c);
    await fillAndRequest(c, b.id);
    const r = await c.post(`/api/applications/${b.id}/approve`, { confirm: true });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('conflict');
  });

  test('failure then retry once', async () => {
    const t = setup({ failSubmit: () => true });
    const c = await demo(t);
    const a = await draft(c);
    expect((await c.post(`/api/applications/${a.id}/retry`)).status).toBe(409); // 실패 전 재시도 불가
    await fillAndRequest(c, a.id);
    const r = await c.post(`/api/applications/${a.id}/approve`, { confirm: true });
    expect(r.body.status).toBe('failed');
    expect(r.body.failReason).toBeTruthy();
    const retry = await c.post(`/api/applications/${a.id}/retry`);
    expect(retry.status).toBe(200);
    expect(retry.body.status).toBe('completed');
    expect(retry.body.retries).toBe(1);
    expect((await c.post(`/api/applications/${a.id}/retry`)).status).toBe(409);
  });

  test('list/detail only own; other account gets 404', async () => {
    const t = setup();
    const c = await demo(t);
    const a = await draft(c);
    expect((await c.get('/api/applications')).body.items.length).toBe(1);
    expect((await c.get(`/api/applications/${a.id}`)).body.program.id).toBe('T-0001');
    const o = t.client();
    await o.post('/api/auth/signup', { email: 'o@x.com', password: 'password1', consent: true });
    expect((await o.get('/api/applications')).body.items).toEqual([]);
    expect((await o.get(`/api/applications/${a.id}`)).status).toBe(404);
    expect((await o.put(`/api/applications/${a.id}`, { values: {} })).status).toBe(404);
    expect((await o.post(`/api/applications/${a.id}/approve`, { confirm: true })).status).toBe(404);
  });

  test('stats reflect submissions; account delete removes applications', async () => {
    const t = setup();
    const c = await demo(t);
    const a = await draft(c);
    await fillAndRequest(c, a.id);
    await c.post(`/api/applications/${a.id}/approve`, { confirm: true });
    await c.post('/api/mentor/survey', { discovered: true });
    const tm = await team(t);
    const s = (await tm.get('/api/admin/stats')).body;
    expect(s.submitSuccessRate).toBe(1);
    expect(s.discoveryRate).toBe(1);
    await c.del('/api/me');
    expect((await c.get('/api/applications')).status).toBe(401);
    expect((await tm.get('/api/admin/stats')).body.submitSuccessRate).toBeNull();
  });
});
