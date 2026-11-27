await resetOrigin();
let programTitle;
let applicationPath;

await step('fresh user signs up and verifies email', async () => {
  await newAccount('applications');
  const me = await api('GET', '/api/auth/me');
  assert(me.body.user?.emailVerified, 'fresh account email verified');
});

await step('first non-closed program starts 지원서 작성 and opens application', async () => {
  await go('/programs');
  await page.waitForSelector('article h3 a');
  const result = await api('GET', '/api/resources');
  assert(result.status === 200, 'program list loads');
  const resource = result.body.items.find(x => x.resource.recruitStatus !== 'closed')?.resource;
  assert(!!resource, 'list contains a non-closed program');
  await go(`/programs/${resource.id}`);
  await page.waitForSelector('.program-detail h1');
  programTitle = await page.evaluate(() => document.querySelector('.program-detail h1').textContent.trim());
  await page.waitForSelector('.program-detail section button:has-text("지원서 작성")');
  // 버튼이 화면 밖이면 클릭이 실패한다. 먼저 화면 안으로 옮긴다.
  await page.evaluate(() => [...document.querySelectorAll('.program-detail section button')].find(b => b.textContent.includes('지원서 작성'))?.scrollIntoView({ block: 'center' }));
  await page.click('.program-detail section button:has-text("지원서 작성")');
  await page.waitForURL('**/applications/*', { timeout: 60000 });
  applicationPath = new URL(await page.url()).pathname;
  assert(/^\/applications\/[^/]+$/.test(applicationPath), 'application detail navigation');
});

await step('practice notice is visible and required fields reach 제출 전 확인', async () => {
  await page.waitForSelector('.apply-page [role="note"]');
  assert(await page.evaluate(() => document.querySelector('.apply-page [role="note"]').innerText.includes('모의로 처리돼요')), 'practice notice');
  await page.waitForSelector('.apply-page form');
  const fields = await page.evaluate(() => [...document.querySelectorAll('.apply-page form .apply-field')]
    .filter(field => field.querySelector('[aria-label="필수"]'))
    .map(field => field.querySelector('input, textarea'))
    .filter(field => field && !field.value.trim())
    .map(field => ({ id: field.id, maxLength: field.maxLength })));
  for (const field of fields) {
    const value = '테스트 지원 내용'.slice(0, field.maxLength < 0 ? undefined : field.maxLength);
    await page.fill(`[id="${field.id}"]`, value);
  }
  await page.click('.apply-page form button:has-text("제출 전 확인")');
  await page.waitForSelector('.apply-page label.check input[type="checkbox"]');
  assert((await bodyText()).includes('작성한 내용을 확인했어요'), 'confirmation checkbox label');
});

await step('모의 제출 shows MOCK- receipt', async () => {
  await page.click('.apply-page label.check input[type="checkbox"]');
  await page.click('.apply-page button:has-text("모의 제출")');
  await page.waitForSelector('.apply-receipt');
  assert(await page.evaluate(() => document.querySelector('.apply-receipt').innerText.includes('MOCK-')), 'mock receipt');
});

await step('내 지원서 lists the program with 완료 status', async () => {
  await go('/me');
  await page.waitForFunction(path => [...document.querySelectorAll('.app-row a')].some(a => a.getAttribute('href') === path), applicationPath);
  const row = await page.evaluate(path => {
    const link = [...document.querySelectorAll('.app-row a')].find(a => a.getAttribute('href') === path);
    const section = link?.closest('section');
    return { heading: section?.querySelector('h2')?.textContent.trim(), title: link?.textContent.trim(), status: link?.closest('li')?.querySelector('.badge')?.textContent.trim() };
  }, applicationPath);
  eq(row, { heading: '내 지원서', title: programTitle, status: '완료' }, 'completed application in 내 지원서');
});
