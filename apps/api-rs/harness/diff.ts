// 실서버 차등 하네스: TS 서버(bun)와 Rust 워커(wrangler dev)에 같은 요청을 보내 응답을 비교한다.
// 요청 순서는 goldens/http (TS API 테스트 기록) 시나리오. 주입 fetch·저장소 시나리오는 건너뛴다.
// 사용: bun apps/api-rs/harness/diff.ts [파일 이름 ...]   (환경: DIFF_TS_PORT=18960 DIFF_RS_PORT=18961)
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../../..');
const GOLD = join(ROOT, 'apps/api-rs/goldens/http');
const OUT = join(ROOT, 'apps/api-rs/harness/out');
const TS_PORT = Number(process.env.DIFF_TS_PORT ?? 18960);
const RS_PORT = Number(process.env.DIFF_RS_PORT ?? 18961);
const NOW = '2026-11-27T01:00:00.000Z';
const VARS: Record<string, string> = { TEST_MODE: '1', TEST_NOW: NOW, TEST_FIXTURES: '1', AI_MODE: 'off', DECIDE_ENABLED: '0', PASSWORD_PEPPER: 'test-pepper-not-a-secret', E2E_MAIL_LOG: '1' };
mkdirSync(OUT, { recursive: true });

type Srv = { name: string; port: number; log: string; proc: ReturnType<typeof Bun.spawn> };
function start(name: string, port: number): Srv {
  const log = join(OUT, name + '.log');
  const file = Bun.file(log);
  const proc = name === 'ts'
    ? Bun.spawn(['bun', '--preload', join(ROOT, 'packages/shared/test/setup-fixtures.ts'), 'src/server.ts'], { cwd: join(ROOT, 'apps/api'), env: { PATH: process.env.PATH!, HOME: process.env.HOME!, PORT: String(port), ...VARS }, stdout: file, stderr: file })
    : Bun.spawn([join(ROOT, 'apps/api/node_modules/.bin/wrangler'), 'dev', '-c', 'wrangler.test.jsonc', '--port', String(port), '--ip', '127.0.0.1', '--persist-to', join(OUT, 'rs-state'), ...Object.entries(VARS).flatMap(([k, v]) => ['--var', `${k}:${v}`])], { cwd: join(ROOT, 'apps/api-rs/worker'), env: { ...process.env, PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH}` }, stdout: file, stderr: file });
  return { name, port, log, proc };
}
async function ready(s: Srv, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { if ((await fetch(`http://127.0.0.1:${s.port}/api/health`)).ok) return; } catch {} await Bun.sleep(500); }
  throw new Error(s.name + ' 서버가 뜨지 않음: ' + s.log);
}

const volatile = (s: string) => /[0-9a-f]{24,}/.test(s) || s.startsWith('MOCK-');
function same(a: unknown, b: unknown, map: Map<string, string>, at: string, diffs: string[]) {
  if (typeof a === 'string' && typeof b === 'string' && volatile(a)) { const m = map.get(a); if (m !== undefined && m !== b) diffs.push(`${at}: ${a}→${m} 인데 ${b}`); else map.set(a, b); return; }
  if (Array.isArray(a) && Array.isArray(b)) { if (a.length !== b.length) diffs.push(`${at}: 길이 ${a.length} != ${b.length}`); a.forEach((x, i) => i < b.length && same(x, b[i], map, `${at}[${i}]`, diffs)); return; }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of Object.keys(a)) k in (b as object) ? same((a as any)[k], (b as any)[k], map, `${at}.${k}`, diffs) : diffs.push(`${at}.${k}: Rust 에 없음`);
    for (const k of Object.keys(b)) if (!(k in (a as object))) diffs.push(`${at}.${k}: TS 에 없음`);
    return;
  }
  if (a !== b) diffs.push(`${at}: TS ${JSON.stringify(a)} != Rust ${JSON.stringify(b)}`);
}
const subst = (v: unknown, map: Map<string, string>): unknown => typeof v === 'string' ? [...map].reduce((s, [x, y]) => s.split(x).join(y), v) : Array.isArray(v) ? v.map((x) => subst(x, map)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, subst(x, map)])) : v;
const secrets = (t: string) => [...(t.match(/\/verify\?token=(\S+)/)?.slice(1) ?? []), ...(t.match(/인증 코드 (\d{6})/)?.slice(1) ?? []), ...(t.match(/복구 비밀번호[^:：]*[:：]\s*(\S+)/)?.slice(1) ?? [])];
function mailsSince(s: Srv, from: number): { list: { to: string; body: string }[]; pos: number } {
  const text = readFileSync(s.log, 'utf8');
  const list = [...text.slice(from).matchAll(/\[mail:e2e\] to=(\S+) body=(".*")/g)].map((m) => ({ to: m[1]!, body: JSON.parse(m[2]!) as string }));
  return { list, pos: text.length };
}

async function call(s: Srv, jar: Map<number, string>, client: number, method: string, path: string, body: unknown) {
  const headers: Record<string, string> = {};
  if (body !== null && body !== undefined) headers['content-type'] = 'application/json';
  const c = jar.get(client); if (c) headers.cookie = c;
  const r = await fetch(`http://127.0.0.1:${s.port}${path}`, { method, headers, body: body === null || body === undefined ? undefined : JSON.stringify(body) });
  const cookies = r.headers.getSetCookie();
  if (cookies[0]) { const kv = cookies[0].split(';')[0]!; jar.set(client, kv.endsWith('=') ? '' : kv); }
  const text = await r.text();
  let json: unknown = null; try { json = text ? JSON.parse(text) : null; } catch { json = { $text: text }; }
  return { status: r.status, json, cookies };
}

const only = process.argv.slice(2);
const files = readdirSync(GOLD).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).filter((f) => !only.length || only.includes(f));
const ts = start('ts', TS_PORT); const rs = start('rs', RS_PORT);
let exitCode = 0;
try {
  await ready(ts, 30_000); await ready(rs, 600_000);
  let ran = 0, skipped = 0; const failures: string[] = [];
  for (const f of files) {
    for (const sc of JSON.parse(readFileSync(join(GOLD, f + '.json'), 'utf8'))) {
      if (sc.opts.custom.length || sc.opts.consultLimit || sc.opts.exploreAiLimit || sc.opts.failSubmit || Object.keys(sc.opts.env).length) { skipped++; continue; }
      ran++;
      for (const s of [ts, rs]) await fetch(`http://127.0.0.1:${s.port}/api/__test/reset`, { method: 'POST' });
      const jars = { ts: new Map<number, string>(), rs: new Map<number, string>() };
      const maps = { ts: new Map<string, string>(), rs: new Map<string, string>() }; // 기록 값 → 각 서버의 값
      const live = new Map<string, string>(); // TS 값 → Rust 값
      let pos = { ts: readFileSync(ts.log, 'utf8').length, rs: readFileSync(rs.log, 'utf8').length };
      for (const [i, st] of sc.steps.entries()) {
        const [a, b] = await Promise.all([ts, rs].map((s) => call(s, jars[s.name as 'ts' | 'rs'], st.client, st.method, subst(st.path, maps[s.name as 'ts' | 'rs']) as string, subst(st.body, maps[s.name as 'ts' | 'rs']))));
        await Bun.sleep(30);
        const ma = mailsSince(ts, pos.ts), mb = mailsSince(rs, pos.rs); pos = { ts: ma.pos, rs: mb.pos };
        const d: string[] = [];
        same(st.response, a!.json, maps.ts, 'rec', []); same(st.response, b!.json, maps.rs, 'rec', []);
        for (const [rm, lm] of st.mails.map((m: any, k: number) => [m, ma.list[k]])) if (lm) secrets(rm.text).forEach((x, k) => maps.ts.set(x, secrets(lm.body)[k]!));
        for (const [rm, lm] of st.mails.map((m: any, k: number) => [m, mb.list[k]])) if (lm) secrets(rm.text).forEach((x, k) => maps.rs.set(x, secrets(lm.body)[k]!));
        if (a!.status !== b!.status) d.push(`status TS ${a!.status} != Rust ${b!.status}`);
        same(a!.json, b!.json, live, 'body', d);
        if (a!.cookies.map((c) => c.replace(/=[^;]+;/, '=*;')).join() !== b!.cookies.map((c) => c.replace(/=[^;]+;/, '=*;')).join()) d.push(`set-cookie TS ${a!.cookies} != Rust ${b!.cookies}`);
        if (ma.list.length !== mb.list.length) d.push(`mails TS ${ma.list.length} != Rust ${mb.list.length}`);
        ma.list.forEach((m, k) => { const n = mb.list[k]; if (n && (m.to !== n.to || m.body.replace(/[0-9a-f]{24,}|\b\d{6}\b/g, '*') !== n.body.replace(/[0-9a-f]{24,}|\b\d{6}\b/g, '*'))) d.push(`mail[${k}] 다름`); });
        if (d.length) { failures.push(`${sc.name} 단계 ${i} ${st.method} ${st.path}\n    ${d.slice(0, 6).join('\n    ')}`); break; }
      }
    }
  }
  console.log(`차등: 시나리오 ${ran} 재생, ${skipped} 건너뜀, 실패 ${failures.length}`);
  for (const x of failures.slice(0, 15)) console.log('- ' + x);
  if (failures.length) exitCode = 1;
} finally {
  ts.proc.kill(); rs.proc.kill();
}
process.exit(exitCode);
