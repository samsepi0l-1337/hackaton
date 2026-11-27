import { Link } from 'react-router-dom';
import { CONDITION_NOTE } from '@gil/shared';
import { LOCAL_AI_NOTE } from '../lib/localAi';
import { HeartButton } from './HeartButton';
import type { ConditionStatus, RecruitStatus, Resource, ResourceCard } from '@gil/shared';
import { safeHref } from '../lib/format';

// 화면에 쓰는 짧은 이름. 공유 라벨(API·Rust 와 맞물림)은 바꾸지 않는다.
const RECRUIT_TEXT: Record<RecruitStatus, string> = { open: '모집 중', closed: '마감', always: '상시', unknown: '마감일 미정' };
const COND_TEXT: Record<ConditionStatus, string> = { match: '조건 맞음', check: '확인 필요', mismatch: '조건 다름' };

export function RecruitBadge({ status }: { status: RecruitStatus }) {
  return <span className={`badge recruit-${status}`}><span className="status-dot" aria-hidden="true" />{RECRUIT_TEXT[status]}</span>;
}
export function ConditionBadge({ status }: { status: ConditionStatus }) {
  return <span className={`badge cond-${status}`}><span className="status-dot" aria-hidden="true" />{COND_TEXT[status]}</span>;
}

export function SourceLine({ r, onLink, label = '공식 안내 확인' }: { r: Resource; onLink?: () => void; label?: string }) {
  return (
    <p className="muted">
      출처: {safeHref(r.url)
        ? <a href={safeHref(r.url)} target="_blank" rel="noreferrer" onClick={onLink}>{r.agency} 공식 안내 (새 창)</a>
        : '공식 링크 확인 필요'} · 확인일 {r.checkedAt ?? '확인 필요'}
      {r.test && ' · 팀 검수 전 테스트 자료'}
      <span className="sr-only"> {label}</span>
    </p>
  );
}

export function ResourceFacts({ r }: { r: Resource }) {
  const rows: [string, string | null][] = [
    ['이용 대상', r.target ?? '확인 필요'], ['얻을 도움', r.content], ['이용 방법', r.procedure ?? '공식 안내에서 확인 필요'],
    ['사전 준비', r.prep], ['기간·비용', r.costPeriod], ['소속 제한', r.affiliationLimit],
  ];
  return (
    <dl className="facts">
      {rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

/** 결과 화면 카드: 이유·조건 상태와 안내 문구를 함께 보인다. */
export function ResourceResultCard({ card, onLink, localReason }: { card: ResourceCard; onLink: () => void; localReason?: string }) {
  const r = card.resource;
  return (
    <article className="card stack">
      <div className="row"><span className="tag">{r.type}</span><RecruitBadge status={r.recruitStatus} /><HeartButton id={r.id} title={r.title} liked={!!card.liked} /></div>
      <h3 style={{ margin: 0 }}><Link to={`/programs/${encodeURIComponent(r.id)}`}>{r.title}</Link></h3>
      <p className="muted">{r.agency}</p>
      <p><strong>관련 이유</strong> {localReason ?? card.reason}{(card.reasonProvenance === 'ai' || localReason) && <> <span className="badge">AI 제안·미검증</span></>}{localReason && <span className="muted"> {LOCAL_AI_NOTE}</span>}</p>
      <ResourceFacts r={r} />
      <div className="stack">
        <div className="row"><ConditionBadge status={card.condition.status} /></div>
        {card.condition.checks.length > 0 && (
          <ul className="plain-list">
            {card.condition.checks.map((c) => <li key={c.key}><ConditionBadge status={c.status} /> <strong>{c.label}</strong> <span className="muted">{c.detail}</span></li>)}
          </ul>
        )}
        <p className="muted">{CONDITION_NOTE}</p>
      </div>
      <SourceLine r={r} onLink={onLink} />
      {safeHref(r.url)
        ? <a className="btn primary" href={safeHref(r.url)} target="_blank" rel="noreferrer" onClick={onLink}>공식 안내 확인</a>
        : <Link className="btn" to={`/programs/${encodeURIComponent(r.id)}`}>자세히 보기</Link>}
    </article>
  );
}
