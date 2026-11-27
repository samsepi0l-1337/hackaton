import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { checkPassword, scoreTypeTest } from '@gil/shared';
import { api, ApiClientError } from '../api/client';
import { useAuth } from '../components/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PasswordChecklist } from '../components/PasswordChecklist';
import { TextField } from '../components/TextField';
import { VerifyPanel } from '../components/VerifyPanel';
import { useAsync } from '../hooks/useAsync';
import { errMessage } from '../lib/format';
import { loadLocalTest } from '../lib/typeTestStorage';
import { QuotaLine } from '../mentor/Quota';

function PasswordSection({ notice }: { notice: boolean }) {
  const { setUser, user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const pw = checkPassword(next, confirm);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(''); setDone(false);
    if (!current || !pw.ok) return;
    setBusy(true);
    try {
      await api.changePassword({ currentPassword: current, newPassword: next, newPasswordConfirm: confirm });
      setDone(true); setCurrent(''); setNext(''); setConfirm('');
      if (user) setUser({ ...user, mustChangePassword: false });
    } catch (x) {
      setErr(x instanceof ApiClientError && x.code === 'unauthorized' ? '현재 비밀번호가 맞지 않아요' : errMessage(x));
    } finally { setBusy(false); }
  }

  return (
    <section id="password" className="card stack">
      <h2 style={{ margin: 0 }}>비밀번호 변경</h2>
      {(notice || user?.mustChangePassword) && <p role="status"><strong>복구 비밀번호로 로그인했어요. 새 비밀번호를 정해야 창업 준비를 쓸 수 있어요.</strong></p>}
      <form className="stack" onSubmit={submit} noValidate>
        <TextField label="현재 비밀번호" hint="복구 비밀번호로 로그인했다면 메일로 받은 복구 비밀번호를 넣어 주세요" type="password" autoComplete="current-password" value={current} onChange={setCurrent} />
        <TextField label="새 비밀번호" type="password" autoComplete="new-password" value={next} onChange={setNext} />
        <TextField label="새 비밀번호 확인" type="password" autoComplete="new-password" value={confirm} onChange={setConfirm} />
        <PasswordChecklist password={next} confirm={confirm} />
        {err && <p className="error-text" role="alert">{err}</p>}
        {done && <p role="status">비밀번호를 바꿨어요. 다른 기기의 로그인은 끝났어요.</p>}
        <div><button className="btn primary" disabled={busy || !current || !pw.ok}>{busy ? '바꾸는 중...' : '비밀번호 바꾸기'}</button></div>
      </form>
    </section>
  );
}

export function Me() {
  const { user, logout, setUser } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const verified = !!user?.emailVerified && !user.mustChangePassword;
  const sess = useAsync(() => (verified ? api.exploreSession() : Promise.resolve(null)), [verified]);
  const local = loadLocalTest();
  const type = local ? scoreTypeTest(local.answers) : null;

  useEffect(() => {
    if (loc.hash === '#password') document.getElementById('password')?.scrollIntoView();
  }, [loc.hash]);

  async function remove() {
    setBusy(true);
    try { await api.deleteAccount(); setUser(null); nav('/', { replace: true }); } catch (e) { setErr(errMessage(e)); setBusy(false); }
  }

  if (!user) return null;
  return (
    <div className="container stack">
      <h1>내 정보</h1>
      <section className="card stack">
        <h2 style={{ margin: 0 }}>계정</h2>
        <p style={{ margin: 0 }}>{user.email} <span className="badge">{user.emailVerified ? '이메일 인증 완료' : '이메일 인증 전'}</span></p>
        {!user.emailVerified && <VerifyPanel email={user.email} onDone={() => {}} lead="인증하면 창업 준비를 쓸 수 있어요. 메일의 링크를 누르거나 코드를 입력해 주세요." />}
      </section>

      <PasswordSection notice={new URLSearchParams(loc.search).get('notice') === 'password'} />

      <section className="card stack">
        <h2 style={{ margin: 0 }}>이번 주 상담</h2>
        {!verified
          ? <p className="muted">이메일 인증을 마치면 남은 횟수가 보여요. 계정 1개로 일주일에 3번 상담할 수 있어요.</p>
          : sess.loading ? <p className="muted">확인하는 중이에요.</p>
          : sess.data?.quota ? <QuotaLine quota={sess.data.quota} /> : <p className="muted">남은 횟수를 불러오지 못했어요.</p>}
        {verified && <div><Link className="btn primary" to="/mentor">창업 준비 이어서 하기</Link></div>}
      </section>

      <section className="card stack">
        <h2 style={{ margin: 0 }}>창업 유형 테스트</h2>
        {type
          ? <p style={{ margin: 0 }}>지난 결과: <strong>{type.code}</strong> · {type.name} <span className="muted">(재미·참고용)</span></p>
          : <p className="muted" style={{ margin: 0 }}>아직 결과가 없어요. 12문항, 약 1분이에요.</p>}
        <div><Link className="btn" to="/test">{type ? '다시 하기' : '테스트 하기'}</Link></div>
      </section>

      {user.isTeam && <Link to="/admin">팀 통계 보기</Link>}
      {err && <p className="error-text" role="alert">{err}</p>}
      <section className="row">
        <button className="btn" onClick={async () => { await logout(); nav('/'); }}>로그아웃</button>
        <button className="btn danger" onClick={() => setConfirm(true)}>계정 삭제</button>
      </section>
      {confirm && (
        <ConfirmDialog title="계정을 삭제할까요?" confirmLabel="삭제" danger busy={busy} onConfirm={remove} onCancel={() => setConfirm(false)}>
          <p>계정과 저장된 모든 데이터가 지워지고 되돌릴 수 없어요.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
