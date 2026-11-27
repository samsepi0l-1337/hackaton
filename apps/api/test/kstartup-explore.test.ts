// 수집한 실제 지원사업이 /api/resources 와 탐색 결과에 쓰이는지, 종료된 공고는 추천되지 않는지.
import { describe, expect, test } from 'bun:test';
import { kstartupToResource, type KStartupItem, type Resource } from '@gil/shared';
import { createKStartupStore } from '../src/kstartup/store';
import { memoryKv } from '../src/store';
import { NOW, setup } from './helpers';

const item = (n: number, o: Partial<KStartupItem> = {}): KStartupItem => ({
  pbanc_sn: n, biz_pbanc_nm: `실제 공고 ${n}`, pbanc_ntrp_nm: '부산테크노파크', supt_biz_clsfc: '멘토링ㆍ컨설팅ㆍ교육', supt_regin: '부산',
  pbanc_rcpt_end_dt: '20261231', rcrt_prgs_yn: 'Y', biz_enyy: '예비창업자', biz_trgt_age: '만 20세 이상 ~ 만 39세 이하', aply_trgt: '일반인',
  support_ctnt: '멘토링 제공', detl_pg_url: `https://www.k-startup.go.kr/${n}`, ...o,
});
const real = (...items: KStartupItem[]): Resource[] => items.map((i) => kstartupToResource(i, NOW)!);

function world(list: Resource[]) {
  const kstartup = createKStartupStore(memoryKv());
  kstartup.save(list);
  const t = setup({ kstartup });
  return { t, c: t.client() };
}

describe('/api/resources 와 실제 지원사업', () => {
  test('수집 전에는 팀 테스트 지원사업을 그대로 보여 준다', async () => {
    const { c } = world([]);
    const ids = (await c.get('/api/resources?type=지원사업')).body.items.map((x: any) => x.resource.id);
    expect(ids).toEqual(['rs-kstartup-pre']);
  });

  test('수집 후에는 테스트 지원사업을 빼고 실제 공고와 교육·상담·공간을 함께 보여 준다', async () => {
    const { c } = world(real(item(1), item(2, { rcrt_prgs_yn: 'N' })));
    const all = (await c.get('/api/resources')).body.items.map((x: any) => x.resource);
    expect(all.some((r: Resource) => r.id === 'rs-kstartup-pre')).toBe(false);
    expect(all.filter((r: Resource) => r.type === '지원사업').map((r: Resource) => r.id).sort()).toEqual(['ks-1', 'ks-2']);
    expect(all.some((r: Resource) => r.type === '교육')).toBe(true);
    expect(all.some((r: Resource) => r.type === '상담')).toBe(true);
    expect(all.some((r: Resource) => r.type === '공간')).toBe(true);
  });

  test('필터(type·stage·q)와 상세', async () => {
    const { c } = world(real(item(1), item(3, { biz_enyy: '3년미만', biz_pbanc_nm: '창업 도약 패키지' })));
    const sup = (await c.get('/api/resources?type=지원사업')).body.items;
    expect(sup).toHaveLength(2);
    const idea = (await c.get('/api/resources?type=지원사업&stage=has_idea')).body.items.map((x: any) => x.resource.id);
    expect(idea).toEqual(['ks-1']);
    expect((await c.get('/api/resources?q=도약')).body.items.map((x: any) => x.resource.id)).toEqual(['ks-3']);
    const one = await c.get('/api/resources/ks-1');
    expect(one.status).toBe(200);
    expect(one.body.resource).toMatchObject({ id: 'ks-1', title: '실제 공고 1', test: false, regions: ['부산'], recruitStatus: 'open' });
    expect((await c.get('/api/resources/ks-999')).status).toBe(404);
  });

  test('종료·마감 지난 공고는 조건 대조에서 불일치로 표시된다', async () => {
    const { c } = world(real(item(2, { rcrt_prgs_yn: 'N' }), item(3, { pbanc_rcpt_end_dt: '20261101' })));
    for (const id of ['ks-2', 'ks-3']) {
      const r = (await c.get(`/api/resources/${id}`)).body;
      expect(r.condition.status).toBe('mismatch');
      expect(r.condition.checks.find((x: any) => x.key === 'period').status).toBe('mismatch');
    }
  });
});

describe('탐색 결과와 실제 지원사업', () => {
  const START = { readiness: 'has_idea', idea: '동네 가게 재고 기록 서비스', interests: ['조선·해양'], reviewRegion: '부산' };
  const resultOf = async (c: ReturnType<ReturnType<typeof setup>['client']>) => {
    await c.put('/api/explore/start', { start: START });
    return (await c.get('/api/explore/result')).body;
  };

  test('모집 중인 실제 공고는 추천에 오르고 종료된 공고는 오르지 않는다', async () => {
    const { c } = world(real(
      item(1),
      item(2, { rcrt_prgs_yn: 'N' }),
      item(3, { pbanc_rcpt_end_dt: '20261101' }),
    ));
    const body = await resultOf(c);
    const ids = body.resources.map((x: any) => x.resource.id);
    expect(ids).toContain('ks-1');
    expect(ids).not.toContain('ks-2');
    expect(ids).not.toContain('ks-3');
    expect(ids).not.toContain('rs-kstartup-pre');
    const card = body.resources.find((x: any) => x.resource.id === 'ks-1');
    expect(card.resource.test).toBe(false);
    expect(card.condition.checks.find((x: any) => x.key === 'period').status).toBe('match');
  });

  test('연령이 명시 조건과 다르면 추천하지 않는다', async () => {
    const { c } = world(real(item(5, { biz_trgt_age: '만 40세 이상' })));
    await c.put('/api/explore/start', { start: { ...START, conditions: { age: 25 } } });
    const ids = (await c.get('/api/explore/result')).body.resources.map((x: any) => x.resource.id);
    expect(ids).not.toContain('ks-5');
  });

  test('자료 범위 안내는 종료된 공고를 세지 않는다', async () => {
    const open = world(real(item(1)));
    const closed = world(real(item(2, { rcrt_prgs_yn: 'N' })));
    const cov = async (w: ReturnType<typeof world>) => (await w.c.get('/api/explore/options')).body.coverage['부산'].resources;
    expect(await cov(open)).toBe((await cov(closed)) + 1);
  });

  test('수집 자료가 없어도 결과가 나온다', async () => {
    const { c } = world([]);
    const body = await resultOf(c);
    expect(Array.isArray(body.resources)).toBe(true);
    expect(typeof body.coverageNote).toBe('string');
  });
});
