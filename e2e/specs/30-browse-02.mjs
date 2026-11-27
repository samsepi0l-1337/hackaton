await resetOrigin();
await step('detail view increments once per viewer', async () => {
  await go('/programs');
  const list = await api('GET', '/api/resources');
  const item = list.body.items[0];
  const id = encodeURIComponent(item.resource.id);
  await go('/programs/' + id);
  await seeText('얻을 수 있는 도움');
  const first = await api('GET', '/api/resources/' + id);
  const second = await api('GET', '/api/resources/' + id);
  eq(first.body.views, item.views + 1, 'first viewer increments count');
  eq(second.body.views, first.body.views, 'repeat viewer does not increment');
});
await step('guest heart prompts login', async () => {
  await go('/programs');
  await page.waitForSelector('article .heart');
  await page.click('article .heart >> nth=0');
  await page.waitForURL('**/login**');
  assert((await page.url()).includes('next='), 'login preserves return path');
});
await step('logged-in heart toggles on and off', async () => {
  await newAccount('browse');
  await go('/programs');
  await page.waitForSelector('header a[href="/me"]');
  await page.waitForSelector('article .heart');
  // The initial guest list can be replaced by the authenticated list after auth resolves.
  await page.waitForTimeout(800);
  await page.click('article .heart >> nth=0');
  await page.waitForFunction(() => document.querySelector('article .heart')?.getAttribute('aria-pressed') === 'true' && !document.querySelector('article .heart')?.disabled);
  let likes = await api('GET', '/api/likes');
  eq(likes.body.ids.length, 1, 'like persisted');
  await page.click('article .heart >> nth=0');
  await page.waitForFunction(() => document.querySelector('article .heart')?.getAttribute('aria-pressed') === 'false' && !document.querySelector('article .heart')?.disabled);
  likes = await api('GET', '/api/likes');
  eq(likes.body.ids.length, 0, 'unlike persisted');
});
await step('fit sort with my conditions', async () => {
  await go('/me');
  await page.waitForSelector('#profile input[type=number]:not(:disabled)');
  await page.fill('#profile input[type=number]', '29');
  await page.selectOption('#profile select >> nth=1', 'false');
  await page.click('#profile button.btn.primary');
  await seeText('저장했어요');
  await go('/programs?sort=fit');
  await seeText('내 정보 조건');
  await page.waitForSelector('article');
  const r = await api('GET', '/api/resources?sort=fit');
  eq(r.status, 200, 'fit sort works with profile');
  eq(await page.evaluate(() => document.querySelector('article h3')?.textContent), r.body.items[0].resource.title, 'fit ordering matches response');
});
