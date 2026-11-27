// HTTP 골든 기록: apps/api/test/helpers.ts 의 setup() 하나 = 시나리오 하나. 요청·응답·보낸 메일을 순서대로 남긴다.
// GIL_RECORD_HTTP=<out dir> 일 때만 켜진다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

type Step = { client: number; method: string; path: string; body: unknown; now: string; status: number; response: unknown; setCookie: string[]; mails: { to: string; subject: string; text: string }[] };
const OUT = process.env.GIL_RECORD_HTTP;
const all: { file: string; name: string; opts: Record<string, unknown>; steps: Step[] }[] = [];
// bun 은 테스트 파일마다 afterAll 범위가 달라서, 단계마다 해당 파일의 기록을 바로 덮어쓴다.
function save(file: string) {
  mkdirSync(OUT!, { recursive: true });
  writeFileSync(join(OUT!, file + '.json'), JSON.stringify(all.filter((s) => s.file === file)));
}

function caller(): { file: string; name: string } {
  const stack = new Error().stack ?? '';
  const m = stack.split('\n').map((l) => l.match(/([\w.-]+\.test\.ts):(\d+)/)).find(Boolean);
  return { file: m ? basename(m[1]!, '.test.ts') : 'unknown', name: m ? `${m[1]}:${m[2]}` : 'unknown' };
}

export function recordScenario(opts: Record<string, any>, mail: { sent: { to: string; subject: string; text: string }[] }, clock: () => Date) {
  if (!OUT) return null;
  const where = caller();
  const custom = ['fetch', 'docWorkerFor', 'kstartup', 'store', 'mailer'].filter((k) => opts[k] !== undefined);
  const sc = {
    ...where,
    opts: { env: opts.env ?? {}, consultLimit: opts.consultLimit ?? null, exploreAiLimit: opts.exploreAiLimit ?? null, failSubmit: typeof opts.failSubmit === 'function', custom },
    steps: [] as Step[],
  };
  all.push(sc);
  let clients = 0;
  let mailSeen = 0;
  return {
    nextClient: () => ++clients,
    step(state: { id: number }, method: string, path: string, body: unknown, status: number, text: string, setCookie: string[]) {
      const mails = mail.sent.slice(mailSeen).map((m) => ({ to: m.to, subject: m.subject, text: m.text }));
      mailSeen = mail.sent.length;
      let response: unknown = null;
      try { response = text ? JSON.parse(text) : null; } catch { response = { $text: text }; }
      sc.steps.push({ client: state.id, method, path, body: body ?? null, now: clock().toISOString(), status, response, setCookie, mails });
      save(sc.file);
    },
  };
}
