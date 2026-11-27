import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../components/AuthContext';
import { ProgramCard } from '../components/ProgramCard';
import { CardSkeletons, ErrorState } from '../components/States';

function RecentTop3() {
  const { data } = useAsync(async () => {
    const s = await api.session();
    return s.step === 'result' ? api.result() : null;
  }, []);
  if (!data || data.top.length === 0) return null;
  return (
    <section>
      <h2>내 최근 추천 Top{data.top.length}</h2>
      <div className="stack">
        {data.top.map((r) => <ProgramCard key={r.program.id} card={r}><p className="muted">{r.reason}</p></ProgramCard>)}
      </div>
    </section>
  );
}

export function Home() {
  const { user } = useAuth();
  const home = useAsync(() => api.home(), []);
  const h = home.data;
  return (
    <div className="container stack">
      <section className="hero stack">
        <h1>아이디어 한 줄이면, 지금 신청할 수 있는 부산 창업 지원사업을 찾아드려요</h1>
        <div className="row">
          <Link className="btn primary" to="/mentor">{user ? '상담 이어서 하기' : '무료 상담 시작'}</Link>
          <Link className="btn" to="/test">내 창업 유형 알아보기</Link>
        </div>
      </section>

      {user && <RecentTop3 />}

      <section className="grid cols-2">
        <div className="card stat"><div className="num">{h ? h.openCount : '-'}</div>지금 모집 중인 공고</div>
        <div className="card stat"><div className="num">{h ? h.closingThisWeek : '-'}</div>이번 주 마감</div>
      </section>

      <section>
        <div className="row between"><h2 style={{ margin: 0 }}>마감 임박 공고</h2><Link to="/programs">전체 공고 보기</Link></div>
        <div className="stack" style={{ marginTop: 12 }}>
          {home.loading && <CardSkeletons />}
          {home.error && <ErrorState error={home.error} onRetry={home.reload} />}
          {h?.closingSoon.map((c) => <ProgramCard key={c.program.id} card={c} />)}
        </div>
      </section>

      <section>
        <h2>이용 방법</h2>
        <div className="grid cols-3 steps-3">
          <div className="card"><h3>사업 정보 입력</h3><p className="muted">하고 싶은 사업과 타겟 고객을 알려주세요.</p></div>
          <div className="card"><h3>AI 멘토 상담</h3><p className="muted">부족한 부분을 멘토가 3가지만 되물어요.</p></div>
          <div className="card"><h3>Top3 추천·지원서</h3><p className="muted">지원사업 Top3를 보고 지원서까지 만들어요.</p></div>
        </div>
      </section>

      <section className="card row between">
        <div><h3>1분 테스트로 내 창업 스타일 알아보기</h3><p className="muted" style={{ margin: 0 }}>12문항, 로그인 없이 가능해요.</p></div>
        <Link className="btn primary" to="/test">테스트 하기</Link>
      </section>

      <p className="muted">정보는 추천과 사용자가 승인한 지원서 제출에만 사용하고, 행사 후 삭제해요.</p>
    </div>
  );
}
