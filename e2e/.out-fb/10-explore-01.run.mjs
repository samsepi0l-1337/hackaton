// ego lite E2E 공통 도우미. run.sh 가 이 파일과 spec 을 이어 붙여 `ego-browser nodejs` 로 실행한다.
// BASE·SPEC·API_LOG 는 run.sh 가 바꿔 넣는다.
const BASE = 'http://e2e-15300.localhost:15300';
const SPEC = '10-explore-01';
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
async function waitForSession(predicate, message) {
  let session;
  for (let i = 0; i < 50; i++) {
    session = (await api('GET', '/api/explore/session')).body;
    if (predicate(session)) break;
    await page.waitForTimeout(100);
  }
  assert(predicate(session), message);
  return session;
}
await step('login gate requires an account', async () => {
  await go('/mentor');
  await seeText('로그인하고 상담 시작');
  eq(await page.evaluate(() => location.pathname), '/mentor', 'logged-out visitor stays on mentor');
  const href = await page.evaluate(() => [...document.querySelectorAll('a')].find((a) => a.textContent.trim() === '로그인하고 상담 시작')?.getAttribute('href'));
  eq(href, '/login?next=%2Fmentor', 'login link returns to mentor');
  await page.click('a:has-text("로그인하고 상담 시작")');
  await page.waitForFunction(() => location.pathname === '/login' && new URLSearchParams(location.search).get('next') === '/mentor');
  await seeText('비밀번호 찾기');
});
await newAccount('explore-start');
await step('readiness choices, 200-character idea, interests and region coverage', async () => {
  await go('/mentor');
  await seeText('시작 전에 확인해 주세요');
  const options = (await api('GET', '/api/explore/options')).body;
  eq(options.readiness.length, 3, 'three readiness choices');
  for (const choice of options.readiness) {
    await page.click(`text="${choice.label}"`);
    const hasIdea = ['has_idea', 'preparing'].includes(choice.value);
    eq(await page.evaluate(() => !!document.querySelector('textarea[aria-label="하고 싶은 일"]')), hasIdea, `idea field for ${choice.value}`);
    if (hasIdea) {
      await page.fill('textarea[aria-label="하고 싶은 일"]', '가'.repeat(200));
      eq(await page.evaluate(() => document.querySelector('textarea[aria-label="하고 싶은 일"]').maxLength), 200, 'idea maximum');
      eq(await page.evaluate(() => document.querySelector('textarea[aria-label="하고 싶은 일"]').value.length), 200, '200 characters accepted');
    }
  }
  await page.evaluate((interest) => [...document.querySelectorAll('button.chip')].find((b) => b.textContent.trim() === interest)?.scrollIntoView({ block: 'center' }), options.interests[0]);
  await page.click(`text="${options.interests[0]}"`);
  assert(await page.evaluate((interest) => [...document.querySelectorAll('button.chip[aria-pressed="true"]')].some((b) => b.textContent.trim() === interest), options.interests[0]), 'interest selected');
  await waitForSession((session) => session.start.interests?.includes(options.interests[0]) === true, 'interest autosaved');
  for (const region of ['울산', '경남']) {
    await page.click(`text="${region}"`);
    await seeText(`${region}: 상세 지원 경로 준비 중`);
  }
});
} catch (e) { __err = e; }
// prelude·spec 뒤에 붙는다. 결과를 한 줄 JSON 으로 내고 공간을 닫는다. 실패면 다시 던져 종료 코드를 1로 만든다.
console.log('E2E_RESULT ' + JSON.stringify({ spec: SPEC, ok: !__err, steps: __steps }));
try { await task.finish({ keep: [] }); } catch {}
if (__err) throw __err;
