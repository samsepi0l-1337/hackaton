// ego lite E2E 공통 도우미. run.sh 가 이 파일과 spec 을 이어 붙여 `ego-browser nodejs` 로 실행한다.
// BASE·SPEC·API_LOG 는 run.sh 가 바꿔 넣는다.
const BASE = 'http://e2e-15300.localhost:15300';
const SPEC = '31-portal-nav';
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
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await resetOrigin();

await step('signed-out masthead login links to login with next', async () => {
  await go('/');
  await page.waitForSelector('.account-actions a[href^="/login?next="]');
  const account = await page.evaluate(() => ({
    text: document.querySelector('.account-actions a[href^="/login?"]')?.textContent.trim(),
    href: document.querySelector('.account-actions a[href^="/login?"]')?.getAttribute('href'),
    me: !!document.querySelector('.account-actions a[href="/me"]'),
  }));
  eq(account.text, '로그인', 'signed-out login label');
  eq(account.href, '/login?next=%2F', 'login preserves home destination');
  assert(!account.me, 'signed-out masthead has no 내 정보');
  await page.click('.account-actions a[href^="/login?"]');
  await page.waitForURL('**/login**');
  eq(new URL(await page.url()).pathname, '/login', 'login opens login page');
});

await step('login next stays intact and login returns to guide', async () => {
  const account = await newAccount('portal-next');
  await resetOrigin();
  await go('/login?next=%2Fguide');
  await page.waitForSelector('.account-actions a[href^="/login"]');
  eq(await page.evaluate(() => document.querySelector('.account-actions a[href^="/login"]').getAttribute('aria-current')), 'page', 'login link is current');
  await page.click('.account-actions a[href^="/login"]');
  eq(new URL(await page.url()).pathname + new URL(await page.url()).search, '/login?next=%2Fguide', 'login next remains intact');
  await page.fill('input[type="email"]', account.email);
  await page.fill('input[type="password"]', account.password);
  await page.click('form button:has-text("로그인")');
  await page.waitForURL('**/guide');
  eq(new URL(await page.url()).pathname, '/guide', 'login returns to guide');
});

await step('logged-in masthead shows 내 정보 linking to /me', async () => {
  await newAccount('portal-nav');
  await go('/');
  await page.waitForSelector('.account-actions a[href="/me"]');
  eq(await page.evaluate(() => document.querySelector('.account-actions a[href="/me"]')?.textContent.trim()), '내 정보', 'account label');
});

await step('AI 창업 상담 is a direct link with current page and no dropdown', async () => {
  const direct = await page.evaluate(() => {
    const link = document.querySelector('#portal-nav a[href="/mentor"]');
    return { label: link?.textContent.trim(), href: link?.getAttribute('href'), panel: !!link?.closest('.nav-group')?.querySelector('.menu-panel'), button: !!link?.closest('.nav-group')?.querySelector('button') };
  });
  eq(direct, { label: 'AI 창업 상담', href: '/mentor', panel: false, button: false }, 'direct mentor navigation');
  await page.click('#portal-nav a[href="/mentor"]');
  await page.waitForURL('**/mentor');
  eq(new URL(await page.url()).pathname, '/mentor', 'mentor destination');
  eq(await page.evaluate(() => document.querySelector('#portal-nav a[href="/mentor"]')?.getAttribute('aria-current')), 'page', 'mentor current page');
});

await step('지원사업 dropdown opens and closes on clicks and Escape', async () => {
  await page.evaluate(() => document.querySelector('#portal-nav .nav-group button').click());
  eq(await page.evaluate(() => document.querySelector('#portal-nav .nav-group button').getAttribute('aria-expanded')), 'true', 'first click opens dropdown');
  assert(await page.evaluate(() => !!document.querySelector('#portal-nav .nav-group .menu-panel')), 'open dropdown has panel');
  await page.evaluate(() => document.querySelector('#portal-nav .nav-group button').click());
  eq(await page.evaluate(() => document.querySelector('#portal-nav .nav-group button').getAttribute('aria-expanded')), 'false', 'second click closes dropdown');
  await page.evaluate(() => document.querySelector('#portal-nav .nav-group button').click());
  eq(await page.evaluate(() => document.querySelector('#portal-nav .nav-group button').getAttribute('aria-expanded')), 'true', 'dropdown reopened');
  await page.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  eq(await page.evaluate(() => document.querySelector('#portal-nav .nav-group button').getAttribute('aria-expanded')), 'false', 'Escape closes dropdown');
});

await step('hovered 지원사업 pins then explicitly closes without pointer movement', async () => {
  await go('/');
  const point = await page.evaluate(() => {
    const r = document.querySelector('#portal-nav .nav-group button').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  eq(await page.evaluate(() => document.querySelector('#portal-nav .nav-group button').getAttribute('aria-expanded')), 'true', 'hover opens dropdown');
  await page.click('#portal-nav .nav-group:first-child button');
  eq(await page.evaluate(() => document.querySelector('#portal-nav .nav-group button').getAttribute('aria-expanded')), 'true', 'click pins hovered dropdown');
  await page.click('#portal-nav .nav-group:first-child button');
  eq(await page.evaluate(() => document.querySelector('#portal-nav .nav-group button').getAttribute('aria-expanded')), 'false', 'second click closes hovered dropdown');
});

await step('home shortcuts expand from four to eight and collapse to four', async () => {
  await go('/');
  await seeText('자주 찾는 서비스');
  eq(await page.evaluate(() => document.querySelectorAll('.shortcuts .shortcut-grid a').length), 4, 'initial shortcut count');
  eq(await page.evaluate(() => [...document.querySelectorAll('.shortcuts .shortcut-grid a')].find(a => a.textContent.trim() === '맞춤형 공고')?.getAttribute('href')), '/programs?sort=fit', 'fit tile destination');
  await page.click('.shortcuts button');
  eq(await page.evaluate(() => document.querySelector('.shortcuts button').getAttribute('aria-expanded')), 'true', 'shortcuts expanded');
  eq(await page.evaluate(() => document.querySelectorAll('.shortcuts .shortcut-grid a').length), 8, 'expanded shortcut count');
  await page.click('.shortcuts button');
  eq(await page.evaluate(() => document.querySelector('.shortcuts button').getAttribute('aria-expanded')), 'false', 'shortcuts collapsed');
  eq(await page.evaluate(() => document.querySelectorAll('.shortcuts .shortcut-grid a').length), 4, 'collapsed shortcut count');
});

await step('masthead 이용 방법 opens guide with title', async () => {
  await page.click('.masthead .utility a[href="/guide"]');
  await page.waitForURL('**/guide');
  await page.waitForSelector('.guide-page h1');
  eq(new URL(await page.url()).pathname, '/guide', 'guide destination');
  eq(await page.evaluate(() => document.querySelector('.guide-page h1')?.textContent.trim()), '이용 방법', 'guide title');
});
} catch (e) { __err = e; }
// prelude·spec 뒤에 붙는다. 결과를 한 줄 JSON 으로 내고 공간을 닫는다. 실패면 다시 던져 종료 코드를 1로 만든다.
console.log('E2E_RESULT ' + JSON.stringify({ spec: SPEC, ok: !__err, steps: __steps }));
try { await task.finish({ keep: [] }); } catch {}
if (__err) throw __err;
