await resetOrigin();
async function waitForSession(predicate, message) {
  let session;
  for (let i = 0; i < 50; i++) {
    session = (await api('GET', '/api/explore/session')).body;
    if (predicate(session)) break;
    await page.waitForTimeout(100);
  }
  assert(predicate(session), message);
  return session;
}
await step('login gate requires an account', async () => {
  await go('/mentor');
  await seeText('로그인하고 상담 시작');
  eq(await page.evaluate(() => location.pathname), '/mentor', 'logged-out visitor stays on mentor');
  const href = await page.evaluate(() => [...document.querySelectorAll('a')].find((a) => a.textContent.trim() === '로그인하고 상담 시작')?.getAttribute('href'));
  eq(href, '/login?next=%2Fmentor', 'login link returns to mentor');
  await page.click('a:has-text("로그인하고 상담 시작")');
  await page.waitForFunction(() => location.pathname === '/login' && new URLSearchParams(location.search).get('next') === '/mentor');
  await seeText('비밀번호 찾기');
});
await newAccount('explore-start');
await step('readiness choices, 200-character idea, interests and region coverage', async () => {
  await go('/mentor');
  await seeText('시작 전에 확인해 주세요');
  const options = (await api('GET', '/api/explore/options')).body;
  eq(options.readiness.length, 3, 'three readiness choices');
  for (const choice of options.readiness) {
    await page.click(`text="${choice.label}"`);
    const hasIdea = ['has_idea', 'preparing'].includes(choice.value);
    eq(await page.evaluate(() => !!document.querySelector('textarea[aria-label="하고 싶은 일"]')), hasIdea, `idea field for ${choice.value}`);
    if (hasIdea) {
      await page.fill('textarea[aria-label="하고 싶은 일"]', '가'.repeat(200));
      eq(await page.evaluate(() => document.querySelector('textarea[aria-label="하고 싶은 일"]').maxLength), 200, 'idea maximum');
      eq(await page.evaluate(() => document.querySelector('textarea[aria-label="하고 싶은 일"]').value.length), 200, '200 characters accepted');
    }
  }
  await page.evaluate((interest) => [...document.querySelectorAll('button.chip')].find((b) => b.textContent.trim() === interest)?.scrollIntoView({ block: 'center' }), options.interests[0]);
  await page.click(`text="${options.interests[0]}"`);
  assert(await page.evaluate((interest) => [...document.querySelectorAll('button.chip[aria-pressed="true"]')].some((b) => b.textContent.trim() === interest), options.interests[0]), 'interest selected');
  await waitForSession((session) => session.start.interests?.includes(options.interests[0]) === true, 'interest autosaved');
  for (const region of ['울산', '경남']) {
    await page.click(`text="${region}"`);
    await seeText(`${region}: 상세 지원 경로 준비 중`);
  }
});
