await resetOrigin();
await newAccount('explore-flow');
await step('chat turns and AI-off fallback', async () => {
  await go('/mentor');
  await seeText('시작 전에 확인해 주세요');
  const options = (await api('GET', '/api/explore/options')).body;
  const choice = options.readiness.find((x) => x.value === 'has_idea');
  await page.click(`text="${choice.label}"`);
  await page.fill('textarea[aria-label="하고 싶은 일"]', '지역 직장인을 위한 도시락');
  await page.click('text="부산"');
  await page.click('text="구상 정리 시작"');
  await seeText('질문 1/3');
  await page.waitForSelector('.bubble.mentor');
  await page.fill('textarea[rows="3"]', '직장인 점심이 불편해요');
  await page.click('text="보내기"');
  await seeText('직장인 점심이 불편해요');
  await seeText('질문 2/3');
  await page.click('text="아직 모르겠어요"');
  await seeText('질문 3/3');
  await page.click('text="건너뛰기"');
  await seeText('지금까지 정리한 구상');
  assert((await bodyText()).includes('창업 구상 요약'), 'rule summary exists with AI off');
});
await step('summary view and edit persists on reload', async () => {
  await page.click('text="관심과 구상 수정"');
  await page.fill('#ed-interest', '수정한 도시락 구상');
  await page.evaluate(() => document.querySelector('#ed-interest').closest('.summary-item').querySelector('button.primary').click());
  await seeText('수정한 도시락 구상');
  await page.reload();
  await seeText('수정한 도시락 구상');
  await page.click('text="준비 안내 보기"');
  await seeText('나의 창업 준비 방향');
});
await step('result resources regional card prep toggle and conditions edit', async () => {
  await seeText('부울경에서 시작한다면');
  await seeText('우선 준비사항');
  await seeText('부산에서 연결할 수 있는 지원');
  const result = await api('GET', '/api/explore/result');
  eq(result.status, 200, 'result status');
  assert(Array.isArray(result.body.resources) && result.body.resources.length > 0, 'resources returned');
});
await step('prep done toggle', async () => {
  await page.evaluate(() => document.querySelector('#pr').scrollIntoView({ block: 'center' }));
  await page.click('text="준비 완료 표시" >> nth=0');
  await seeText('준비 완료 표시됨');
});
await step('conditions edit', async () => {
  await page.click('text="내 조건 확인"');
  await page.fill('input[type="number"]', '30');
  await page.click('text="조건 대조하기"');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  const session = await api('GET', '/api/explore/session');
  eq(session.body.start.conditions.age, 30, 'conditions saved');
});
await step('feedback submit and session reset', async () => {
  await page.click('text="도움 됨"');
  await page.click('text="의견 보내기"');
  await seeText('의견을 보내 주셔서 고마워요');
  await page.click('text="초기화"');
  await page.click('[role="dialog"] button:has-text("초기화")');
  await seeText('시작 전에 확인해 주세요');
  const session = await api('GET', '/api/explore/session');
  eq(session.body.messages.length, 0, 'reset removes chat');
  eq(session.body.summary, null, 'reset removes summary');
});
