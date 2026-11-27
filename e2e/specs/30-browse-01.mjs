await resetOrigin();
async function waitTitles(titles) {
  await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('article h3')].map(x => x.textContent)) === JSON.stringify(expected.slice(0, 10)), titles);
  eq(await page.evaluate(() => [...document.querySelectorAll('article h3')].map(x => x.textContent)), titles.slice(0, 10), 'rendered resource order');
}
await step('home and program cards', async () => {
  await go('/');
  await seeText('원스톱 창업 상담');
  await go('/programs');
  await page.waitForSelector('article');
  const cards = await page.evaluate(() => [...document.querySelectorAll('article')].map(a => ({ title: a.querySelector('h3')?.innerText, link: a.querySelector('h3 a')?.getAttribute('href') })));
  assert(cards.length > 0 && cards.length <= 10 && cards.every(c => c.title && c.link?.startsWith('/programs/')), 'cards have titles and detail links');
});
await step('recent most viewed and closing soon sorts', async () => {
  const recent = await api('GET', '/api/resources?sort=recent');
  assert(recent.body.items.length > 1, 'multiple resources for sorting');
  // Give a resource other than the recent leader a view; the detail spec reserves another resource.
  const target = recent.body.items[recent.body.items.length - 1].resource.id;
  await api('GET', '/api/resources/' + encodeURIComponent(target));
  const buttons = await page.evaluate(() => [...document.querySelectorAll('[aria-label="정렬"] button')].map(b => b.textContent));
  assert(buttons.length >= 3, 'sorting controls exist');
  const orders = [];
  for (const label of buttons) {
    await page.click(`button:text-is("${label}")`);
    await page.waitForFunction(t => [...document.querySelectorAll('[aria-label="정렬"] button')].some(b => b.textContent === t && b.getAttribute('aria-pressed') === 'true'), label);
    const sort = new URL(await page.url()).searchParams.get('sort') || 'deadline';
    const result = await api('GET', '/api/resources?sort=' + encodeURIComponent(sort));
    eq(result.status, 200, sort + ' response');
    const titles = result.body.items.map(x => x.resource.title);
    await waitTitles(titles);
    orders.push(JSON.stringify(titles));
  }
  assert(new Set(orders).size >= 2, 'at least two sort orders differ');
});
await step('type stage search q and paging', async () => {
  await go('/programs');
  await page.waitForSelector('article');
  const all = await api('GET', '/api/resources');
  const resource = all.body.items[0].resource;
  const values = { type: resource.type, stage: resource.stages[0] };
  assert(!!values.stage, 'seed resource has stage');
  await page.selectOption('#rt', values.type);
  await page.waitForFunction(v => new URLSearchParams(location.search).get('type') === v, values.type);
  await page.selectOption('#rs', values.stage);
  await page.waitForFunction(v => new URLSearchParams(location.search).get('stage') === v, values.stage);
  const filtered = await api('GET', '/api/resources?type=' + encodeURIComponent(values.type) + '&stage=' + encodeURIComponent(values.stage));
  eq(filtered.status, 200, 'filters accepted');
  assert(filtered.body.items.length > 0 && filtered.body.items.every(x => (x.resource.type === values.type || x.resource.capabilityTags.includes(values.type)) && x.resource.stages.includes(values.stage)), 'nonempty filtered results');
  await waitTitles(filtered.body.items.map(x => x.resource.title));
  await page.click('text=조건 모두 지우기');
  await page.waitForFunction(() => !new URLSearchParams(location.search).has('type') && !new URLSearchParams(location.search).has('stage'));
  await page.fill('#rq', resource.title);
  await page.press('#rq', 'Enter');
  await page.waitForFunction(q => new URLSearchParams(location.search).get('q') === q, resource.title);
  const search = await api('GET', '/api/resources?q=' + encodeURIComponent(resource.title));
  assert(search.body.items.some(x => x.resource.id === resource.id), 'positive search finds seed');
  await waitTitles(search.body.items.map(x => x.resource.title));
  await page.fill('#rq', 'e2e-no-such-resource-xyz');
  await page.press('#rq', 'Enter');
  await seeText('현재 확인된 자료에서 맞는 경로를 찾지 못했어요');
  assert((await page.url()).includes('q=e2e-no-such-resource-xyz'), 'empty search reflected in URL');
  await go('/programs');
  await waitTitles(all.body.items.map(x => x.resource.title));
  if (all.body.items.length <= 10) {
    await go('/programs?page=999');
    await waitTitles(all.body.items.map(x => x.resource.title));
  }
  if (all.body.items.length > 10) {
    const first = await page.evaluate(() => document.querySelector('article h3').textContent);
    await page.click('nav[aria-label="페이지"] button:text-is("2")');
    await page.waitForFunction(() => document.querySelector('nav[aria-label="페이지"] [aria-current="page"]')?.textContent === '2');
    await page.waitForFunction(t => document.querySelector('article h3')?.textContent !== t, first);
    assert(await page.evaluate(t => document.querySelector('article h3')?.textContent !== t, first), 'page two changes first title');
  }
  // With the current seven-resource seed there is only one page, so page navigation is not testable.
});
