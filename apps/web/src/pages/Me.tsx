import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../components/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { errMessage } from '../lib/format';

export function Me() {
  const { user, logout, setUser } = useAuth();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function remove() {
    setBusy(true);
    try { await api.deleteAccount(); setUser(null); nav('/', { replace: true }); } catch (e) { setErr(errMessage(e)); setBusy(false); }
  }

  return (
    <div className="container stack">
      <h1>내 정보</h1>
      <p className="muted">{user?.email}</p>
      <p>계정은 선택이에요. 로그인하지 않아도 창업 준비 안내를 끝까지 볼 수 있어요.</p>
      <section className="row">
        <Link className="btn primary" to="/mentor">창업 준비 이어서 하기</Link>
        <button className="btn" onClick={async () => { await logout(); nav('/'); }}>로그아웃</button>
        <button className="btn danger" onClick={() => setConfirm(true)}>계정 삭제</button>
      </section>
      {user?.isTeam && <Link to="/admin">팀 통계 보기</Link>}
      {err && <p className="error-text" role="alert">{err}</p>}
      {confirm && (
        <ConfirmDialog title="계정을 삭제할까요?" confirmLabel="삭제" danger busy={busy} onConfirm={remove} onCancel={() => setConfirm(false)}>
          <p>계정과 저장된 모든 데이터가 지워지고 되돌릴 수 없어요.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
