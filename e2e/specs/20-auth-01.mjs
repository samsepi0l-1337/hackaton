await resetOrigin();
const email = uniqueEmail('signup');
const password = 'E2e-pass-1234!';
const signupButton = 'form button[type=submit], form button.primary';
await step('signup password checklist, confirm mismatch, consent required and invalid email', async () => {
  await go('/signup');
  await page.fill('input[type=email]', 'invalid');
  await page.fill('input[type=password] >> nth=0', 'short');
  await page.fill('input[type=password] >> nth=1', 'different');
  await seeText('두 비밀번호가 달라요');
  assert((await bodyText()).includes('✗ 규칙:'), 'weak password checklist');
  // 버튼은 막지 않고, 누르면 무엇이 빠졌는지 보여 준다.
  await page.click(signupButton);
  await seeText('이메일 형식이 올바르지 않아요');
  await seeText('개인정보 안내에 동의해 주세요');
  await seeText('아래 비밀번호 조건을 모두 맞춰 주세요');
  await page.fill('input[type=password] >> nth=0', password);
  await page.fill('input[type=password] >> nth=1', password);
  await seeText('두 비밀번호가 같아요');
  await seeText('✓ 규칙:');
  await page.fill('input[type=email]', email);
  await page.click(signupButton);
  await seeText('개인정보 안내에 동의해 주세요');
  assert(!(await bodyText()).includes('인증 메일을 보냈어요'), 'consent required');
  await page.evaluate(() => document.querySelector('input[type=checkbox]').click());
  assert(!(await page.evaluate(() => document.querySelector('form button.primary').disabled)), 'valid signup enabled');
});
await step('signup and verify by link token', async () => {
  await page.click(signupButton);
  await seeText('인증 메일을 보냈어요');
  const link = await lastVerifyLink(email);
  await go(new URL(link).pathname + new URL(link).search);
  await page.waitForFunction(() => !location.pathname.startsWith('/verify'), undefined, { timeout: 10000 });
  const me = await api('GET', '/api/auth/me');
  eq(me.body.user.email, email, 'link verified account');
  eq(me.body.user.emailVerified, true, 'link verification');
  await go('/me');
  await seeText('이메일 인증 완료');
});
await step('duplicate email is rejected on signup', async () => {
  await go('/signup');
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password] >> nth=0', password);
  await page.fill('input[type=password] >> nth=1', password);
  await page.evaluate(() => document.querySelector('input[type=checkbox]').click());
  await page.click(signupButton);
  await seeText('이미 가입된 이메일이에요');
});
