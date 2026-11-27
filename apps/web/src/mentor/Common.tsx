import { PROVENANCE_LABEL } from '@gil/shared';
import type { EvidenceLevel, Provenance, SummaryItem, SummaryV2 } from '@gil/shared';
import type { ProblemInfo } from './storage';
import { safeHref } from '../lib/format';

export const STEP_LABELS = ['관심·상황', '구상 정리', '준비 안내'];

/** onGo가 있으면 지나온 단계만 눌러서 돌아갈 수 있다. */
export function Progress({ current, onGo }: { current: 0 | 1 | 2; onGo?: (step: number) => void }) {
  return (
    <ol className="progress-steps" aria-label="진행 단계">
      {STEP_LABELS.map((l, i) => (
        <li key={l} className={i === current ? 'current' : i < current ? 'done' : ''} aria-current={i === current ? 'step' : undefined}>
          {onGo && i < current
            ? <button type="button" className="step-link" onClick={() => onGo(i)}>{i + 1}. {l}</button>
            : <>{i + 1}. {l}</>}
        </li>
      ))}
    </ol>
  );
}

export function ProvBadge({ p }: { p: Provenance }) {
  return <span className={`badge prov-${p}`}>{PROVENANCE_LABEL[p]}</span>;
}

export function EvidenceBadge({ level }: { level: EvidenceLevel | string }) {
  return <span className="badge">근거 수준: {level}</span>;
}

export function ProblemLine({ p }: { p: ProblemInfo }) {
  return (
    <div className="stack">
      <strong>{p.title}</strong>
      <div className="row"><EvidenceBadge level={p.evidenceLevel} /><span className="muted">{p.industry} · {p.region}</span></div>
      <div className="muted">출처: {safeHref(p.source) ? <a href={safeHref(p.source)} target="_blank" rel="noreferrer">원문 (새 창)</a> : '확인 필요'} · 자료 시점 {p.sourceDate ?? '확인 필요'}</div>
    </div>
  );
}

export const item = (text: string): SummaryItem => ({ text, provenance: text.trim() ? 'user' : 'unknown' });

export type ItemKey = 'interest' | 'target' | 'value' | 'unknowns' | 'reason' | 'direction' | 'hypotheses';
export const ITEM_LABEL: Record<ItemKey, string> = {
  interest: '관심과 구상', target: '이용할 사람', value: '제공할 가치', unknowns: '확인할 사항',
  reason: '관심 이유', direction: '탐색 방향', hypotheses: '확인할 고객·시장 가설',
};

export function getItem(s: SummaryV2, k: ItemKey): SummaryItem {
  return k === 'interest' || k === 'target' || k === 'value' || k === 'unknowns' ? s[k] : s.exploration[k];
}

/** 한 항목을 사용자가 고친 값(직접 입력, 비면 미정)으로 바꾼다. */
export function withItem(s: SummaryV2, k: ItemKey, text: string): SummaryV2 {
  const it = item(text.trim());
  if (k === 'interest' || k === 'target' || k === 'value' || k === 'unknowns') return { ...s, [k]: it };
  if (k === 'direction') {
    return { ...s, exploration: { ...s.exploration, direction: { ...it, status: it.text ? 'user' : 'hold' } } };
  }
  return { ...s, exploration: { ...s.exploration, [k]: it } };
}
