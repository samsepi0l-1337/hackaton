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
  await seeText(`전체 ${feedback.body.total}건`);
  await page.click('text=로그아웃');
});
