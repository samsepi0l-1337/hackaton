// HTTP 골든 기록: apps/api/test/helpers.ts 의 setup() 하나 = 시나리오 하나. 요청·응답·보낸 메일을 순서대로 남긴다.
// GIL_RECORD_HTTP=<out dir> 일 때만 켜진다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

type Step = { client: number; initialClient?: number; method: string; path: string; body: unknown; now: string; status: number; response: unknown; setCookie: string[]; mails: { to: string; subject: string; text: string }[] };
const OUT = process.env.GIL_RECORD_HTTP;
const all: { file: string; name: string; opts: Record<string, unknown>; initNow?: string; excluded?: string; steps: Step[] }[] = [];
// bun 은 테스트 파일마다 afterAll 범위가 달라서, 단계마다 해당 파일의 기록을 바로 덮어쓴다.
function save(file: string) {
  mkdirSync(OUT!, { recursive: true });
  writeFileSync(join(OUT!, file + '.json'), JSON.stringify(all.filter((s) => s.file === file)));
}

function caller(): { file: string; name: string } {
  const stack = new Error().stack ?? '';
  const matches = stack.split('\n').map((l) => l.match(/([\w.-]+\.test\.ts):(\d+)/)).filter((m) => m !== null);
  const m = matches.find((x) => !(x[1] === 'explore-scenarios.test.ts' && x[2] === '10')) ?? matches[0];
  return { file: m ? basename(m[1]!, '.test.ts') : 'unknown', name: m ? `${m[1]}:${m[2]}` : 'unknown' };
}

export function recordScenario(opts: Record<string, any>, mail: { sent: { to: string; subject: string; text: string }[] }, clock: () => Date) {
  if (!OUT) return null;
  const where = caller();
  const custom = ['fetch', 'docWorkerFor', 'kstartup', 'store', 'mailer'].filter((k) => opts[k] !== undefined);
  const sc = {
    ...where,
    opts: { env: opts.env ?? {}, consultLimit: opts.consultLimit ?? null, exploreAiLimit: opts.exploreAiLimit ?? null, failSubmit: typeof opts.failSubmit === 'function', custom },
    initNow: undefined as string | undefined,
    excluded: ({
      'bufs-profile.test.ts:145': 'Mutates shared rs-ccei-consult resource conditions',
      'explore-scenarios.test.ts:167': 'Mutates shared resource end date and recruitment status',
      'explore-scenarios.test.ts:298': 'Mutates shared rs-ccei-consult resource conditions',
      'explore-scenarios.test.ts:316': 'Adds a shared regional context fixture',
    } as Record<string, string>)[where.name] ?? (custom.length ? `Injected dependencies cannot be replayed: ${custom.join(', ')}` : undefined),
    steps: [] as Step[],
  };
  all.push(sc);
  let requestNow: string | undefined;
  let awaitingRequest = false;
  let clients = 0;
  let mailSeen = 0;
  return {
    clock() {
      const value = clock();
      const iso = value.toISOString();
      if (!sc.initNow && !opts.store) sc.initNow = iso;
      else if (awaitingRequest) { requestNow = iso; awaitingRequest = false; }
      return value;
    },
    begin() { requestNow = undefined; awaitingRequest = true; },
    nextClient: () => ++clients,
    step(state: { id: number; initialClient?: number }, method: string, path: string, body: unknown, status: number, text: string, setCookie: string[]) {
      const mails = mail.sent.slice(mailSeen).map((m) => ({ to: m.to, subject: m.subject, text: m.text }));
      mailSeen = mail.sent.length;
      let response: unknown = null;
      try { response = text ? JSON.parse(text) : null; } catch { response = { $text: text }; }
      const now = requestNow!;
      sc.initNow ??= now;
      sc.steps.push({ client: state.id, initialClient: state.initialClient, method, path, body: body ?? null, now, status, response, setCookie, mails });
      save(sc.file);
    },
  };
}
