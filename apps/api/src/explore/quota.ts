// 상담 횟수 제한 (1인당 7일 3회). 상담 1회 = 첫 질문을 받는 순간.
// 계정 id 로만 센다 (2026-11-27: 행사장에서는 여러 사람이 같은 IP 를 쓰므로 쿠키·IP 키는 쓰지 않는다).
import { CONSULT_LIMIT, type ConsultQuota } from '@gil/shared';
import type { Store } from '../store';

const DAY_MS = 86_400_000;

export interface QuotaConfig { count: number; windowDays: number }
export const quotaConfig = (o?: { count?: number; windowDays?: number }): QuotaConfig => ({ count: o?.count ?? CONSULT_LIMIT.count, windowDays: o?.windowDays ?? CONSULT_LIMIT.windowDays });

/** 이 사람을 가리키는 키: 계정 id 하나. */
export const quotaKeys = (actor: { id: string } | null): string[] => (actor ? [`u:${actor.id}`] : []);

const live = (times: string[], now: Date, cfg: QuotaConfig) => times.filter((t) => now.getTime() - Date.parse(t) < cfg.windowDays * DAY_MS).sort();

/** 키들 중 가장 많이 쓴 쪽 기준의 현재 상태. */
export function quotaStatus(store: Store, keys: string[], now: Date, cfg: QuotaConfig): ConsultQuota & { blocked: boolean } {
  const per = keys.map((k) => live(store.quota(k), now, cfg));
  const used = Math.max(0, ...per.map((t) => t.length));
  const blocked = used >= cfg.count;
  const ms = cfg.windowDays * DAY_MS;
  // 막혔으면 막은 키 모두가 풀리는 시각, 아니면 가장 오래된 상담이 빠지는 시각.
  const reset = blocked
    ? Math.max(...per.filter((t) => t.length >= cfg.count).map((t) => Date.parse(t[t.length - cfg.count]!) + ms))
    : used > 0 ? Math.min(...per.filter((t) => t.length === used).map((t) => Date.parse(t[0]!) + ms)) : null;
  return { used, limit: cfg.count, remaining: Math.max(0, cfg.count - used), resetAt: reset === null ? null : new Date(reset).toISOString(), blocked };
}

export function recordConsult(store: Store, keys: string[], now: Date, cfg: QuotaConfig): void {
  for (const k of keys) store.setQuota(k, [...live(store.quota(k), now, cfg), now.toISOString()]);
}

export const exemptQuota = (cfg: QuotaConfig): ConsultQuota => ({ used: 0, limit: cfg.count, remaining: cfg.count, resetAt: null });

const MD = (iso: string) => {
  const k = new Date(Date.parse(iso) + 9 * 3_600_000); // KST
  return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`;
};
export const limitMessage = (q: ConsultQuota, cfg: QuotaConfig) =>
  `이번 주 상담 ${cfg.count}회를 모두 사용했어요. ${q.resetAt ? MD(q.resetAt) : '며칠 뒤'}부터 다시 할 수 있어요.`;
