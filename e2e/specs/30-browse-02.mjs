await resetOrigin();
await step('detail view increments once per viewer', async () => {
  await go('/programs');
  // 30-browse-01 only views the last recent resource; reserve a different one here.
  const recent = await api('GET', '/api/resources?sort=recent');
  const item = recent.body.items[recent.body.items.length - 2];
  const id = encodeURIComponent(item.resource.id);
  await go('/programs/' + id);
  await seeText('얻을 수 있는 도움');
  const first = await api('GET', '/api/resources/' + id);
  const second = await api('GET', '/api/resources/' + id);
  eq(first.body.views, item.views + 1, 'first viewer increments count');
  eq(second.body.views, first.body.views, 'repeat viewer does not increment');
  await seeText(`조회 ${first.body.views}`);
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
  await go('/');
  await page.waitForSelector('header a[href="/me"]');
  await page.click('header nav.nav a[href="/programs"]');
  await page.waitForSelector('article .heart');
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
  await go('/programs?sort=fit');
  await seeText('지금은 내 정보 조건과 창업 준비 단계로만 정렬해요');
  const before = await api('GET', '/api/resources?sort=fit');
  await page.waitForFunction(t => document.querySelector('article h3')?.textContent === t, before.body.items[0].resource.title);
  await go('/me');
  await page.waitForSelector('#profile input[type=number]:not(:disabled)');
  await page.fill('#profile input[type=number]', '29');
  await page.selectOption('#profile select >> nth=1', 'false');
  await page.click('#profile button.btn.primary');
  await seeText('저장했어요');
  await go('/programs?sort=fit');
  await seeText('지금은 내 정보 조건과 창업 준비 단계로만 정렬해요');
  const r = await api('GET', '/api/resources?sort=fit');
  eq(r.status, 200, 'fit sort works with profile');
  await page.waitForFunction(t => document.querySelector('article h3')?.textContent === t, r.body.items[0].resource.title);
  const oldOrder = before.body.items.map(x => x.resource.id);
  const newOrder = r.body.items.map(x => x.resource.id);
  assert(JSON.stringify(oldOrder) !== JSON.stringify(newOrder), 'conditions change fit order');
});
