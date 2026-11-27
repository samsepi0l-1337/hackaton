await resetOrigin();
await step('home and program cards', async () => {
  await go('/');
  assert((await bodyText()).length > 0, 'home has content');
  await go('/programs');
  await seeText('지역 지원 살펴보기');
  await page.waitForSelector('article');
  const cards = await page.evaluate(() => [...document.querySelectorAll('article')].map(a => ({ title: a.querySelector('h3')?.innerText, link: a.querySelector('h3 a')?.getAttribute('href') })));
  assert(cards.length > 0 && cards.length <= 10 && cards.every(c => c.title && c.link?.startsWith('/programs/')), 'cards have titles and detail links');
});
await step('recent most viewed and closing soon sorts', async () => {
  const buttons = await page.evaluate(() => [...document.querySelectorAll('[aria-label="정렬"] button')].map(b => b.textContent));
  assert(buttons.length >= 3, 'sorting controls exist');
  for (const label of buttons) {
    await page.click(`button:text-is("${label}")`);
    await page.waitForFunction(t => [...document.querySelectorAll('[aria-label="정렬"] button')].some(b => b.textContent === t && b.getAttribute('aria-pressed') === 'true'), label);
    assert(await page.evaluate(t => [...document.querySelectorAll('[aria-label="정렬"] button')].some(b => b.textContent === t && b.getAttribute('aria-pressed') === 'true'), label), label + ' selected');
  }
});
await step('type stage search q and paging', async () => {
  await go('/programs');
  await page.waitForSelector('article');
  const values = await page.evaluate(() => ({ type: document.querySelector('#rt option:nth-child(2)').value, stage: document.querySelector('#rs option:nth-child(2)').value }));
  await page.selectOption('#rt', values.type);
  await page.waitForFunction(v => new URLSearchParams(location.search).get('type') === v, values.type);
  await page.selectOption('#rs', values.stage);
  await page.waitForFunction(v => new URLSearchParams(location.search).get('stage') === v, values.stage);
  const filtered = await api('GET', '/api/resources?type=' + encodeURIComponent(values.type) + '&stage=' + encodeURIComponent(values.stage));
  eq(filtered.status, 200, 'filters accepted');
  assert(filtered.body.items.every(x => (x.resource.type === values.type || x.resource.capabilityTags.includes(values.type)) && x.resource.stages.includes(values.stage)), 'filters apply');
  await page.fill('#rq', 'e2e-no-such-resource-xyz');
  await page.press('#rq', 'Enter');
  await seeText('현재 확인된 자료에서 맞는 경로를 찾지 못했어요');
  assert((await page.url()).includes('q=e2e-no-such-resource-xyz'), 'search reflected in URL');
  await go('/programs?page=999');
  await page.waitForSelector('article');
  const state = await page.evaluate(() => ({ count: document.querySelectorAll('article').length, pager: !!document.querySelector('nav[aria-label="페이지"]') }));
  assert(state.count > 0 && state.count <= 10, 'out-of-range page clamps');
  eq(state.pager, false, 'current resources fit on one page');
});
