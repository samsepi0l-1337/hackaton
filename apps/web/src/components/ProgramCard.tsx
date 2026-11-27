import { Link } from 'react-router-dom';
import type { ProgramCard as Card } from '@gil/shared';
import { DdayBadge, VerdictBadge } from './Badges';
import type { ReactNode } from 'react';

export function ProgramCard({ card, children }: { card: Card; children?: ReactNode }) {
  const p = card.program;
  return (
    <article className="card program-card">
      <div className="row">
        <DdayBadge dDay={card.dDay} />
        {card.eligibility && <VerdictBadge verdict={card.eligibility.verdict} />}
        <span className="tag">{p.category}</span>
        {p.region && <span className="tag">{p.region}</span>}
      </div>
      <h3><Link className="title" to={`/programs/${encodeURIComponent(p.id)}`}>{p.title}</Link></h3>
      <p className="muted">{p.agency}</p>
      {children}
      <div className="row">
        <Link className="btn small" to={`/programs/${encodeURIComponent(p.id)}`}>자세히</Link>
        <a className="btn small ghost" href={p.url} target="_blank" rel="noreferrer">원문 보기</a>
      </div>
    </article>
  );
}
