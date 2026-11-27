await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await resetOrigin();

await step('signed-out masthead login links to login with next', async () => {
  await go('/');
  await page.waitForSelector('.account-actions a[href^="/login?next="]');
  const account = await page.evaluate(() => ({
    text: document.querySelector('.account-actions a[href^="/login?"]')?.textContent.trim(),
    href: document.querySelector('.account-actions a[href^="/login?"]')?.getAttribute('href'),
    me: !!document.querySelector('.account-actions a[href="/me"]'),
  }));
  eq(account.text, '로그인', 'signed-out login label');
  eq(account.href, '/login?next=%2F', 'login preserves home destination');
  assert(!account.me, 'signed-out masthead has no 내 정보');
  await page.click('.account-actions a[href^="/login?"]');
  await page.waitForURL('**/login**');
  eq(new URL(await page.url()).pathname, '/login', 'login opens login page');
});

await step('logged-in masthead shows 내 정보 linking to /me', async () => {
  await newAccount('portal-nav');
  await go('/');
  await page.waitForSelector('.account-actions a[href="/me"]');
  eq(await page.evaluate(() => document.querySelector('.account-actions a[href="/me"]')?.textContent.trim()), '내 정보', 'account label');
});

await step('AI 창업 상담 is a direct link with current page and no dropdown', async () => {
  const direct = await page.evaluate(() => {
    const link = document.querySelector('#portal-nav a[href="/mentor"]');
    return { label: link?.textContent.trim(), href: link?.getAttribute('href'), panel: !!link?.closest('.nav-group')?.querySelector('.menu-panel'), button: !!link?.closest('.nav-group')?.querySelector('button') };
  });
  eq(direct, { label: 'AI 창업 상담', href: '/mentor', panel: false, button: false }, 'direct mentor navigation');
  await page.click('#portal-nav a[href="/mentor"]');
  await page.waitForURL('**/mentor');
  eq(new URL(await page.url()).pathname, '/mentor', 'mentor destination');
  eq(await page.evaluate(() => document.querySelector('#portal-nav a[href="/mentor"]')?.getAttribute('aria-current')), 'page', 'mentor current page');
});

await step('지원사업 dropdown opens and closes on clicks and Escape', async () => {
  await page.evaluate(() => document.querySelector('#portal-nav .nav-group button').click());
  eq(await page.evaluate(() => document.querySelector('#portal-nav .nav-group button').getAttribute('aria-expanded')), 'true', 'first click opens dropdown');
  assert(await page.evaluate(() => !!document.querySelector('#portal-nav .nav-group .menu-panel')), 'open dropdown has panel');
  await page.evaluate(() => document.querySelector('#portal-nav .nav-group button').click());
  eq(await page.evaluate(() => document.querySelector('#portal-nav .nav-group button').getAttribute('aria-expanded')), 'false', 'second click closes dropdown');
  await page.evaluate(() => document.querySelector('#portal-nav .nav-group button').click());
  eq(await page.evaluate(() => document.querySelector('#portal-nav .nav-group button').getAttribute('aria-expanded')), 'true', 'dropdown reopened');
  await page.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  eq(await page.evaluate(() => document.querySelector('#portal-nav .nav-group button').getAttribute('aria-expanded')), 'false', 'Escape closes dropdown');
});

await step('home shortcuts expand from four to eight and collapse to four', async () => {
  await go('/');
  await seeText('자주 찾는 서비스');
  eq(await page.evaluate(() => document.querySelectorAll('.shortcuts .shortcut-grid a').length), 4, 'initial shortcut count');
  eq(await page.evaluate(() => [...document.querySelectorAll('.shortcuts .shortcut-grid a')].find(a => a.textContent.trim() === '맞춤형 공고')?.getAttribute('href')), '/programs?sort=fit', 'fit tile destination');
  await page.click('.shortcuts button');
  eq(await page.evaluate(() => document.querySelector('.shortcuts button').getAttribute('aria-expanded')), 'true', 'shortcuts expanded');
  eq(await page.evaluate(() => document.querySelectorAll('.shortcuts .shortcut-grid a').length), 8, 'expanded shortcut count');
  await page.click('.shortcuts button');
  eq(await page.evaluate(() => document.querySelector('.shortcuts button').getAttribute('aria-expanded')), 'false', 'shortcuts collapsed');
  eq(await page.evaluate(() => document.querySelectorAll('.shortcuts .shortcut-grid a').length), 4, 'collapsed shortcut count');
});

await step('masthead 이용 방법 opens guide with title', async () => {
  await page.click('.masthead .utility a[href="/guide"]');
  await page.waitForURL('**/guide');
  await page.waitForSelector('.guide-page h1');
  eq(new URL(await page.url()).pathname, '/guide', 'guide destination');
  eq(await page.evaluate(() => document.querySelector('.guide-page h1')?.textContent.trim()), '이용 방법', 'guide title');
});
