// ego lite E2E 공통 도우미. run.sh 가 이 파일과 spec 을 이어 붙여 `ego-browser nodejs` 로 실행한다.
// BASE·SPEC·API_LOG 는 run.sh 가 바꿔 넣는다.
const BASE = 'http://e2e-15300.localhost:15300';
const SPEC = '30-browse-01';
const API_LOG = '/Users/samsepiol/Cursor/hackaton/.delta/worktrees/y5m14a5eawka/hackaton/e2e/.out-fb/api.log';
const OUT = '/Users/samsepiol/Cursor/hackaton/.delta/worktrees/y5m14a5eawka/hackaton/e2e/.out-fb';
/** run.sh 가 API 에 넣은 /bufs 관리자 비밀번호 (E2E 전용). 시드 계정: demo@test.local / demo1234!, team@test.local / team1234! (팀 계정). */
const ADMIN_PASSWORD = 'e2e-admin-pass-1234';
const fs = await import('node:fs/promises');
const task = await taskSpace(`e2e ${SPEC} ${Date.now()}`);
const page = task.page('p1');
const __steps = [];

/** 이 출처의 쿠키·저장소만 지운다 (프로필 전체를 지우는 명령은 쓰지 않는다). */
async function resetOrigin(p = page) {
  if (!(await p.url()).startsWith(BASE)) await p.goto(BASE + '/licenses');
  await p.cdp('Storage.clearDataForOrigin', { origin: BASE, storageTypes: 'cookies,local_storage,session_storage,indexeddb' });
}
function assert(cond, msg) { if (!cond) throw new Error('assert: ' + msg); }
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`eq: ${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }
const bodyText = (p = page) => p.evaluate(() => document.body.innerText);
/** 화면에 text 가 나올 때까지 기다린다. */
async function seeText(text, { p = page, timeout = 8000 } = {}) {
  await p.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout }).catch(async () => {
    throw new Error(`seeText: "${text}" 없음. 화면: ${(await bodyText(p)).slice(0, 400).replace(/\s+/g, ' ')}`);
  });
}
async function go(path, p = page) { await p.goto(BASE + path); await p.waitForLoadState(); }
/** 화면 안의 API 호출 (같은 쿠키). */
async function api(method, path, body, p = page) {
  const r = await p.fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = JSON.parse(r.body); } catch {}
  return { status: r.status, body: json };
}
/** 개발용 메일러가 API 로그에 남긴 인증 링크 중 마지막 것. */
async function lastVerifyLink(email) {
  // wrangler dev 는 로그를 늦게 내보낼 수 있어서 3초까지 다시 읽는다.
  for (let attempt = 0; attempt < 30; attempt++) {
    const lines = (await fs.readFile(API_LOG, 'utf8')).split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(/verify link: (\S+)/);
      if (m && (!email || lines.slice(Math.max(0, i - 3), i).some((l) => l.includes(email)))) return m[1];
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('인증 링크를 로그에서 찾지 못함: ' + email);
}
/** E2E 러너(E2E_MAIL_LOG=1)가 API 로그에 남긴 email 의 마지막 메일 본문. 인증 코드·복구 비밀번호를 여기서 읽는다. */
async function lastMailBody(email) {
  const lines = (await fs.readFile(API_LOG, 'utf8')).split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^\[mail:e2e\] to=(\S+) body=(.*)$/);
    if (m && m[1] === email) return JSON.parse(m[2]);
  }
  throw new Error('메일 본문을 로그에서 찾지 못함: ' + email);
}
/** 마지막 인증 메일의 6자리 코드. */
const lastVerifyCode = async (email) => (await lastMailBody(email)).match(/\b(\d{6})\b/)?.[1] ?? null;
const uniqueEmail = (tag) => `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
/** 회원가입 + 메일 인증까지 끝낸 계정 (API 로 처리, 화면 흐름은 auth spec 에서 따로 본다). */
async function newAccount(tag, password = 'E2e-pass-1234!') {
  const email = uniqueEmail(tag);
  const s = await api('POST', '/api/auth/signup', { email, password, passwordConfirm: password, agree: true, consent: true });
  assert(s.status < 300, 'signup ' + s.status + ' ' + JSON.stringify(s.body));
  const link = await lastVerifyLink(email);
  const token = new URL(link, BASE).searchParams.get('token');
  const v = await api('POST', '/api/auth/verify', { token });
  assert(v.status < 300, 'verify ' + v.status + ' ' + JSON.stringify(v.body));
  return { email, password };
}
async function step(name, fn) {
  const t0 = Date.now();
  try { await fn(); __steps.push({ name, ok: true, ms: Date.now() - t0 }); }
  catch (e) {
    const shot = `${OUT}/${SPEC}-${__steps.length}.png`;
    try { await page.screenshot({ path: shot }); } catch {}
    __steps.push({ name, ok: false, ms: Date.now() - t0, error: String(e.message || e).slice(0, 600), screenshot: shot });
    throw e;
  }
}
let __err = null;
try {
await resetOrigin();
async function waitTitles(titles) {
  await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('article h3')].map(x => x.textContent)) === JSON.stringify(expected.slice(0, 10)), titles);
  eq(await page.evaluate(() => [...document.querySelectorAll('article h3')].map(x => x.textContent)), titles.slice(0, 10), 'rendered resource order');
}
await step('home and program cards', async () => {
  await go('/');
  await seeText('원클릭 창업 상담');
  await go('/programs');
  await page.waitForSelector('article');
  const cards = await page.evaluate(() => [...document.querySelectorAll('article')].map(a => ({ title: a.querySelector('h3')?.innerText, link: a.querySelector('h3 a')?.getAttribute('href') })));
  assert(cards.length > 0 && cards.length <= 10 && cards.every(c => c.title && c.link?.startsWith('/programs/')), 'cards have titles and detail links');
});
await step('recent most viewed and closing soon sorts', async () => {
  const recent = await api('GET', '/api/resources?sort=recent');
  assert(recent.body.items.length > 1, 'multiple resources for sorting');
  // Give a resource other than the recent leader a view; the detail spec reserves another resource.
  const target = recent.body.items[recent.body.items.length - 1].resource.id;
  await api('GET', '/api/resources/' + encodeURIComponent(target));
  const buttons = await page.evaluate(() => [...document.querySelectorAll('[aria-label="정렬"] button')].map(b => b.textContent));
  assert(buttons.length >= 3, 'sorting controls exist');
  const orders = [];
  for (const label of buttons) {
    await page.click(`button:text-is("${label}")`);
    await page.waitForFunction(t => [...document.querySelectorAll('[aria-label="정렬"] button')].some(b => b.textContent === t && b.getAttribute('aria-pressed') === 'true'), label);
    const sort = new URL(await page.url()).searchParams.get('sort') || 'deadline';
    const result = await api('GET', '/api/resources?sort=' + encodeURIComponent(sort));
    eq(result.status, 200, sort + ' response');
    const titles = result.body.items.map(x => x.resource.title);
    await waitTitles(titles);
    orders.push(JSON.stringify(titles));
  }
  assert(new Set(orders).size >= 2, 'at least two sort orders differ');
});
await step('type stage search q and paging', async () => {
  await go('/programs');
  await page.waitForSelector('article');
  const all = await api('GET', '/api/resources');
  const resource = all.body.items[0].resource;
  const values = { type: resource.type, stage: resource.stages[0] };
  assert(!!values.stage, 'seed resource has stage');
  await page.selectOption('#rt', values.type);
  await page.waitForFunction(v => new URLSearchParams(location.search).get('type') === v, values.type);
  await page.selectOption('#rs', values.stage);
  await page.waitForFunction(v => new URLSearchParams(location.search).get('stage') === v, values.stage);
  const filtered = await api('GET', '/api/resources?type=' + encodeURIComponent(values.type) + '&stage=' + encodeURIComponent(values.stage));
  eq(filtered.status, 200, 'filters accepted');
  assert(filtered.body.items.length > 0 && filtered.body.items.every(x => (x.resource.type === values.type || x.resource.capabilityTags.includes(values.type)) && x.resource.stages.includes(values.stage)), 'nonempty filtered results');
  await waitTitles(filtered.body.items.map(x => x.resource.title));
  await page.click('text=조건 모두 지우기');
  await page.waitForFunction(() => !new URLSearchParams(location.search).has('type') && !new URLSearchParams(location.search).has('stage'));
  await page.fill('#rq', resource.title);
  await page.press('#rq', 'Enter');
  await page.waitForFunction(q => new URLSearchParams(location.search).get('q') === q, resource.title);
  const search = await api('GET', '/api/resources?q=' + encodeURIComponent(resource.title));
  assert(search.body.items.some(x => x.resource.id === resource.id), 'positive search finds seed');
  await waitTitles(search.body.items.map(x => x.resource.title));
  await page.fill('#rq', 'e2e-no-such-resource-xyz');
  await page.press('#rq', 'Enter');
  await seeText('현재 확인된 자료에서 맞는 경로를 찾지 못했어요');
  assert((await page.url()).includes('q=e2e-no-such-resource-xyz'), 'empty search reflected in URL');
  await go('/programs');
  await waitTitles(all.body.items.map(x => x.resource.title));
  if (all.body.items.length <= 10) {
    await go('/programs?page=999');
    await waitTitles(all.body.items.map(x => x.resource.title));
  }
  if (all.body.items.length > 10) {
    const first = await page.evaluate(() => document.querySelector('article h3').textContent);
    await page.click('nav[aria-label="페이지"] button:text-is("2")');
    await page.waitForFunction(() => document.querySelector('nav[aria-label="페이지"] [aria-current="page"]')?.textContent === '2');
    await page.waitForFunction(t => document.querySelector('article h3')?.textContent !== t, first);
    assert(await page.evaluate(t => document.querySelector('article h3')?.textContent !== t, first), 'page two changes first title');
  }
  // With the current seven-resource seed there is only one page, so page navigation is not testable.
});
} catch (e) { __err = e; }
// prelude·spec 뒤에 붙는다. 결과를 한 줄 JSON 으로 내고 공간을 닫는다. 실패면 다시 던져 종료 코드를 1로 만든다.
console.log('E2E_RESULT ' + JSON.stringify({ spec: SPEC, ok: !__err, steps: __steps }));
try { await task.finish({ keep: [] }); } catch {}
if (__err) throw __err;
