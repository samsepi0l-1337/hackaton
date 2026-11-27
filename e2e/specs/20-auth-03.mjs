await resetOrigin();
const account = await newAccount('account');
const changed = 'Changed-pass-1234!';
async function login(email, password) {
  await go('/login');
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.click('form button.primary');
}
async function changePassword(current, next) {
  await page.fill('#password input[type=password] >> nth=0', current);
  await page.fill('#password input[type=password] >> nth=1', next);
  await page.fill('#password input[type=password] >> nth=2', next);
  await page.evaluate(() => document.querySelector('#password form').requestSubmit());
  await seeText('비밀번호를 바꿨어요');
}
await step('logout and RequireAuth redirects to login and back via next', async () => {
  await go('/me');
  await seeText(account.email);
  await page.click('text=로그아웃');
  await go('/me?from=e2e');
  await page.waitForFunction(() => location.pathname === '/login', undefined, { timeout: 10000 });
  eq(new URL(await page.url()).searchParams.get('next'), '/me?from=e2e', 'next preserved');
  await page.fill('input[type=email]', account.email);
  await page.fill('input[type=password]', account.password);
  await page.click('form button.primary');
  await page.waitForFunction(() => location.pathname === '/me', undefined, { timeout: 10000 });
  eq(new URL(await page.url()).search, '?from=e2e', 'return to protected URL');
});
await step('change password from me', async () => {
  await changePassword(account.password, changed);
  await page.click('text=로그아웃');
  await login(account.email, account.password);
  await seeText('이메일 또는 비밀번호가 맞지 않아요');
  await page.fill('input[type=password]', changed);
  await page.click('form button.primary');
  await page.waitForFunction(() => location.pathname !== '/login', undefined, { timeout: 10000 });
});
await step('me basic profile edit persists after reload', async () => {
  await go('/me');
  await page.waitForFunction(() => { const input = document.querySelector('#profile input[type=number]'); return input && !input.disabled; }, undefined, { timeout: 10000 });
  await page.fill('#profile input[type=number]', '37');
  await page.click('#profile button.primary');
  await seeText('저장했어요');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#profile input[type=number]')?.value === '37', undefined, { timeout: 10000 });
  eq(await page.evaluate(() => document.querySelector('#profile input[type=number]').value), '37', 'profile age persists');
});
await step('forgot recovery password forces password change', async () => {
  await page.click('text=로그아웃');
  await go('/forgot');
  await page.fill('input[type=email]', account.email);
  await page.click('form button.primary');
  await page.waitForSelector('[role=status]');
  const mail = await lastMailBody(account.email);
  const recovery = mail.match(/복구 비밀번호: (\S+)/)?.[1];
  assert(recovery, 'recovery password in mail');
  await login(account.email, recovery);
  await page.waitForFunction(() => location.pathname === '/me' && location.search.includes('notice=password'), undefined, { timeout: 10000 });
  await seeText('복구 비밀번호로 로그인했어요');
  await changePassword(recovery, 'Recovered-pass-1234!');
});
await step('delete account then login fails', async () => {
  await page.click('text=계정 삭제');
  await page.click('[role=dialog] button.danger');
  await page.waitForFunction(() => location.pathname === '/', undefined, { timeout: 10000 });
  await login(account.email, 'Recovered-pass-1234!');
  await seeText('이메일 또는 비밀번호가 맞지 않아요');
});
