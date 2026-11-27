await resetOrigin();
// This spec must run last: the /bufs IP lock lasts 10 minutes and survives resetOrigin.
await step('bufs wrong password lockout', async () => {
  await go('/bufs');
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
