// 기본 화면이 뜨고 API 가 프록시로 연결되는지.
await resetOrigin();
await step('홈이 뜬다', async () => {
  await go('/');
  await page.waitForSelector('main, #root > *', { timeout: 10000 });
  assert((await page.title()).length > 0, '제목 없음');
});
await step('API 프록시 /api/health', async () => {
  const r = await api('GET', '/api/health');
  eq(r.status, 200, 'health status');
  eq(r.body, { ok: true }, 'health body');
});
await step('없는 주소는 NotFound', async () => {
  await go('/no-such-page-e2e');
  // 고정 대기 대신 문구가 나올 때까지 3초까지 다시 읽는다.
  let found = false;
  for (let i = 0; i < 30 && !found; i++) {
    found = /찾을 수 없|없는 페이지|404/.test(await bodyText());
    if (!found) await page.waitForTimeout(100);
  }
  assert(found, 'NotFound 문구 없음');
});
