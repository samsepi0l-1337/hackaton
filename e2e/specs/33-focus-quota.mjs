await resetOrigin();
let rid;

await step('fresh user signs up', async () => {
  await newAccount('focus');
  const res = await api('GET', '/api/resources');
  rid = res.body.items.find((x) => x.resource.recruitStatus !== 'closed').resource.id;
  assert(!!rid, 'open resource exists');
});

await step('program page starts a consult with the focus program', async () => {
  await go('/programs/' + encodeURIComponent(rid));
  await page.click('a:has-text("내 구상에 맞는 준비 안내 받기")');
  await page.waitForFunction(() => location.pathname === '/mentor' && !location.search.includes('focus='));
  const s = await api('GET', '/api/explore/session');
  eq(s.body.start.focusResourceId, rid, 'focus saved in session');
  eq(s.body.focus?.id, rid, 'session returns focus');
  await seeText('관심 공고');
});

await step('application quota allows 2 per week', async () => {
  const q0 = await api('GET', '/api/applications/quota');
  eq(q0.body.limit, 2, 'limit is 2');
  const ids = (await api('GET', '/api/resources')).body.items.filter((x) => x.resource.recruitStatus !== 'closed').map((x) => x.resource.id);
  const a = await api('POST', '/api/applications', { programId: ids[0] });
  eq(a.status, 201, 'first create');
  const b = await api('POST', '/api/applications', { programId: ids[1] });
  eq(b.status, 201, 'second create');
  const c = await api('POST', '/api/applications', { programId: ids[2] });
  eq(c.status, 429, 'third create blocked');
  eq(c.body.error.code, 'application_limit', 'limit code');
  const q = await api('GET', '/api/applications/quota');
  eq(q.body.remaining, 0, 'none left');
});
