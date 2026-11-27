import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errMessage, safeHref } from '../lib/format';
import { CONDITION_NOTE } from '@gil/shared';
import { api, ApiClientError } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { ConditionBadge, RecruitBadge, ResourceFacts, SourceLine } from '../components/ResourceView';
import { HeartButton } from '../components/HeartButton';
import { useAuth } from '../components/AuthContext';
import { resetDate } from '../mentor/Quota';
import { CardSkeletons, EmptyState, ErrorState } from '../components/States';
import '../styles/pages-programs.css';

function ApplyCard({ resourceId }: { resourceId: string }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const mine = useAsync(() => (user ? api.applications() : Promise.resolve(null)), [user?.id]);
  const quota = useAsync(() => (user ? api.applicationQuota() : Promise.resolve(null)), [user?.id]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const existing = mine.data?.items.find((a) => a.programId === resourceId);
  const q = quota.data && quota.data.limit !== null ? quota.data : null;
  const blocked = !!q?.blocked;

  async function create() {
    setBusy(true); setErr('');
    try {
      const a = await api.createApplication(resourceId);
      nav(`/applications/${a.id}`);
    } catch (x) {
      if (x instanceof ApiClientError && x.code === 'application_limit') quota.reload();
      setErr(x instanceof ApiClientError && x.code === 'closed' ? '모집이 끝나 지원서를 만들 수 없어요.' : errMessage(x));
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>지원서 작성</h2>
      <p className="muted" style={{ margin: 0 }}>공고 양식에 맞춰 AI가 초안을 써 줘요. 연습용 모의 제출이라, 실제 신청은 공식 사이트에서 해야 해요.</p>
      {!user
        ? <div><Link className="btn" to={`/login?next=${encodeURIComponent(`/programs/${resourceId}`)}`}>로그인하고 지원서 쓰기</Link></div>
        : mine.loading ? <p className="muted">확인하는 중이에요.</p>
        : existing
          ? <div><Link className="btn" to={`/applications/${existing.id}`}>내 지원서 이어 쓰기</Link></div>
          : <div><button className="btn" type="button" disabled={busy || blocked} onClick={create}>{busy ? '초안을 쓰는 중...' : '지원서 작성'}</button></div>}
      {user && q && (
        <p className="muted" style={{ margin: 0 }} role="status">
          이번 주 남은 작성 횟수 {q.remaining ?? 0}/{q.limit}
          {q.blocked && (resetDate(q.resetAt) ? ` · ${resetDate(q.resetAt)} 이후에 다시 쓸 수 있어요` : ' · 다시 쓸 수 있는 날짜는 확인 중이에요')}
        </p>
      )}
      {busy && <p className="muted" role="status">공고 양식을 읽고 초안을 쓰는 중이에요. 30초쯤 걸릴 수 있어요.</p>}
      {err && <p className="error-text" role="alert">{err}</p>}
    </section>
  );
}

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
    <div className="container stack program-detail">
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
        {safeHref(r.url) && <a className="btn primary" href={safeHref(r.url)} target="_blank" rel="noreferrer">공식 안내 확인</a>}
      </section>
      {r.recruitStatus !== 'closed' && <ApplyCard resourceId={r.id} />}
      <Link className="btn" to={`/mentor?focus=${encodeURIComponent(r.id)}`}>내 구상에 맞는 준비 안내 받기</Link>
    </div>
  );
}
