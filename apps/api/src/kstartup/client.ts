// K-Startup 사업공고 조회 (공공데이터포털 B552735/kisedKstartupService02/getAnnouncementInformation02).
// 부산 모집 중 + 전국 모집 중, 두 번 조회해 pbanc_sn 으로 합친다. 테스트는 fetch 를 바꿔 끼운다.
import type { KStartupItem } from '@gil/shared';

export const KSTARTUP_URL = 'https://apis.data.go.kr/B552735/kisedKstartupService02/getAnnouncementInformation02';
export const NO_KEY_ERROR = 'KSTARTUP_SERVICE_KEY 없음';
export const PER_PAGE = 100;
export const MAX_PAGES = 10;
export const TIMEOUT_MS = 15_000;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type FetchResult = { ok: true; items: KStartupItem[]; complete: boolean } | { ok: false; error: string };

/** 포털이 주는 인코딩된 키(%2B 등)를 붙여 넣어도 한 번만 인코딩되게 먼저 풀어 둔다. */
export function normalizeKey(key: string): string {
  const k = key.trim();
  if (!/%[0-9A-Fa-f]{2}/.test(k)) return k;
  try { return decodeURIComponent(k); } catch { return k; }
}

export function buildUrl(key: string, page: number, region: string): string {
  const q = [
    `serviceKey=${encodeURIComponent(normalizeKey(key))}`,
    `page=${page}`,
    `perPage=${PER_PAGE}`,
    'returnType=json',
    `cond[supt_regin::LIKE]=${encodeURIComponent(region)}`,
    'cond[rcrt_prgs_yn::EQ]=Y',
  ];
  return `${KSTARTUP_URL}?${q.join('&')}`;
}

interface Page { items: KStartupItem[]; total: number }

/** 응답은 data 가 배열이거나 { item: [...] } 두 모양이 있다. 항목 하나만 올 때도 받는다. */
export function parsePage(json: unknown): Page | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  const data = o.data;
  let raw: unknown;
  if (Array.isArray(data)) raw = data;
  else if (data && typeof data === 'object') raw = (data as Record<string, unknown>).item;
  else if (data === undefined || data === null) raw = o.totalCount !== undefined ? [] : undefined;
  if (raw === undefined) return null;
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  const items = list.filter((x): x is KStartupItem => !!x && typeof x === 'object');
  const total = Number(o.totalCount);
  return { items, total: Number.isFinite(total) ? total : items.length };
}

async function getJson(f: FetchLike, url: string): Promise<{ ok: true; json: unknown } | { ok: false; error: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await f(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (res.status === 401 || res.status === 403) return { ok: false, error: `K-Startup 인증 실패 (HTTP ${res.status}): 키를 확인해 주세요` };
    if (!res.ok) return { ok: false, error: `K-Startup 응답 오류 (HTTP ${res.status})` };
    const body = await res.text();
    try { return { ok: true, json: JSON.parse(body) }; } catch { return { ok: false, error: 'K-Startup 응답이 JSON 이 아니에요 (키·요청 확인 필요)' }; }
  } catch (e) {
    return { ok: false, error: ctl.signal.aborted ? `K-Startup 응답 시간 초과 (${TIMEOUT_MS / 1000}초)` : `K-Startup 호출 실패: ${e instanceof Error ? e.message : 'unknown'}` };
  } finally {
    clearTimeout(timer);
  }
}

/** 한 지역 조건으로 totalCount 까지(최대 10쪽) 받는다. complete=false 면 일부만 받은 것이다. */
async function fetchRegion(f: FetchLike, key: string, region: string): Promise<FetchResult> {
  const items: KStartupItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await getJson(f, buildUrl(key, page, region));
    if (!r.ok) return r;
    const p = parsePage(r.json);
    if (!p) return { ok: false, error: 'K-Startup 응답 형식을 읽지 못했어요' };
    items.push(...p.items);
    // totalCount 를 다 받았거나 빈 쪽이 오면 끝. 서버가 perPage 를 줄여 줘도 totalCount 까지 계속 받는다.
    if (items.length >= p.total || p.items.length === 0) return { ok: true, items, complete: true };
  }
  return { ok: true, items, complete: false };
}

export async function fetchAnnouncements(opts: { key?: string; fetch?: FetchLike }): Promise<FetchResult> {
  const key = opts.key?.trim();
  if (!key) return { ok: false, error: NO_KEY_ERROR };
  const f: FetchLike = opts.fetch ?? ((u, i) => fetch(u, i));
  const byId = new Map<string, KStartupItem>();
  let complete = true;
  for (const region of ['부산', '전국']) {
    const r = await fetchRegion(f, key, region);
    if (!r.ok) return r;
    complete &&= r.complete;
    for (const it of r.items) {
      const sn = String(it.pbanc_sn ?? '').trim();
      if (sn && !byId.has(sn)) byId.set(sn, it);
    }
  }
  return { ok: true, items: [...byId.values()], complete };
}
