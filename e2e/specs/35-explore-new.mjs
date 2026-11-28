await resetOrigin();
await newAccount('explore-new');
const startBody = { start: { readiness: 'has_idea', idea: '동네 점심 도시락 배달', reviewRegion: '부산' } };

await step('finish one consult with a result', async () => {
  eq((await api('PUT', '/api/explore/start', startBody)).status, 200, 'start');
  eq((await api('POST', '/api/explore/chat', {})).status, 200, 'opening question');
  for (let i = 0; i < 3; i++) {
    eq((await api('POST', '/api/explore/chat', { message: `점심 답 ${i + 1}`, questionIndex: i })).status, 200, `answer ${i + 1}`);
  }
  eq((await api('POST', '/api/explore/summary')).status, 200, 'summary');
  const r = await api('GET', '/api/explore/result');
  eq(r.status, 200, 'result');
  await go('/mentor');
  await seeText('처음부터 새 상담');
});

await step('start over keeps the old result as 지난 상담', async () => {
  const before = (await api('GET', '/api/explore/session')).body.quota.remaining;
  await page.click('button:has-text("처음부터 새 상담")');
  await seeText('처음부터 새 상담을 시작할까요?');
  await page.click('[role="dialog"] button:has-text("새 상담 시작")');
  await seeText('시작 전에 확인해 주세요');
  await seeText('지난 상담');
  const s = (await api('GET', '/api/explore/session')).body;
  eq(s.step, 'start', 'new consult starts at step 1');
  eq(s.summary ?? null, null, 'no summary carried over');
  eq(s.start.reviewRegion, '부산', 'review region carried over');
  eq(s.quota.remaining, before, 'chat quota unchanged');
  const h = (await api('GET', '/api/explore/history')).body.items;
  eq(h.length, 1, 'one archived consult');
});

await step('open the archived result read-only, then delete it', async () => {
  await page.click('.past-list a');
  await seeText('보관한 상담이에요');
  await seeText('다음에 할 일');
  const id = (await api('GET', '/api/explore/history')).body.items[0].id;
  eq((await api('GET', `/api/explore/history/${encodeURIComponent(id)}`)).status, 200, 'entry readable');
  await go('/mentor');
  await page.click('.past-list button:has-text("지우기")');
  await page.click('[role="dialog"] button:has-text("지우기")');
  eq((await api('GET', '/api/explore/history')).body.items.length, 0, 'deleted');
  eq((await api('GET', `/api/explore/history/${encodeURIComponent(id)}`)).status, 404, 'gone');
});
