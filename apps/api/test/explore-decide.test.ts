// 창업 준비 결과 순위: Solar Decide 관련도. 실패하면 규칙 순위.
import { describe, expect, test } from 'bun:test';
import { kstartupToResource, type KStartupItem, type Resource } from '@gil/shared';
import { createKStartupStore } from '../src/kstartup/store';
import { memoryKv } from '../src/store';
import { NOW, lazyClient, setup } from './helpers';

const item = (n: number, o: Partial<KStartupItem> = {}): KStartupItem => ({
  pbanc_sn: n, biz_pbanc_nm: `공고 ${n}`, pbanc_ntrp_nm: '기관', supt_biz_clsfc: '멘토링ㆍ컨설팅', supt_regin: '부산',
  pbanc_rcpt_bgng_dt: '20261101', pbanc_rcpt_end_dt: '20261231', rcrt_prgs_yn: 'Y', biz_enyy: '예비창업자', aply_trgt: '일반인', support_ctnt: `지원 ${n}`,
  detl_pg_url: `https://www.k-startup.go.kr/${n}`, ...o,
});
const DATA = [item(1), item(2, { supt_biz_clsfc: '교육' }), item(3, { supt_biz_clsfc: '사업화' }), item(4)];
const ENV = { AI_MODE: 'upstage', UPSTAGE_API_KEY: 'k', DECIDE_ENABLED: '1' };

function world(probs: Record<string, number> | 'fail') {
  const kstartup = createKStartupStore(memoryKv());
  kstartup.save(DATA.map((i) => kstartupToResource(i, NOW)!) as Resource[]);
  const sent: { url: string; body: any }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    sent.push({ url: String(url), body });
    if (String(url).endsWith('/systemone')) {
      return probs === 'fail' ? new Response('', { status: 400 }) : new Response(JSON.stringify({ answers: { fit: { probabilities: probs } } }));
    }
    return new Response('', { status: 500 }); // 문장 생성은 실패 → 규칙 문장
  }) as unknown as typeof fetch;
  const t = setup({ kstartup, env: ENV, fetch: f });
  return { t, c: lazyClient(t), sent };
}
async function finish(c: ReturnType<typeof lazyClient>) {
  await c.put('/api/me/profile', { profile: { age: 25, residence: '해운대구', hasBusiness: false } });
  await c.put('/api/explore/start', { start: { readiness: 'has_idea', idea: '동네 어르신 장보기 도우미', reviewRegion: '부산' } });
  await c.post('/api/explore/chat');
  for (let i = 0; i < 3; i++) await c.post('/api/explore/chat', { skip: true });
  await c.post('/api/explore/summary');
  return (await c.get('/api/explore/result')).body;
}

describe('창업 준비 결과 순위', () => {
  test('Decide 관련도 순서를 따르고, 입력에 내 정보·하고 싶은 일이 들어간다', async () => {
    const { c, sent } = world({ 'ks-3': 0.6, 'ks-4': 0.3, 'ks-1': 0.05, 'ks-2': 0.05 });
    const r = await finish(c);
    expect(r.ranking).toBe('ai');
    expect(r.resources.map((x: any) => x.resource.id)).toEqual(['ks-3', 'ks-4']); // ks-1·ks-2 는 관련도가 낮아 뺌
    const d = sent.find((x) => x.url.endsWith('/systemone'))!;
    expect(d.body.state).toContain('동네 어르신 장보기');
    expect(d.body.state).toContain('나이 25세');
    expect(Object.keys(d.body.questions.fit.criteria)).toEqual(expect.arrayContaining(['ks-1', 'ks-2', 'ks-3', 'ks-4']));
    expect(JSON.stringify(d.body.questions.fit.criteria)).not.toContain('기관'); // 기관 이름은 보내지 않음
  });
  test('Decide 가 실패하면 규칙 순위', async () => {
    const { c } = world('fail');
    const r = await finish(c);
    expect(r.ranking).toBe('rule');
    expect(r.resources.length).toBeGreaterThan(0);
  });
});
