await resetOrigin();
const email = uniqueEmail('code');
const password = 'E2e-pass-1234!';
await step('unverified account login shows verification panel', async () => {
  const r = await api('POST', '/api/auth/signup', { email, password, passwordConfirm: password, consent: true });
  eq(r.status, 201, 'signup');
  await go('/login');
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.click('form button.primary');
  await seeText('이메일 인증이 필요해요');
});
await step('resend limit rejects immediate repeat', async () => {
  const r = await api('POST', '/api/auth/verify/resend', { email });
  eq(r.status, 429, 'signup starts resend limit');
});
await step('wrong code attempts display rejection', async () => {
  const code = await lastVerifyCode(email);
  assert(/^\d{6}$/.test(code), 'six-digit code in mail');
  const wrong = code === '000000' ? '000001' : '000000';
  await go('/verify?email=' + encodeURIComponent(email));
  await page.fill('input[autocomplete=one-time-code]', wrong);
  await page.click('form button.primary');
  await seeText('코드가 틀렸거나');
});
await step('verify by six-digit code', async () => {
  const code = await lastVerifyCode(email);
  await page.fill('input[autocomplete=one-time-code]', code);
  await page.click('form button.primary');
  await page.waitForFunction(() => !location.pathname.startsWith('/verify'), undefined, { timeout: 10000 });
  const me = await api('GET', '/api/auth/me');
  eq(me.body.user.email, email, 'code verified account');
  eq(me.body.user.emailVerified, true, 'code verification');
});
