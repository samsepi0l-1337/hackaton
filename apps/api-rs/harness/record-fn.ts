// 함수 골든 기록: TS 테스트 실행 중 packages/shared/src 의 export 호출 (입력, 출력) 을 모은다.
// 사용: GIL_RECORD_FN=<out dir> bun test --preload ./apps/api-rs/harness/record-fn.ts packages
import { afterAll, mock } from 'bun:test';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const OUT = process.env.GIL_RECORD_FN;
const SRC = resolve(import.meta.dir, '../../../packages/shared/src');
const MAX = 150;
const rec: Record<string, { fn: string; args: unknown[]; out: unknown }[]> = {};
const seen = new Set<string>();
const consts: Record<string, Record<string, unknown>> = {};

const enc = (v: unknown, depth = 0): unknown => {
  if (depth > 40) throw new Error('deep');
  if (v instanceof Date) return { $date: v.toISOString() };
  if (typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint') throw new Error('unserializable');
  if (v === undefined) return { $undef: true };
  if (typeof v === 'number' && !Number.isFinite(v)) return { $num: String(v) };
  if (Array.isArray(v)) return v.map((x) => enc(x, depth + 1));
  if (v instanceof Set) return { $set: [...v].map((x) => enc(x, depth + 1)) };
  if (v instanceof Map) return { $map: [...v].map(([k, x]) => [enc(k, depth + 1), enc(x, depth + 1)]) };
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x, depth + 1)]));
  return v;
};

if (OUT) {
  for (const f of readdirSync(SRC).filter((f) => f.endsWith('.ts') && f !== 'index.ts')) {
    const path = join(SRC, f);
    const mod = f.replace(/\.ts$/, '');
    const orig = require(path);
    const wrapped: Record<string, unknown> = {};
    for (const [name, val] of Object.entries(orig)) {
      if (typeof val !== 'function' || /^[A-Z]/.test(name)) { wrapped[name] = val; try { (consts[mod] ??= {})[name] = enc(val); } catch {} continue; }
      wrapped[name] = function (this: unknown, ...args: unknown[]) {
        let snapshot: string | null = null;
        try { snapshot = JSON.stringify(enc(args)); } catch { snapshot = null; }
        const out = (val as (...a: unknown[]) => unknown).apply(this, args);
        if (snapshot !== null && !(out instanceof Promise)) {
          const list = (rec[mod] ??= []);
          const key = name + snapshot;
          if (!seen.has(key) && list.filter((r) => r.fn === name).length < MAX) {
            try { const o = enc(out); seen.add(key); list.push({ fn: name, args: JSON.parse(snapshot) as unknown[], out: o }); } catch {}
          }
        }
        return out;
      };
    }
    mock.module(path, () => wrapped);
  }
  afterAll(() => {
    mkdirSync(OUT, { recursive: true });
    for (const [mod, list] of Object.entries(rec)) writeFileSync(join(OUT, mod + '.json'), JSON.stringify({ module: mod, cases: list }, null, 0));
    writeFileSync(join(OUT, '_consts.json'), JSON.stringify(consts));
  });
}
