// ego lite E2E 공통 도우미. run.sh 가 이 파일과 spec 을 이어 붙여 `ego-browser nodejs` 로 실행한다.
// BASE·SPEC·API_LOG 는 run.sh 가 바꿔 넣는다.
const BASE = 'http://e2e-15300.localhost:15300';
const SPEC = '10-explore-02';
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
  await page.waitForSelector('.bubble.mentor:not([role="status"])');
  await page.waitForFunction(() => !document.querySelector('[role="status"].bubble'));
  assert(await page.evaluate(() => !document.querySelector('[role="alert"]')), 'AI-off fallback produced no failed alert');
  await page.fill('textarea[rows="3"]', '직장인 점심이 불편해요');
  await page.click('text="보내기"');
  await seeText('직장인 점심이 불편해요');
  await seeText('질문 2/3');
  await page.click('text="아직 모르겠어요"');
  await seeText('질문 3/3');
  await page.click('text="건너뛰기"');
  await seeText('지금까지 정리한 구상');
  assert(await page.evaluate(() => !document.querySelector('[role="alert"]')), 'AI-off summary produced no failed alert');
});
await step('summary view and edit persists on reload', async () => {
  await page.click('text="관심과 구상 수정"');
  await page.fill('#ed-interest', '수정한 도시락 구상');
  await page.evaluate(() => document.querySelector('#ed-interest').scrollIntoView({ block: 'center' }));
  await page.click('.summary-item:has(#ed-interest) button.primary');
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
  await page.waitForFunction((title) => document.querySelector('section[aria-labelledby="rs"]')?.innerText.includes(title), result.body.resources[0].resource.title);
});
await step('prep done toggle', async () => {
  await page.evaluate(() => document.querySelector('#pr').scrollIntoView({ block: 'center' }));
  await page.click('text="준비 완료 표시" >> nth=0');
  await seeText('준비 완료 표시됨');
  await page.reload();
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
  await page.evaluate(() => { window.__beforeExploreReset = true; });
  await page.click('[role="dialog"] button:has-text("초기화")');
  await page.waitForFunction(() => location.pathname === '/mentor' && !window.__beforeExploreReset);
  await seeText('시작 전에 확인해 주세요');
  const session = await api('GET', '/api/explore/session');
  eq(session.body.messages.length, 0, 'reset removes chat');
  eq(session.body.summary, null, 'reset removes summary');
});
} catch (e) { __err = e; }
// prelude·spec 뒤에 붙는다. 결과를 한 줄 JSON 으로 내고 공간을 닫는다. 실패면 다시 던져 종료 코드를 1로 만든다.
console.log('E2E_RESULT ' + JSON.stringify({ spec: SPEC, ok: !__err, steps: __steps }));
try { await task.finish({ keep: [] }); } catch {}
if (__err) throw __err;
