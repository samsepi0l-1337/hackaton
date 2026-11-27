await resetOrigin();
await step('bufs admin login and feedback list', async () => {
  await go('/bufs');
  await page.waitForSelector('input[type=password]');
  await page.fill('input[type=password]', ADMIN_PASSWORD);
  await page.click('text=들어가기');
  await seeText('의견 모아보기');
  await seeText('전체');
  const feedback = await api('GET', '/api/bufs/feedback');
  eq(feedback.status, 200, 'admin can see feedback');
  assert(Array.isArray(feedback.body.items) && typeof feedback.body.total === 'number', 'feedback response structure');
  await page.click('text=로그아웃');
});
await step('bufs wrong password lockout', async () => {
  await page.waitForSelector('input[type=password]');
  for (let i = 0; i < 5; i++) {
    await page.fill('input[type=password]', 'wrong-password');
    await page.click('text=들어가기');
    await seeText('비밀번호가 맞지 않아요');
  }
  await page.fill('input[type=password]', ADMIN_PASSWORD);
  await page.click('text=들어가기');
  await seeText('로그인 시도가 너무 많아 잠겼어요');
  assert((await bodyText()).includes('잠겼어요'), 'lockout shown even for correct password');
});
