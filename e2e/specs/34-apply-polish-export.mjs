await resetOrigin();
let appId;

await step('fresh user creates an application', async () => {
  await newAccount('polish');
  const rid = (await api('GET', '/api/resources')).body.items.find((x) => x.resource.recruitStatus !== 'closed').resource.id;
  const a = await api('POST', '/api/applications', { programId: rid });
  eq(a.status, 201, 'create');
  appId = a.body.id;
  eq(a.body.polishRemaining, 5, 'five polishes left');
});

await step('AI off: polish shows a clear message and keeps the count', async () => {
  await go('/applications/' + encodeURIComponent(appId));
  await seeText('AI로 다듬기');
  await seeText('남은 횟수 5/5');
  await page.click('.apply-polish button:has-text("AI로 다듬기")');
  await seeText('지금은 AI로 다듬을 수 없어요');
  const a = await api('GET', '/api/applications/' + encodeURIComponent(appId));
  eq(a.body.polishRemaining, 5, 'failed polish is not counted');
});

await step('export returns zip files for docx and hwpx', async () => {
  const bad = await api('GET', `/api/applications/${encodeURIComponent(appId)}/export?format=pdf`);
  eq(bad.status, 400, 'pdf is not a server format');
  for (const format of ['docx', 'pptx', 'hwpx']) {
    const r = await api('GET', `/api/applications/${encodeURIComponent(appId)}/export?format=${format}`);
    eq(r.status, 200, format + ' status');
    assert(r.body.fileName.endsWith('.' + format), format + ' file name');
    assert(r.body.fileBase64.startsWith('UEsDB'), format + ' is a zip');
    eq(r.body.source, 'standard', format + ' uses the standard form');
  }
  const h = await api('GET', `/api/applications/${encodeURIComponent(appId)}/export?format=hwpx`);
  assert(atob(h.body.fileBase64).slice(30, 38) === 'mimetype', 'hwpx mimetype is the first entry');
});

await step('download button saves the draft and reports the form source', async () => {
  await page.fill('.apply-page form textarea >> nth=0', '내려받기 전에 고친 문장');
  await page.evaluate(() => document.querySelector('.apply-export').scrollIntoView({ block: 'center' }));
  await page.click('.apply-export button:has-text("워드(DOCX)")');
  await seeText('공통 양식(공문 형식)으로 내려받았어요');
  const a = await api('GET', '/api/applications/' + encodeURIComponent(appId));
  assert(a.body.fields.some((f) => f.value === '내려받기 전에 고친 문장'), 'draft saved before export');
});

await step('my form upload: unsupported type and doc-worker off are explained', async () => {
  const hwp = await api('POST', `/api/applications/${encodeURIComponent(appId)}/form-fill`, { fileName: 'form.hwp', fileBase64: 'AAAA' });
  eq(hwp.status, 422, 'hwp is rejected with a hint');
  const off = await api('POST', `/api/applications/${encodeURIComponent(appId)}/form-fill`, { fileName: 'form.docx', fileBase64: 'UEsDBA==' });
  eq(off.status, 503, 'local run has no doc-worker');
  await seeText('내가 찾은 제출 양식에 채우기');
});
