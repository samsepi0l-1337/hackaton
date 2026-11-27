await resetOrigin();
await newAccount('explore-quota');
await step('quota display and fourth consult blocked after reset', async () => {
  await go('/mentor');
  await seeText('이번 주 상담 3/3회 남음');
  for (let i = 0; i < 3; i++) {
    const start = await api('PUT', '/api/explore/start', { start: { readiness: 'has_idea', idea: '동네 점심 서비스' } });
    eq(start.status, 200, `start consult ${i + 1}`);
    const chat = await api('POST', '/api/explore/chat', {});
    eq(chat.status, 200, `consult ${i + 1} allowed`);
    assert(chat.body.messages.length > 0 && !chat.body.failed, 'AI-off question fallback');
    const reset = await api('DELETE', '/api/explore/session');
    eq(reset.status, 200, 'reset session');
  }
  await go('/mentor');
  await seeText('이번 주 상담 0/3회 남음');
  const options = (await api('GET', '/api/explore/options')).body;
  await page.click(`text="${options.readiness.find((x) => x.value === 'has_idea').label}"`);
  await page.fill('textarea[aria-label="하고 싶은 일"]', '네 번째 구상');
  await page.click('text="구상 정리 시작"');
  await seeText('이번 주 상담 횟수를 모두 사용했어요');
  const r = await api('POST', '/api/explore/chat', {});
  eq(r.status, 429, 'fourth consult rejected');
});
