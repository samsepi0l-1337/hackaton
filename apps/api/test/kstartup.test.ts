// K-Startup 실제 공고 수집 (F8). 실제 네트워크는 부르지 않고 가짜 fetch 를 쓴다.
import { describe, expect, test } from 'bun:test';
import { kstartupToResource, type KStartupItem } from '@gil/shared';
import { fetchAnnouncements, normalizeKey, MAX_PAGES, NO_KEY_ERROR, PER_PAGE, type FetchLike } from '../src/kstartup/client';
import { createKStartupStore } from '../src/kstartup/store';
import { runSync } from '../src/kstartup/sync';
import { memoryKv } from '../src/store';
import { NOW, demo, setup, team } from './helpers';

const sn = (n: number, o: Partial<KStartupItem> = {}): KStartupItem => ({
  pbanc_sn: n, biz_pbanc_nm: `공고 ${n}`, pbanc_ntrp_nm: '기관', supt_biz_clsfc: '멘토링ㆍ컨설팅ㆍ교육', supt_regin: '부산',
  pbanc_rcpt_bgng_dt: '20261101', pbanc_rcpt_end_dt: '20261231', rcrt_prgs_yn: 'Y', biz_enyy: '예비창업자', biz_trgt_age: '만 20세 이상 ~ 만 39세 이하',
  aply_trgt: '일반인', support_ctnt: '멘토링 제공', detl_pg_url: `https://www.k-startup.go.kr/${n}`, ...o,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const regionOf = (url: string) => decodeURIComponent(new URL(url).searchParams.get('cond[supt_regin::LIKE]') ?? '');
const pageOf = (url: string) => Number(new URL(url).searchParams.get('page'));

/** 지역별 항목 목록을 쪽(perPage 100)으로 나눠 주는 가짜 서버. shape 'array' 는 data 가 배열인 배포. */
function server(byRegion: Record<string, KStartupItem[]>, shape: 'item' | 'array' = 'item') {
  const urls: string[] = [];
  const fetch: FetchLike = async (url) => {
    urls.push(url);
    const all = byRegion[regionOf(url)] ?? [];
    const p = pageOf(url);
    const slice = all.slice((p - 1) * PER_PAGE, p * PER_PAGE);
    return json({ currentCount: slice.length, matchCount: all.length, page: p, perPage: PER_PAGE, totalCount: all.length, data: shape === 'array' ? slice : { item: slice } });
  };
  return { fetch, urls };
}
const env = { KSTARTUP_SERVICE_KEY: 'KEY+/=' };

describe('client', () => {
  test('키를 한 번만 인코딩하고 부산·전국 조건과 모집 중 조건을 보낸다', async () => {
    const s = server({ 부산: [sn(1)], 전국: [sn(2, { supt_regin: '전국' })] });
    const r = await fetchAnnouncements({ key: 'KEY+/=', fetch: s.fetch });
    expect(r.ok && r.items.map((i) => i.pbanc_sn)).toEqual([1, 2]);
    const u = new URL(s.urls[0]!);
    expect(u.searchParams.get('serviceKey')).toBe('KEY+/=');
    expect(s.urls[0]).toContain('serviceKey=KEY%2B%2F%3D');
    expect(u.searchParams.get('returnType')).toBe('json');
    expect(u.searchParams.get('perPage')).toBe('100');
    expect(u.searchParams.get('cond[rcrt_prgs_yn::EQ]')).toBe('Y');
    expect(s.urls.map(regionOf)).toEqual(['부산', '전국']);
  });

  test('이미 인코딩된 키를 붙여 넣어도 이중 인코딩하지 않는다', () => {
    expect(normalizeKey('AB%2BCD%3D%3D')).toBe('AB+CD==');
    expect(normalizeKey('plain')).toBe('plain');
  });

  test('pbanc_sn 으로 합친다', async () => {
    const s = server({ 부산: [sn(1), sn(2)], 전국: [sn(2), sn(3, { supt_regin: '전국' })] });
    const r = await fetchAnnouncements({ key: 'k', fetch: s.fetch });
    expect(r.ok && r.items.map((i) => i.pbanc_sn)).toEqual([1, 2, 3]);
  });

  test('totalCount 까지 쪽을 넘겨 받고 거기서 멈춘다', async () => {
    const many = Array.from({ length: 250 }, (_, i) => sn(i + 1));
    const s = server({ 부산: many, 전국: [] });
    const r = await fetchAnnouncements({ key: 'k', fetch: s.fetch });
    expect(r.ok && r.items.length).toBe(250);
    expect(r.ok && r.complete).toBe(true);
    expect(s.urls.filter((u) => regionOf(u) === '부산').map(pageOf)).toEqual([1, 2, 3]);
  });

  test('최대 10쪽에서 멈추고 일부만 받았다고 알린다', async () => {
    const many = Array.from({ length: 1500 }, (_, i) => sn(i + 1));
    const s = server({ 부산: many, 전국: [] });
    const r = await fetchAnnouncements({ key: 'k', fetch: s.fetch });
    expect(r.ok && r.items.length).toBe(MAX_PAGES * PER_PAGE);
    expect(r.ok && r.complete).toBe(false);
    expect(s.urls.filter((u) => regionOf(u) === '부산').length).toBe(MAX_PAGES);
  });

  test('data 가 배열인 응답도 읽는다', async () => {
    const r = await fetchAnnouncements({ key: 'k', fetch: server({ 부산: [sn(1)], 전국: [] }, 'array').fetch });
    expect(r.ok && r.items.length).toBe(1);
  });

  test('키가 없으면 호출하지 않고 오류', async () => {
    let called = 0;
    const r = await fetchAnnouncements({ key: ' ', fetch: async () => { called++; return json({}); } });
    expect(r).toEqual({ ok: false, error: NO_KEY_ERROR });
    expect(called).toBe(0);
  });

  test('401·5xx·JSON 아님·형식 이상·네트워크 오류는 오류로 돌려준다', async () => {
    const t = (f: FetchLike) => fetchAnnouncements({ key: 'k', fetch: f });
    expect(await t(async () => json({}, 401))).toMatchObject({ ok: false, error: expect.stringContaining('401') });
    expect(await t(async () => json({}, 500))).toMatchObject({ ok: false, error: expect.stringContaining('500') });
    expect(await t(async () => new Response('<xml/>'))).toMatchObject({ ok: false, error: expect.stringContaining('JSON') });
    expect(await t(async () => json({ resultCode: '30' }))).toMatchObject({ ok: false, error: expect.stringContaining('형식') });
    expect(await t(async () => { throw new Error('boom'); })).toMatchObject({ ok: false, error: expect.stringContaining('boom') });
  });
});

describe('sync', () => {
  const mk = () => ({ store: createKStartupStore(memoryKv()), now: NOW });

  test('추가·갱신·종료 표시 (삭제하지 않는다)', async () => {
    const { store, now } = mk();
    const r1 = await runSync({ store, env, now, fetch: server({ 부산: [sn(1), sn(2)], 전국: [] }).fetch });
    expect(r1).toMatchObject({ ok: true, added: 2, updated: 0, closed: 0, total: 2, error: null });
    expect(store.meta()).toMatchObject({ lastError: null, total: 2, open: 2 });

    // 2번은 이번 조회에 없음(종료), 1번은 제목 변경, 3번은 새 공고
    const r2 = await runSync({ store, env, now, fetch: server({ 부산: [sn(1, { biz_pbanc_nm: '바뀐 제목' }), sn(3)], 전국: [] }).fetch });
    expect(r2).toMatchObject({ ok: true, added: 1, updated: 1, closed: 1, total: 3 });
    const byId = Object.fromEntries(store.resources().map((r) => [r.id, r]));
    expect(byId['ks-1']!.title).toBe('바뀐 제목');
    expect(byId['ks-2']!.recruitStatus).toBe('closed');
    expect(byId['ks-3']!.recruitStatus).toBe('open');
    expect(store.meta()).toMatchObject({ total: 3, open: 2, closed: 1 });
  });

  test('같은 내용을 다시 받으면 갱신 0', async () => {
    const { store, now } = mk();
    const f = server({ 부산: [sn(1)], 전국: [] }).fetch;
    await runSync({ store, env, now, fetch: f });
    expect(await runSync({ store, env, now, fetch: f })).toMatchObject({ added: 0, updated: 0, closed: 0 });
  });

  test('일부만 받았으면 이번에 안 보인 공고를 종료로 바꾸지 않는다', async () => {
    const { store, now } = mk();
    await runSync({ store, env, now, fetch: server({ 부산: [sn(9000)], 전국: [] }).fetch });
    const many = Array.from({ length: 1500 }, (_, i) => sn(i + 1));
    const r = await runSync({ store, env, now, fetch: server({ 부산: many, 전국: [] }).fetch });
    expect(r.closed).toBe(0);
    expect(store.resources().find((x) => x.id === 'ks-9000')!.recruitStatus).toBe('open');
  });

  test('401 이면 이전 자료를 그대로 두고 오류만 기록한다', async () => {
    const { store, now } = mk();
    await runSync({ store, env, now, fetch: server({ 부산: [sn(1)], 전국: [] }).fetch });
    const before = JSON.stringify(store.resources());
    const r = await runSync({ store, env, now: new Date(NOW.getTime() + 86_400_000), fetch: async () => json({}, 401) });
    expect(r).toMatchObject({ ok: false, added: 0, updated: 0, closed: 0, total: 1, error: expect.stringContaining('401') });
    expect(JSON.stringify(store.resources())).toBe(before);
    expect(store.meta()).toMatchObject({ fetchedAt: NOW.toISOString(), lastError: expect.stringContaining('401') });
  });

  test('키가 없으면 호출 없이 오류 (마지막 자료 유지)', async () => {
    const { store, now } = mk();
    await runSync({ store, env, now, fetch: server({ 부산: [sn(1)], 전국: [] }).fetch });
    let called = 0;
    const r = await runSync({ store, env: {}, now, fetch: async () => { called++; return json({}); } });
    expect(r).toMatchObject({ ok: false, error: NO_KEY_ERROR, total: 1 });
    expect(called).toBe(0);
    expect(store.resources()).toHaveLength(1);
  });

  test('모집 중 자료가 있는데 빈 응답이면 종료 처리하지 않고 오류', async () => {
    const { store, now } = mk();
    await runSync({ store, env, now, fetch: server({ 부산: [sn(1)], 전국: [] }).fetch });
    const r = await runSync({ store, env, now, fetch: server({ 부산: [], 전국: [] }).fetch });
    expect(r.ok).toBe(false);
    expect(store.resources()[0]!.recruitStatus).toBe('open');
  });

  test('저장소는 KV 에서 다시 읽고 깨진 레코드는 건너뛴다', async () => {
    const kv = memoryKv();
    await runSync({ store: createKStartupStore(kv), env, now: NOW, fetch: server({ 부산: [sn(1)], 전국: [] }).fetch });
    kv.put('ks:resource:ks-bad', { id: 'ks-bad' });
    const again = createKStartupStore(kv);
    expect(again.resources().map((r) => r.id)).toEqual(['ks-1']);
    expect(again.meta()?.total).toBe(1);
  });
});

describe('POST /api/admin/kstartup/sync', () => {
  const world = (f: FetchLike, withKey = true) => {
    const kstartup = createKStartupStore(memoryKv());
    return { t: setup({ kstartup, fetch: f as typeof fetch, env: withKey ? env : {} }), kstartup };
  };

  test('팀 계정만 쓴다 (비로그인 401, 일반 403)', async () => {
    const { t } = world(server({ 부산: [sn(1)], 전국: [] }).fetch);
    expect((await t.client().post('/api/admin/kstartup/sync')).status).toBe(401);
    expect((await (await demo(t)).post('/api/admin/kstartup/sync')).status).toBe(403);
  });

  test('팀 계정은 수집을 돌리고 KStartupSyncResponse 를 받는다', async () => {
    const { t, kstartup } = world(server({ 부산: [sn(1)], 전국: [sn(2, { supt_regin: '전국' })] }).fetch);
    const r = await (await team(t)).post('/api/admin/kstartup/sync');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, fetchedAt: NOW.toISOString(), added: 2, updated: 0, closed: 0, total: 2, error: null });
    expect(kstartup.resources()).toHaveLength(2);
  });

  test('키가 없으면 200 으로 ok:false 와 안내', async () => {
    const { t } = world(server({ 부산: [], 전국: [] }).fetch, false);
    const r = await (await team(t)).post('/api/admin/kstartup/sync');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: false, error: NO_KEY_ERROR, total: 0 });
  });
});

describe('sync 유형 갱신', () => {
  const mk = () => ({ store: createKStartupStore(memoryKv()), now: NOW });
  test('예전 유형으로 저장된 같은 id 는 새 유형으로 덮어쓴다', async () => {
    const { store, now } = mk();
    const f = server({ 부산: [sn(1)], 전국: [] }).fetch;
    await runSync({ store, env, now, fetch: f });
    const cur = store.resources()[0]!;
    store.save([{ ...cur, type: '교육' }]);
    await runSync({ store, env, now, fetch: f });
    expect(store.resources()[0]!.type).toBe(kstartupToResource(sn(1), now)!.type);
  });
});
