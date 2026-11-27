await resetOrigin();
await step('type test answers all questions and saves result locally', async () => {
  await go('/test');
  await page.click('text=테스트 시작');
  for (let i = 1; i <= 12; i++) {
    await page.waitForFunction(n => document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow') === String(n), i);
    await page.click('.option-btn >> nth=0');
  }
  await seeText('내 창업 유형');
  assert(await page.evaluate(() => localStorage.length > 0), 'result saved to local storage');
  await go('/test');
  await seeText('지난 결과');
  await page.click('text=결과 보기');
  await seeText('내 창업 유형');
});
await step('licenses and 404 pages', async () => {
  await go('/licenses');
  await seeText('오픈소스 라이선스 고지');
  assert((await bodyText()).includes('React'), 'licenses list React');
  await go('/no-such-page-e2e');
  await seeText('페이지를 찾을 수 없어요');
  assert((await bodyText()).includes('메인으로'), '404 offers home link');
});
await step('mobile navigation menu and bottom bar without horizontal scrolling', async () => {
  await page.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await go('/');
  await page.click('button[aria-label="메뉴"]');
  await page.waitForFunction(() => document.querySelector('button[aria-label="메뉴"]')?.getAttribute('aria-expanded') === 'true');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'home menu has no horizontal scroll');
  await page.click('.nav-mobile a[href="/programs"]');
  await page.waitForSelector('article');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'programs has no horizontal scroll');
  await page.click('button[aria-label="메뉴"]');
  await page.waitForFunction(() => document.querySelector('button[aria-label="메뉴"]')?.getAttribute('aria-expanded') === 'true');
  await page.click('.nav-mobile a[href="/test"]');
  await seeText('창업 유형 테스트');
  await page.click('text=테스트 시작');
  for (let i = 1; i <= 12; i++) {
    await page.waitForFunction(n => document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow') === String(n), i);
    await page.click('.option-btn >> nth=0');
  }
  await page.waitForSelector('.bottom-bar');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'mobile has no horizontal scroll');
  assert(await page.evaluate(() => { const r = document.querySelector('.bottom-bar').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), 'bottom bar is inside viewport');
  assert(await page.evaluate(() => !!document.querySelector('.bottom-bar button')), 'bottom bar offers action');
});
