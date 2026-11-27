import { Link, useParams } from 'react-router-dom';
import { CONDITION_NOTE } from '@gil/shared';
import { api, ApiClientError } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { ConditionBadge, RecruitBadge, ResourceFacts, SourceLine } from '../components/ResourceView';
import { HeartButton } from '../components/HeartButton';
import { useAuth } from '../components/AuthContext';
import { CardSkeletons, EmptyState, ErrorState } from '../components/States';

export function ProgramDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api.resource(id), [id, user?.id]);
  if (loading) return <div className="container"><CardSkeletons count={2} /></div>;
  if (error instanceof ApiClientError && error.code === 'not_found') {
    return <div className="container"><EmptyState message="안내를 찾을 수 없어요." action={<Link className="btn primary" to="/programs">목록으로</Link>} /></div>;
  }
  if (error || !data) return <div className="container"><ErrorState error={error} onRetry={reload} /></div>;
  const r = data.resource;
  return (
    <div className="container stack">
      <div className="row"><span className="tag">{r.type}</span><RecruitBadge status={r.recruitStatus} />{r.regions.map((g) => <span key={g} className="tag">{g}</span>)}<HeartButton id={r.id} title={r.title} liked={!!data.liked} /></div>
      <h1>{r.title}</h1>
      <p className="muted">{r.agency}{r.startDate && ` · 등록 ${r.startDate}`}{data.views !== undefined && ` · 조회 ${data.views}`}</p>
      {r.recruitStatus === 'closed' && <p className="banner" role="status">모집이 종료된 안내예요.{r.endDate && ` (종료 ${r.endDate})`}</p>}

      <section className="card stack">
        <h2 style={{ margin: 0 }}>얻을 수 있는 도움</h2>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{r.content}</p>
      </section>
      <section className="card stack">
        <h2 style={{ margin: 0 }}>이용 방법</h2>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{r.procedure ?? '공식 안내에서 이용 방법을 확인해 주세요.'}</p>
        {r.prep && <p><strong>사전 준비</strong> {r.prep}</p>}
      </section>
      <section className="card stack">
        <h2 style={{ margin: 0 }}>대상과 조건</h2>
        <ResourceFacts r={{ ...r, content: '', procedure: null, prep: null }} />
        <div className="row"><ConditionBadge status={data.condition.status} /></div>
        <ul className="plain-list">
          {data.condition.checks.map((c) => <li key={c.key}><ConditionBadge status={c.status} /> <strong>{c.label}</strong> <span className="muted">{c.detail}</span></li>)}
        </ul>
        {!user
          ? <p className="muted"><Link to={`/login?next=${encodeURIComponent(`/programs/${r.id}`)}`}>로그인</Link>하면 내 정보(나이·거주지·사업자 여부)와 비교해 보여 드려요.</p>
          : <p className="muted">내 정보의 나이·거주지·사업자 여부와 비교했어요. <Link to="/me">내 정보 고치기</Link></p>}
        <p className="muted">{CONDITION_NOTE} {r.conditions === null && '원문 조건은 아직 확인하지 못했어요. 공식 안내에서 확인해 주세요.'}</p>
      </section>
      <section className="card stack">
        <h2 style={{ margin: 0 }}>출처와 상태</h2>
        <div className="row"><RecruitBadge status={r.recruitStatus} /></div>
        <SourceLine r={r} />
        {r.sourceExcerpt && <blockquote className="quote">{r.sourceExcerpt}</blockquote>}
        {r.url && <a className="btn primary" href={r.url} target="_blank" rel="noreferrer">공식 안내 확인</a>}
      </section>
      <Link className="btn" to="/mentor">내 구상에 맞는 준비 안내 받기</Link>
    </div>
  );
}
