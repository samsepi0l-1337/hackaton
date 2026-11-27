// ego lite E2E 공통 도우미. run.sh 가 이 파일과 spec 을 이어 붙여 `ego-browser nodejs` 로 실행한다.
// BASE·SPEC·API_LOG 는 run.sh 가 바꿔 넣는다.
const BASE = 'http://e2e-15300.localhost:15300';
const SPEC = '32-applications';
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
let programTitle;
let applicationPath;

await step('fresh user signs up and verifies email', async () => {
  await newAccount('applications');
  const me = await api('GET', '/api/auth/me');
  assert(me.body.user?.emailVerified, 'fresh account email verified');
});

await step('first non-closed program starts 지원서 작성 and opens application', async () => {
  await go('/programs');
  await page.waitForSelector('article h3 a');
  const result = await api('GET', '/api/resources');
  assert(result.status === 200, 'program list loads');
  const resource = result.body.items.find(x => x.resource.recruitStatus !== 'closed')?.resource;
  assert(!!resource, 'list contains a non-closed program');
  await go(`/programs/${resource.id}`);
  await page.waitForSelector('.program-detail h1');
  programTitle = await page.evaluate(() => document.querySelector('.program-detail h1').textContent.trim());
  await page.waitForSelector('.program-detail section button:has-text("지원서 작성")');
  await page.click('.program-detail section button:has-text("지원서 작성")');
  await page.waitForURL('**/applications/*', { timeout: 60000 });
  applicationPath = new URL(await page.url()).pathname;
  assert(/^\/applications\/[^/]+$/.test(applicationPath), 'application detail navigation');
});

await step('practice notice is visible and required fields reach 제출 전 확인', async () => {
  await page.waitForSelector('.apply-page [role="note"]');
  assert(await page.evaluate(() => document.querySelector('.apply-page [role="note"]').innerText.includes('모의로 처리돼요')), 'practice notice');
  await page.waitForSelector('.apply-page form');
  const fields = await page.evaluate(() => [...document.querySelectorAll('.apply-page form .apply-field')]
    .filter(field => field.querySelector('[aria-label="필수"]'))
    .map(field => field.querySelector('input, textarea'))
    .filter(field => field && !field.value.trim())
    .map(field => ({ id: field.id, maxLength: field.maxLength })));
  for (const field of fields) {
    const value = '테스트 지원 내용'.slice(0, field.maxLength < 0 ? undefined : field.maxLength);
    await page.fill(`[id="${field.id}"]`, value);
  }
  await page.click('.apply-page form button:has-text("제출 전 확인")');
  await page.waitForSelector('.apply-page label.check input[type="checkbox"]');
  assert((await bodyText()).includes('작성한 내용을 확인했어요'), 'confirmation checkbox label');
});

await step('모의 제출 shows MOCK- receipt', async () => {
  await page.click('.apply-page label.check input[type="checkbox"]');
  await page.click('.apply-page button:has-text("모의 제출")');
  await page.waitForSelector('.apply-receipt');
  assert(await page.evaluate(() => document.querySelector('.apply-receipt').innerText.includes('MOCK-')), 'mock receipt');
});

await step('내 지원서 lists the program with 완료 status', async () => {
  await go('/me');
  await page.waitForFunction(path => [...document.querySelectorAll('.app-row a')].some(a => a.getAttribute('href') === path), applicationPath);
  const row = await page.evaluate(path => {
    const link = [...document.querySelectorAll('.app-row a')].find(a => a.getAttribute('href') === path);
    const section = link?.closest('section');
    return { heading: section?.querySelector('h2')?.textContent.trim(), title: link?.textContent.trim(), status: link?.closest('li')?.querySelector('.badge')?.textContent.trim() };
  }, applicationPath);
  eq(row, { heading: '내 지원서', title: programTitle, status: '완료' }, 'completed application in 내 지원서');
});
} catch (e) { __err = e; }
// prelude·spec 뒤에 붙는다. 결과를 한 줄 JSON 으로 내고 공간을 닫는다. 실패면 다시 던져 종료 코드를 1로 만든다.
console.log('E2E_RESULT ' + JSON.stringify({ spec: SPEC, ok: !__err, steps: __steps }));
try { await task.finish({ keep: [] }); } catch {}
if (__err) throw __err;
