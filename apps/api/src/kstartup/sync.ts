// 실제 공고 수집 (F8). 성공하면 pbanc_sn 기준으로 추가·갱신하고, 이번 조회에 없는 이전 모집 중 공고는 종료로 표시한다(삭제 안 함).
// 실패하면 마지막 수집 자료를 그대로 두고 오류만 기록한다.
import { kstDate, kstartupToResource, type KStartupSyncResponse, type Resource } from '@gil/shared';
import type { Bindings } from '../env';
import { fetchAnnouncements, type FetchLike } from './client';
import type { KStartupMeta, KStartupStore } from './store';

const same = (a: Resource, b: Resource) => JSON.stringify({ ...a, checkedAt: null }) === JSON.stringify({ ...b, checkedAt: null });
const isOpen = (r: Resource, today: string) => r.recruitStatus !== 'closed' && !(r.endDate !== null && r.endDate < today);

export interface SyncDeps { store: KStartupStore; env?: Pick<Bindings, 'KSTARTUP_SERVICE_KEY'>; fetch?: FetchLike; now: Date }

async function doSync({ store, env, fetch, now }: SyncDeps): Promise<KStartupSyncResponse> {
  const today = kstDate(now);
  const prev = store.meta();
  const had = store.resources();
  const counts = (list: Resource[]) => ({ total: list.length, open: list.filter((r) => isOpen(r, today)).length });
  const fail = (error: string): KStartupSyncResponse => {
    const c = counts(had);
    store.saveMeta({
      fetchedAt: prev?.fetchedAt ?? null, attemptedAt: now.toISOString(), lastError: error,
      total: c.total, open: c.open, closed: c.total - c.open, added: 0, updated: 0, closedNow: 0,
    });
    return { ok: false, fetchedAt: now.toISOString(), added: 0, updated: 0, closed: 0, total: c.total, error };
  };

  const got = await fetchAnnouncements({ key: env?.KSTARTUP_SERVICE_KEY, fetch });
  if (!got.ok) return fail(got.error);
  const mapped = got.items.map((it) => kstartupToResource(it, now)).filter((r): r is Resource => r !== null);
  // 조회 결과가 비었는데 모집 중으로 알던 공고가 있으면 응답 이상으로 보고, 기존 자료를 그대로 두고 오류로 기록한다.
  if (mapped.length === 0 && had.some((r) => isOpen(r, today))) return fail('K-Startup 응답에 공고가 없어요 (기존 자료 유지)');

  const byId = new Map(had.map((r) => [r.id, r]));
  let added = 0, updated = 0, closed = 0;
  const writes: Resource[] = [];
  const seen = new Set<string>();
  for (const r of mapped) {
    seen.add(r.id);
    const old = byId.get(r.id);
    if (!old) added++;
    else if (!same(old, r)) updated++;
    if (r.recruitStatus === 'closed' && (!old || old.recruitStatus !== 'closed')) closed++;
    writes.push(r);
    byId.set(r.id, r);
  }
  // 모든 조회를 끝까지 받았을 때만 '이번에 안 보임 = 종료'로 본다. 일부만 받았으면 건드리지 않는다.
  if (got.complete) {
    for (const old of had) {
      if (seen.has(old.id) || old.recruitStatus === 'closed') continue;
      const r: Resource = { ...old, recruitStatus: 'closed', checkedAt: today };
      writes.push(r);
      byId.set(r.id, r);
      closed++;
    }
  }
  store.save(writes);
  const all = [...byId.values()];
  const c = counts(all);
  const meta: KStartupMeta = {
    fetchedAt: now.toISOString(), attemptedAt: now.toISOString(), lastError: null,
    total: c.total, open: c.open, closed: c.total - c.open, added, updated, closedNow: closed,
  };
  store.saveMeta(meta);
  return { ok: true, fetchedAt: meta.fetchedAt!, added, updated, closed, total: c.total, error: null };
}

/** 수집 한 번. 이미 도는 중이면 그 결과를 같이 받는다. */
export function runSync(deps: SyncDeps): Promise<KStartupSyncResponse> {
  if (deps.store.inflight) return deps.store.inflight as Promise<KStartupSyncResponse>;
  const p = doSync(deps).finally(() => { deps.store.inflight = null; });
  deps.store.inflight = p;
  return p;
}
