import { DUE_SOON_DAYS, VERDICT_LABEL, dDayLabel } from '@gil/shared';
import type { Verdict } from '@gil/shared';

export function DdayBadge({ dDay }: { dDay: number | null }) {
  const cls = dDay === null ? 'dday-always' : dDay < 0 ? 'dday-closed' : dDay <= DUE_SOON_DAYS ? 'dday-soon' : '';
  return <span className={`badge ${cls}`}>{dDayLabel(dDay)}</span>;
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return <span className={`badge ${verdict}`}>{VERDICT_LABEL[verdict]}</span>;
}
