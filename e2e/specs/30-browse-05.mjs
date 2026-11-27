await resetOrigin();
await step('admin requires authentication and restricts normal account', async () => {
  await go('/admin');
  await page.waitForURL('**/login**');
  assert((await page.url()).includes('login'), 'guest sent to login');
  await newAccount('nonteam');
  await go('/admin');
  await seeText('팀 계정만 볼 수 있어요');
  const r = await api('GET', '/api/admin/stats');
  eq(r.status, 403, 'non-team stats forbidden');
});
await step('team account can see admin stats', async () => {
  await resetOrigin();
  await go('/login');
  const login = await api('POST', '/api/auth/login', { email: 'team@test.local', password: 'team1234!' });
  eq(login.status, 200, 'team login succeeds');
  await go('/admin');
  await seeText('팀 통계');
  const stats = await api('GET', '/api/admin/stats');
  eq(stats.status, 200, 'team stats available');
  assert(typeof stats.body.users === 'number', 'stats contains users count');
});
