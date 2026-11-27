import { describe, expect, test } from 'bun:test';
import { setup, demo } from './helpers';

describe('programs', () => {
  test('home', async () => {
    const r = await setup().client().get('/api/home');
    expect(r.status).toBe(200);
    expect(r.body.openCount).toBeGreaterThan(0);
    expect(r.body.closingSoon.length).toBe(3);
    expect(r.body.closingSoon[0].eligibility).toBeNull();
  });

  test('list: anonymous has no eligibility, closed hidden, filters work', async () => {
    const c = setup().client();
    const all = await c.get('/api/programs?limit=100');
    const ids = all.body.items.map((i: any) => i.program.id);
    expect(ids).not.toContain('T-0010');
    expect(ids).not.toContain('T-0011');
    expect(all.body.items[0].eligibility).toBeNull();
    expect((await c.get('/api/programs?includeClosed=true&limit=100')).body.items.map((i: any) => i.program.id)).toContain('T-0010');
    const edu = await c.get('/api/programs?category=' + encodeURIComponent('창업교육'));
    expect(edu.body.items.every((i: any) => i.program.category === '창업교육')).toBe(true);
    const always = await c.get('/api/programs?due=always');
    expect(always.body.items.every((i: any) => i.dDay === null)).toBe(true);
    expect((await c.get('/api/programs?q=' + encodeURIComponent('해양'))).body.total).toBeGreaterThan(0);
    expect((await c.get('/api/programs?limit=2')).body.nextOffset).toBe(2);
  });

  test('list: bad query returns 400', async () => {
    const c = setup().client();
    for (const q of ['region=서울', 'due=3', 'sort=x', 'verdict=maybe', 'age=abc', 'stage=zzz', 'limit=-1']) {
      expect((await c.get('/api/programs?' + q)).status).toBe(400);
    }
  });

  test('list: verdict filter applies only for logged-in with profile', async () => {
    const t = setup();
    const anon = await t.client().get('/api/programs?verdict=ineligible&limit=100');
    expect(anon.body.total).toBeGreaterThan(0);
    const d = await demo(t);
    const r = await d.get('/api/programs?verdict=eligible&limit=100');
    expect(r.body.total).toBeGreaterThan(0);
    expect(r.body.items.every((i: any) => i.eligibility.verdict === 'eligible')).toBe(true);
    const bad = await d.get('/api/programs?verdict=ineligible&includeClosed=true&limit=100');
    expect(bad.body.items.map((i: any) => i.program.id)).toContain('T-0007');
  });

  test('detail and 404, categories', async () => {
    const t = setup();
    const d = await demo(t);
    const r = await d.get('/api/programs/T-0001');
    expect(r.body.program.id).toBe('T-0001');
    expect(r.body.dDay).toBe(5);
    expect(r.body.eligibility.verdict).toBe('eligible');
    expect((await t.client().get('/api/programs/T-0001')).body.eligibility).toBeNull();
    expect((await d.get('/api/programs/NOPE')).status).toBe(404);
    const cats = await d.get('/api/programs/categories');
    expect(cats.body.categories).toContain('사업화');
  });
});
