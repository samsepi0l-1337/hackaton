// 지원 목록 정렬(최근·많이 본·마감 임박), 조회 수 세기와 중복 방지, startDate 매핑.
import { describe, expect, test } from 'bun:test';
import { kstartupToResource, type KStartupItem, type Resource } from '@gil/shared';
import { createKStartupStore } from '../src/kstartup/store';
import { createStore, memoryKv, VIEW_WINDOW_MS } from '../src/store';
import { NOW, demo, setup } from './helpers';

const item = (n: number, o: Partial<KStartupItem> = {}): KStartupItem => ({
  pbanc_sn: n, biz_pbanc_nm: `공고 ${n}`, pbanc_ntrp_nm: '부산테크노파크', supt_biz_clsfc: '교육', supt_regin: '부산',
  pbanc_rcpt_bgng_dt: '20261101', pbanc_rcpt_end_dt: '20261231', rcrt_prgs_yn: 'Y', biz_enyy: '예비창업자', aply_trgt: '일반인', support_ctnt: '지원',
  detl_pg_url: `https://www.k-startup.go.kr/${n}`, ...o,
});
// NOW = 2026-11-27 KST.
const DATA: KStartupItem[] = [
  item(1, { pbanc_rcpt_bgng_dt: '20261101', pbanc_rcpt_end_dt: '20261215' }),
  item(2, { pbanc_rcpt_bgng_dt: '20261120', pbanc_rcpt_end_dt: '20261130' }),
  item(3, { pbanc_rcpt_bgng_dt: undefined, pbanc_rcpt_end_dt: undefined, rcrt_prgs_yn: undefined }),
  item(4, { pbanc_rcpt_bgng_dt: '20261001', pbanc_rcpt_end_dt: '20261110', rcrt_prgs_yn: 'N' }),
  item(5, { pbanc_rcpt_bgng_dt: '20261125', pbanc_rcpt_end_dt: '20261127' }),
  item(6, { pbanc_rcpt_bgng_dt: '20261120', pbanc_rcpt_end_dt: '20261201' }),
];
const real = (items: KStartupItem[]): Resource[] => items.map((i) => kstartupToResource(i, NOW)!);
function world(items = DATA) {
  const kstartup = createKStartupStore(memoryKv());
  kstartup.save(real(items));
  return setup({ kstartup });
}
const ids = async (c: ReturnType<ReturnType<typeof setup>['client']>, q: string) =>
  (await c.get(`/api/resources?type=지원사업${q}`)).body.items.map((x: any) => x.resource.id.replace('ks-', ''));

describe('startDate 매핑', () => {
  test('접수 시작일이 있으면 YYYY-MM-DD, 없으면 null', () => {
    expect(kstartupToResource(item(1), NOW)!.startDate).toBe('2026-11-01');
    expect(kstartupToResource(item(3, { pbanc_rcpt_bgng_dt: undefined }), NOW)!.startDate).toBeNull();
  });
});

describe('정렬', () => {
  test('recent: 시작일 내림차순, 없으면 맨 뒤, 같으면 id', async () => {
    expect(await ids(world().client(), '&sort=recent')).toEqual(['5', '2', '6', '1', '4', '3']);
  });
  test('deadline: 마감 안 지난 것 마감일 순 → 마감일 없음 → 마감·종료, 기본값도 같다', async () => {
    const c = world().client();
    const want = ['5', '2', '6', '1', '3', '4'];
    expect(await ids(c, '&sort=deadline')).toEqual(want);
    expect(await ids(c, '')).toEqual(want);
  });
  test('popular: 조회 수 내림차순, 같으면 마감 빠른 순', async () => {
    const t = world(); const c = t.client();
    for (const id of ['ks-1', 'ks-1', 'ks-6']) {
      // 서로 다른 보는 사람으로 센다.
      await t.app.request(`/api/resources/${id}`, { headers: { 'user-agent': `ua-${Math.random()}` } });
    }
    const items = (await c.get('/api/resources?type=지원사업&sort=popular')).body.items;
    expect(items.map((x: any) => x.resource.id.replace('ks-', ''))).toEqual(['1', '6', '5', '2', '3', '4']);
    expect(items[0].views).toBe(2);
    expect(items[2].views).toBe(0);
  });
  test('잘못된 sort 는 400', async () => {
    expect((await world().client().get('/api/resources?sort=x')).status).toBe(400);
  });
});

describe('조회 수', () => {
  test('같은 사람은 반복해도 한 번, 다른 사람은 따로 센다', async () => {
    const t = world(); const c = t.client();
    expect((await c.get('/api/resources/ks-1')).body.views).toBe(1);
    expect((await c.get('/api/resources/ks-1')).body.views).toBe(1);
    const r = await t.app.request('/api/resources/ks-1', { headers: { 'user-agent': 'other' } });
    expect((await r.json() as any).views).toBe(2);
  });
  test('로그인 사용자는 id 로 구분하고 resource_link 이벤트도 조회로 센다', async () => {
    const t = world(); const c = await demo(t);
    expect((await c.get('/api/resources/ks-2')).body.views).toBe(1);
    await c.post('/api/explore/events', { type: 'resource_link', resourceId: 'ks-2' });
    await c.post('/api/explore/events', { type: 'resource_link', resourceId: 'ks-3' });
    await c.post('/api/explore/events', { type: 'resource_link', resourceId: 'nope' });
    expect((await c.get('/api/resources/ks-2')).body.views).toBe(1);
    expect((await c.get('/api/resources/ks-3')).body.views).toBe(1);
  });
  test('없는 자료는 404 이고 세지 않는다', async () => {
    const t = world();
    expect((await t.client().get('/api/resources/ks-999')).status).toBe(404);
    expect((await t.client().get('/api/resources?type=지원사업')).body.items.every((x: any) => x.views === 0)).toBe(true);
  });
  test('저장소: 6시간 창과 KV 저장 (주입한 시계)', async () => {
    const kv = memoryKv();
    const store = await createStore(NOW, kv);
    const t0 = new Date('2026-11-27T00:00:00Z');
    expect(store.recordView('r1', 'v', t0)).toBe(true);
    expect(store.recordView('r1', 'v', new Date(t0.getTime() + VIEW_WINDOW_MS - 1))).toBe(false);
    expect(store.recordView('r1', 'v', new Date(t0.getTime() + VIEW_WINDOW_MS))).toBe(true);
    expect(store.recordView('r1', 'w', t0)).toBe(true);
    expect(store.recordView('r2', 'v', t0)).toBe(true);
    expect(store.viewCount('r1')).toBe(3);
    expect(kv.get('views:r1')).toBe(3);
    expect([...store.viewCounts()].sort()).toEqual([['r1', 3], ['r2', 1]]);
    expect(JSON.stringify([...kv.data])).not.toContain('127.0.0.1');
  });
});
