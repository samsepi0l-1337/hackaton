// 내 정보 값으로 조건 대조, 관심 표시(하트), '나에게 맞는 순'.
import { describe, expect, test } from 'bun:test';
import { kstartupToResource, type KStartupItem, type Resource } from '@gil/shared';
import { createKStartupStore } from '../src/kstartup/store';
import { memoryKv } from '../src/store';
import { NOW, demo, setup } from './helpers';

const item = (n: number, o: Partial<KStartupItem> = {}): KStartupItem => ({
  pbanc_sn: n, biz_pbanc_nm: `공고 ${n}`, pbanc_ntrp_nm: '기관', supt_biz_clsfc: '사업화', supt_regin: '전국',
  pbanc_rcpt_bgng_dt: '20261101', pbanc_rcpt_end_dt: '20261231', rcrt_prgs_yn: 'Y', biz_enyy: '예비창업자', aply_trgt: '일반인', support_ctnt: '지원',
  detl_pg_url: `https://www.k-startup.go.kr/${n}`, ...o,
});
const DATA: KStartupItem[] = [
  item(1, { supt_biz_clsfc: '시설ㆍ공간ㆍ보육', biz_trgt_age: '만 20세 미만,만 20세 이상 ~ 만 39세 이하,만 40세 이상' }), // 공간, 나이 제한 없음, 전국
  item(2, { supt_biz_clsfc: '시설ㆍ공간ㆍ보육', supt_regin: '부산', biz_trgt_age: '만 20세 이상 ~ 만 39세 이하' }), // 공간, 부산
  item(3, { supt_biz_clsfc: '사업화', pbanc_rcpt_end_dt: '20261201' }), // 자금
  item(4, { supt_biz_clsfc: '멘토링ㆍ컨설팅', biz_trgt_age: '만 40세 이상' }), // 상담, 25세는 불일치
];
function world() {
  const kstartup = createKStartupStore(memoryKv());
  kstartup.save(DATA.map((i) => kstartupToResource(i, NOW)!) as Resource[]);
  return setup({ kstartup });
}
const card = (items: any[], id: string) => items.find((x) => x.resource.id === id);
const check = (c: any, key: string) => c.condition.checks.find((x: any) => x.key === key);

describe('내 정보로 조건 대조', () => {
  test('입력한 나이·거주지·사업자 여부가 목록 카드에 쓰인다', async () => {
    const t = world(); const c = await demo(t);
    await c.put('/api/me/profile', { profile: { age: 25, residence: '해운대구', hasBusiness: false } });
    const items = (await c.get('/api/resources')).body.items;
    const all = card(items, 'ks-1');
    expect(check(all, 'age').status).toBe('match'); // 나이 제한 없음
    expect(check(all, 'residence').status).toBe('match'); // 전국
    expect(check(all, 'business').status).toBe('match'); // 예비창업자 대상 + 사업자 없음
    expect(check(card(items, 'ks-2'), 'residence').detail).toContain('해운대구');
    expect(check(card(items, 'ks-2'), 'residence').status).toBe('match');
    expect(check(card(items, 'ks-4'), 'age').status).toBe('mismatch');
    // 로그인하지 않으면 비교하지 못한다
    const anon = (await t.client().get('/api/resources')).body.items;
    expect(check(card(anon, 'ks-1'), 'business').status).toBe('check');
  });
});

describe('관심 표시(하트)', () => {
  test('로그인 필요, 누르기·취소, 목록·상세에 liked 표시', async () => {
    const t = world();
    expect((await t.client().put('/api/likes/ks-1', { liked: true })).status).toBe(401);
    expect((await t.client().get('/api/likes')).status).toBe(401);
    const c = await demo(t);
    expect((await c.put('/api/likes/nope', { liked: true })).status).toBe(404);
    expect((await c.put('/api/likes/ks-1', { liked: 'y' })).status).toBe(400);
    const r = await c.put('/api/likes/ks-1', { liked: true });
    expect(r.body.ids).toEqual(['ks-1']);
    expect(r.body.topics).toContain('공간');
    expect(card((await c.get('/api/resources')).body.items, 'ks-1').liked).toBe(true);
    expect((await c.get('/api/resources/ks-1')).body.liked).toBe(true);
    expect((await c.put('/api/likes/ks-1', { liked: false })).body.ids).toEqual([]);
    expect((await c.get('/api/likes')).body.ids).toEqual([]);
  });

  test("'나에게 맞는 순': 하트 누른 자료와 비슷한 자료가 앞, 조건 불일치는 뒤", async () => {
    const t = world(); const c = await demo(t);
    await c.put('/api/me/profile', { profile: { age: 25, residence: '해운대구', hasBusiness: false } });
    await c.put('/api/likes/ks-1', { liked: true });
    const ids = (await c.get('/api/resources?sort=fit')).body.items.map((x: any) => x.resource.id);
    expect(ids.indexOf('ks-2')).toBeLessThan(ids.indexOf('ks-3')); // 같은 공간 유형
    expect(ids[ids.length - 1] === 'ks-4' || ids.indexOf('ks-4') > ids.indexOf('ks-3')).toBe(true);
  });
});
