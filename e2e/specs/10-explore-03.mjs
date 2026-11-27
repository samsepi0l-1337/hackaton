await resetOrigin();
await newAccount('explore-quota');
const startBody = { start: { readiness: 'has_idea', idea: '동네 점심 서비스' } };

await step('each sent answer counts; the opening question does not', async () => {
  await go('/mentor');
  await seeText('이번 주 상담 채팅 12/12회 남음');
  eq((await api('PUT', '/api/explore/start', startBody)).status, 200, 'start');
  const open = await api('POST', '/api/explore/chat', {});
  eq(open.status, 200, 'opening question');
  eq(open.body.quota.remaining, 12, 'opening is free');
  for (let i = 0; i < 3; i++) {
    const r = await api('POST', '/api/explore/chat', { message: `답 ${i + 1}`, questionIndex: i });
    eq(r.status, 200, `answer ${i + 1}`);
    eq(r.body.quota.remaining, 11 - i, `remaining after answer ${i + 1}`);
  }
});

await step('one consult continues past the 3 planned questions', async () => {
  const more = await api('POST', '/api/explore/chat', { more: true });
  eq(more.status, 200, 'continue allowed after finish');
  eq(more.body.maxQuestions, 4, 'one more question added');
  eq(more.body.quota.remaining, 9, 'continue itself is free');
  const r = await api('POST', '/api/explore/chat', { message: '더 구체적인 답', questionIndex: 3 });
  eq(r.status, 200, 'follow-up answer');
  eq(r.body.quota.remaining, 8, 'follow-up answer counts');
  eq(r.body.maxQuestions, 5, 'next follow-up is asked');
});

await step('limit blocks the 13th message, also after a reset', async () => {
  for (let i = 4; i < 12; i++) {
    const r = await api('POST', '/api/explore/chat', { message: `이어서 ${i}`, questionIndex: i });
    if (r.status !== 200) {
      // 한 상담은 질문 12개까지다. 끝나면 새 상담으로 이어서 센다.
      eq(r.status, 409, `stopped by question cap at ${i}`);
      break;
    }
  }
  let session = await api('GET', '/api/explore/session');
  for (let guard = 0; session.body.quota.remaining > 0 && guard < 12; guard++) {
    await api('DELETE', '/api/explore/session');
    await api('PUT', '/api/explore/start', startBody);
    await api('POST', '/api/explore/chat', {});
    await api('POST', '/api/explore/chat', { message: '남은 횟수 쓰기', questionIndex: 0 });
    session = await api('GET', '/api/explore/session');
  }
  eq(session.body.quota.remaining, 0, 'all 12 used');
  await api('DELETE', '/api/explore/session');
  await go('/mentor');
  await seeText('이번 주 상담 채팅 0/12회 남음');
  const options = (await api('GET', '/api/explore/options')).body;
  await page.click(`text="${options.readiness.find((x) => x.value === 'has_idea').label}"`);
  await page.fill('textarea[aria-label="하고 싶은 일"]', '열세 번째 채팅');
  await page.click('text="구상 정리 시작"');
  await seeText('이번 주 상담 채팅 횟수를 모두 사용했어요');
  const r = await api('POST', '/api/explore/chat', {});
  eq(r.status, 429, 'new consult rejected when no chats are left');
});
