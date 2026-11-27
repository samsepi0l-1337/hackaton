import type { IsoDate } from './types';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 주어진 시각의 한국 날짜 'YYYY-MM-DD'. */
export function kstDate(now: Date): IsoDate {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function toUtcDays(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!) / 86_400_000;
}

/** b - a (일). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round(toUtcDays(b) - toUtcDays(a));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date((toUtcDays(date) + days) * 86_400_000).toISOString().slice(0, 10);
}

/** date 에 years 년을 더한다. 2월 29일은 2월 28일로 맞춘다. */
export function addYears(date: IsoDate, years: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y! + years, m!, 0)).getUTCDate();
  return `${y! + years}-${String(m).padStart(2, '0')}-${String(Math.min(d!, last)).padStart(2, '0')}`;
}

/** 마감까지 남은 일수. 0 = 오늘 마감, 음수 = 지남, null = 상시. */
export function dDay(endDate: IsoDate | null, now: Date): number | null {
  return endDate === null ? null : daysBetween(kstDate(now), endDate);
}

export function dDayLabel(d: number | null): string {
  if (d === null) return '상시';
  if (d < 0) return '마감';
  if (d === 0) return 'D-DAY';
  return `D-${d}`;
}

export function isClosed(endDate: IsoDate | null, now: Date): boolean {
  const d = dDay(endDate, now);
  return d !== null && d < 0;
}

export function isValidIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
