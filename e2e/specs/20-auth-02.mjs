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
  await go('/verify?email=' + encodeURIComponent(email));
  await page.click('text=인증 메일 보내기');
  await seeText('너무 자주 요청했어요');
  await page.click('text=인증 메일 다시 보내기');
  await page.waitForFunction(() => [...document.querySelectorAll('[role=alert]')].filter(e => e.textContent.includes('너무 자주 요청했어요')).length === 2, undefined, { timeout: 10000 });
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
  await go('/me');
  await seeText('이메일 인증 완료');
});
await step('five wrong code attempts lock out the sixth', async () => {
  const other = uniqueEmail('code-limit');
  const signup = await api('POST', '/api/auth/signup', { email: other, password, passwordConfirm: password, consent: true });
  eq(signup.status, 201, 'separate unverified account');
  const code = await lastVerifyCode(other);
  assert(/^\d{6}$/.test(code), 'six-digit code in mail');
  const wrong = code === '000000' ? '000001' : '000000';
  for (let i = 0; i < 5; i++) {
    const result = await api('POST', '/api/auth/verify', { email: other, code: wrong });
    eq(result.status, 400, 'wrong code attempt ' + (i + 1));
  }
  await go('/verify?email=' + encodeURIComponent(other));
  await page.fill('input[autocomplete=one-time-code]', wrong);
  await page.click('form button.primary');
  await seeText('코드를 너무 많이 틀렸어요');
});
