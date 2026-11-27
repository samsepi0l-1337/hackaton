await resetOrigin();
await step('login gate requires an account', async () => {
  await go('/mentor');
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
  await page.click(`text="${options.interests[0]}"`);
  assert(await page.evaluate((interest) => [...document.querySelectorAll('button.chip[aria-pressed="true"]')].some((b) => b.textContent.trim() === interest), options.interests[0]), 'interest selected');
  await page.waitForFunction(async (interest) => {
    const response = await fetch('/api/explore/session');
    const session = await response.json();
    return session.start.interests?.includes(interest) === true;
  }, options.interests[0], { timeout: 10000 });
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
  await page.fill('textarea[rows="3"]', '지역 상점의 배달 문제');
  await page.evaluate(() => document.querySelector('textarea[rows="3"]').blur());
  await page.waitForFunction(async () => {
    const session = await (await fetch('/api/explore/session')).json();
    return session.exploration?.origin === 'custom' && session.exploration?.customProblem === '지역 상점의 배달 문제';
  }, undefined, { timeout: 10000 });
  const session = await api('GET', '/api/explore/session');
  eq(session.body.exploration.origin, 'custom', 'custom origin saved');
  eq(session.body.exploration.customProblem, '지역 상점의 배달 문제', 'custom problem saved on blur');
});
