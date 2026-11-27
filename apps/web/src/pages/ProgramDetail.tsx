import { Link, useParams } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { DdayBadge, VerdictBadge } from '../components/Badges';
import { BottomBar } from '../components/BottomBar';
import { CardSkeletons, EmptyState, ErrorState } from '../components/States';
import { period } from '../lib/format';

const MARK = { pass: '✓', fail: '✗', unknown: '?' } as const;

export function ProgramDetail() {
  const { id = '' } = useParams();
  const { data, error, loading, reload } = useAsync(() => api.program(id), [id]);
  if (loading) return <div className="container"><CardSkeletons count={2} /></div>;
  if (error instanceof ApiClientError && error.code === 'not_found') {
    return <div className="container"><EmptyState message="공고를 찾을 수 없어요." action={<Link className="btn primary" to="/programs">공고 모음으로</Link>} /></div>;
  }
  if (error || !data) return <div className="container"><ErrorState error={error} onRetry={reload} /></div>;
  const { program: p, dDay, eligibility } = data;
  const closed = dDay !== null && dDay < 0;
  return (
    <div className="container stack">
      <div className="row"><DdayBadge dDay={dDay} /><span className="tag">{p.category}</span>{p.region && <span className="tag">{p.region}</span>}</div>
      <h1>{p.title}</h1>
      <p className="muted">{p.agency}</p>

      {eligibility && (
        <section className="card stack">
          <div className="row"><h2 style={{ margin: 0 }}>내 판정</h2><VerdictBadge verdict={eligibility.verdict} /></div>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
            {eligibility.checks.map((c) => (
              <li key={c.key} className="row"><span className={`badge ${c.status}`}>{MARK[c.status]}</span><strong>{c.label}</strong><span className="muted">{c.detail}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>핵심 정보</h2>
        <dl className="stack" style={{ margin: 0 }}>
          {[
            ['접수 기간', period(p.startDate, p.endDate)], ['지역', p.region ?? '-'], ['지원 분야', p.category],
            ['신청 대상', p.target ?? '-'], ['대상 연령', p.targetAge ?? '-'], ['창업 연차', p.bizYears ?? '-'],
          ].map(([k, v]) => <div key={k}><dt className="muted">{k}</dt><dd style={{ margin: 0 }}>{v}</dd></div>)}
        </dl>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>지원 내용</h2>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{p.content}</p>
      </section>

      <div className="row">
        <a className="btn" href={p.url} target="_blank" rel="noreferrer">원문 보기</a>
        <Link className="btn" to="/mentor">이 사업 상담받기</Link>
      </div>
      {closed && <p className="muted">마감된 공고예요.</p>}
      <BottomBar>
        <a className="btn" href={p.url} target="_blank" rel="noreferrer">원문 보기</a>
        <Link className={`btn primary${closed ? ' disabled' : ''}`} aria-disabled={closed} to={closed ? '#' : `/apply/${encodeURIComponent(p.id)}`}>이 사업으로 지원서 만들기</Link>
      </BottomBar>
    </div>
  );
}
