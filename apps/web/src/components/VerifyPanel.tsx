import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FormEvent } from 'react';
import { VERIFY_RESEND_SECONDS } from '@gil/shared';
import { api, ApiClientError } from '../api/client';
import { useAuth } from './AuthContext';
import { TextField } from './TextField';
import { errMessage } from '../lib/format';

/** 인증 메일 안내: 6자리 코드 입력 + 다시 보내기(60초 간격). 성공하면 로그인 상태가 되고 onDone 을 부른다. */
export function VerifyPanel({ email, initialCooldown = 0, onDone, lead }: { email: string; initialCooldown?: number; onDone: () => void; lead?: string }) {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [code, setCode] = useState('');
  const [cool, setCool] = useState(initialCooldown);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (cool <= 0) return;
    const t = setTimeout(() => setCool((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cool]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(''); setInfo('');
    if (!/^\d{6}$/.test(code)) { setErr('6자리 숫자 코드를 입력해 주세요'); return; }
    setBusy(true);
    try {
      const r = await api.verifyEmail({ email, code });
      setUser(r.user);
      // 새 비밀번호를 정해야 하는 계정(인증 전 재가입)은 내 정보의 비밀번호 변경으로 보낸다.
      if (r.user.mustChangePassword) nav('/me', { replace: true }); else onDone();
    } catch (x) {
      setErr(x instanceof ApiClientError && (x.code === 'bad_request' || x.code === 'validation')
        ? `${x.message} 코드가 틀렸거나 만료됐다면 인증 메일을 다시 받아 주세요.` : errMessage(x));
    } finally { setBusy(false); }
  }

  async function resend() {
    if (sending) return;
    setErr(''); setInfo(''); setSending(true);
    try {
      await api.resendVerification(email);
      setInfo('인증 메일을 다시 보냈어요. 스팸함도 확인해 주세요.');
      setCool(VERIFY_RESEND_SECONDS);
    } catch (x) {
      if (x instanceof ApiClientError && x.code === 'too_many') { setCool(VERIFY_RESEND_SECONDS); setErr('너무 자주 요청했어요. 잠시 뒤에 다시 보내 주세요.'); }
      else setErr(errMessage(x));
    } finally { setSending(false); }
  }

  return (
    <form className="card stack" onSubmit={submit} noValidate>
      <p>{lead ?? '메일의 링크를 누르거나 아래에 6자리 코드를 입력해 주세요.'} 보낸 곳: <strong>{email}</strong></p>
      <TextField label="인증 코드 (6자리)" value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" placeholder="123456" />
      {err && <p className="error-text" role="alert">{err}</p>}
      {info && <p className="muted" role="status">{info}</p>}
      <div className="row">
        <button className="btn primary" disabled={busy}>{busy ? '확인 중...' : '인증하기'}</button>
        <button type="button" className="btn" disabled={cool > 0 || sending} onClick={resend}>{cool > 0 ? `다시 보내기 (${cool}초 뒤)` : '인증 메일 다시 보내기'}</button>
      </div>
    </form>
  );
}
