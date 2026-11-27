import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { APPLICATION_STATUS_LABEL, describeType, isValidTypeCode } from '@gil/shared';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../components/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CardSkeletons, EmptyState, ErrorState } from '../components/States';
import { errMessage } from '../lib/format';

export function Me() {
  const { user, logout, setUser } = useAuth();
  const nav = useNavigate();
  const apps = useAsync(() => api.applications(), []);
  const session = useAsync(() => api.session(), []);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function remove() {
    setBusy(true);
    try { await api.deleteAccount(); setUser(null); nav('/', { replace: true }); } catch (e) { setErr(errMessage(e)); setBusy(false); }
  }
  const s = session.data;
  const typeCode = s?.profile.typeCode;
  const type = isValidTypeCode(typeCode) ? describeType(typeCode) : null;

  return (
    <div className="container stack">
      <h1>내 정보</h1>
      <p className="muted">{user?.email}</p>

      <section>
        <h2>제출 내역</h2>
        {apps.loading && <CardSkeletons count={2} />}
        {apps.error && <ErrorState error={apps.error} onRetry={apps.reload} />}
        {apps.data && apps.data.items.length === 0 && <EmptyState message="아직 제출한 지원서가 없어요." action={<Link className="btn primary" to="/programs">공고 보러 가기</Link>} />}
        <div className="stack">
          {apps.data?.items.map((a) => (
            <div key={a.id} className="card row between">
              <div><strong>{a.program.title}</strong><div className="muted">{a.program.agency}{a.receiptNo ? ` · 접수번호 ${a.receiptNo}` : ''}</div></div>
              <div className="row"><span className="badge">{APPLICATION_STATUS_LABEL[a.status]}</span><Link className="btn small" to={`/apply/${encodeURIComponent(a.programId)}`}>보기</Link></div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>지난 상담</h2>
        {session.loading && <CardSkeletons count={1} />}
        {session.error && <ErrorState error={session.error} onRetry={session.reload} />}
        {s && (s.updatedAt
          ? <div className="card row between"><div><strong>{s.profile.idea ?? '사업 아이디어'}</strong><div className="muted">마지막 수정 {s.updatedAt.slice(0, 10)}</div></div><Link className="btn small primary" to="/mentor">이어서 하기</Link></div>
          : <EmptyState message="아직 상담 기록이 없어요." action={<Link className="btn primary" to="/mentor">상담 시작</Link>} />)}
      </section>

      <section>
        <h2>창업 유형</h2>
        {type
          ? <div className="card"><strong>{type.code}</strong> {type.name}<p className="muted" style={{ margin: 0 }}>{type.oneLine}</p></div>
          : <EmptyState message="테스트 결과가 없어요." action={<Link className="btn primary" to="/test">테스트 하기</Link>} />}
      </section>

      <section className="row">
        <button className="btn" onClick={async () => { await logout(); nav('/'); }}>로그아웃</button>
        <button className="btn danger" onClick={() => setConfirm(true)}>계정 삭제</button>
      </section>
      {user?.isTeam && <Link to="/admin">팀 통계 보기</Link>}
      {err && <p className="error-text">{err}</p>}
      {confirm && (
        <ConfirmDialog title="계정을 삭제할까요?" confirmLabel="삭제" danger busy={busy} onConfirm={remove} onCancel={() => setConfirm(false)}>
          <p>계정과 상담, 지원서 등 모든 데이터가 지워지고 되돌릴 수 없어요.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
