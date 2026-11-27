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
  const loginLink = page.getByRole('link', { name: '로그인하고 상담 시작' });
  assert(await loginLink.isVisible(), 'login link is visible');
  eq(await loginLink.getAttribute('href'), '/login?next=%2Fmentor', 'login link returns to mentor');
  await loginLink.click();
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
await step('empty problem cards show matching emptyReason and hold choice', async () => {
  const options = (await api('GET', '/api/explore/options')).body;
  const query = new URLSearchParams({ interests: options.interests[0], region: '경남' });
  const r = await api('GET', `/api/explore/problems?${query}`);
  eq(r.status, 200, 'problem status');
  eq(r.body.items.length, 0, 'no shipped problem cards');
  assert(typeof r.body.emptyReason === 'string' && r.body.emptyReason.length > 0, 'emptyReason present');
  await seeText(`현재 확인된 문제 자료가 없습니다 (${r.body.emptyReason})`);
  await page.click('text="아직 탐색 중"');
  await seeText('문제를 정하지 않아도');
});
await step('custom problem editor opens and saves on blur', async () => {
  await page.click('text="직접 적기"');
  await page.waitForFunction(() => !!document.querySelector('textarea[rows="3"]') || !!document.querySelector('[role="alert"], .error-text'));
  assert(await page.evaluate(() => !!document.querySelector('textarea[rows="3"]')), 'custom problem editor opens');
  assert(await page.evaluate(() => !document.querySelector('[role="alert"], .error-text')), 'no error alert');
  assert(await page.evaluate(() => [...document.querySelectorAll(':is(section[aria-labelledby="pc"], section[aria-label="알아볼 문제 고르기"]) button.chip')].find((b) => b.textContent.trim() === '아직 탐색 중')?.getAttribute('aria-pressed') === 'false'), 'hold is not selected while custom editor is open');
  await page.fill('textarea[rows="3"]', '지역 상점의 배달 문제');
  await page.evaluate(() => document.querySelector('textarea[rows="3"]').blur());
  const session = await waitForSession((s) => s.exploration?.origin === 'custom' && s.exploration?.customProblem === '지역 상점의 배달 문제', 'custom problem saved on blur');
  eq(session.exploration.origin, 'custom', 'custom origin saved');
  eq(session.exploration.customProblem, '지역 상점의 배달 문제', 'custom problem saved on blur');
  await page.fill('textarea[rows="3"]', '');
  await page.evaluate(() => document.querySelector('textarea[rows="3"]').blur());
  const cleared = await waitForSession((s) => s.exploration?.origin === 'hold' && s.exploration?.customProblem === null, 'clearing custom problem saves hold');
  eq(cleared.exploration.origin, 'hold', 'hold origin saved');
  eq(cleared.exploration.customProblem, null, 'custom problem cleared');
  await page.waitForFunction(() => !document.querySelector('textarea[rows="3"]'));
  const selected = await page.evaluate(() => [...document.querySelectorAll(':is(section[aria-labelledby="pc"], section[aria-label="알아볼 문제 고르기"]) button.chip[aria-pressed="true"]')].map((b) => b.textContent.trim()));
  eq(selected, ['아직 탐색 중'], 'only hold chip selected after clearing');
});
