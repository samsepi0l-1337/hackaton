import { Link } from 'react-router-dom';
import { CONDITION_NOTE, CONDITION_STATUS_LABEL, RECRUIT_STATUS_LABEL } from '@gil/shared';
import type { ConditionStatus, RecruitStatus, Resource, ResourceCard } from '@gil/shared';

const RECRUIT_MARK: Record<RecruitStatus, string> = { open: '●', closed: '■', always: '◆', unknown: '?' };
const COND_MARK: Record<ConditionStatus, string> = { match: '✓', check: '?', mismatch: '✗' };

/** 색만으로 구분하지 않도록 기호와 글자를 함께 쓴다. */
export function RecruitBadge({ status }: { status: RecruitStatus }) {
  return <span className={`badge recruit-${status}`}><span aria-hidden="true">{RECRUIT_MARK[status]} </span>{RECRUIT_STATUS_LABEL[status]}</span>;
}
export function ConditionBadge({ status }: { status: ConditionStatus }) {
  return <span className={`badge cond-${status}`}><span aria-hidden="true">{COND_MARK[status]} </span>{CONDITION_STATUS_LABEL[status]}</span>;
}

export function SourceLine({ r, onLink, label = '공식 안내 확인' }: { r: Resource; onLink?: () => void; label?: string }) {
  return (
    <p className="muted">
      출처: {r.url
        ? <a href={r.url} target="_blank" rel="noreferrer" onClick={onLink}>{r.agency} 공식 안내 (새 창)</a>
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
export function ResourceResultCard({ card, onLink }: { card: ResourceCard; onLink: () => void }) {
  const r = card.resource;
  return (
    <article className="card stack">
      <div className="row"><span className="tag">{r.type}</span><RecruitBadge status={r.recruitStatus} /></div>
      <h3 style={{ margin: 0 }}><Link to={`/programs/${encodeURIComponent(r.id)}`}>{r.title}</Link></h3>
      <p className="muted">{r.agency}</p>
      <p><strong>관련 이유</strong> {card.reason}{card.reasonProvenance === 'ai' && <> <span className="badge">AI 제안·미검증</span></>}</p>
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
      {r.url
        ? <a className="btn primary" href={r.url} target="_blank" rel="noreferrer" onClick={onLink}>공식 안내 확인</a>
        : <Link className="btn" to={`/programs/${encodeURIComponent(r.id)}`}>자세히 보기</Link>}
    </article>
  );
}
