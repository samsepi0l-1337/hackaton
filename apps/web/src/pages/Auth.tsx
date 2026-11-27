import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { EMAIL_RE, FORGOT_PASSWORD_NOTICE, RECOVERY_TTL_MINUTES, VERIFY_RESEND_SECONDS, checkPassword } from '@gil/shared';
import { api, ApiClientError } from '../api/client';
import { useAuth } from '../components/AuthContext';
import { PasswordChecklist } from '../components/PasswordChecklist';
import { safeNext } from '../components/RequireAuth';
import { TextField } from '../components/TextField';
import { VerifyPanel } from '../components/VerifyPanel';
import { errMessage } from '../lib/format';

const withNext = (path: string, raw: string | null) => (raw ? `${path}?next=${encodeURIComponent(raw)}` : path);
const mentorNext = (raw: string | null) => safeNext(raw ?? '/mentor');

export function Signup() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const pw = checkPassword(password, confirm);
  const ready = EMAIL_RE.test(email) && pw.ok && consent;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!EMAIL_RE.test(email)) er.email = '이메일 형식이 올바르지 않아요';
    if (!consent) er.consent = '개인정보 안내에 동의해 주세요';
    setErrors(er);
    setFormError('');
    if (Object.keys(er).length || !pw.ok) return;
    setBusy(true);
    try {
      const r = await api.signup({ email, password, passwordConfirm: confirm, consent });
      setSentTo(r.email || email);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'conflict') setFormError('이미 가입된 이메일이에요. 로그인하거나 비밀번호 찾기를 이용해 주세요.');
      else setFormError(errMessage(err));
    } finally { setBusy(false); }
  }

  if (sentTo) {
    return (
      <div className="container stack" style={{ maxWidth: 480 }}>
        <h1>인증 메일을 보냈어요</h1>
        <p><strong>{sentTo}</strong>로 인증 메일을 보냈어요. 24시간 안에 메일의 링크를 누르거나 6자리 코드를 입력해 주세요. 인증하면 바로 로그인돼요.</p>
        <VerifyPanel email={sentTo} initialCooldown={VERIFY_RESEND_SECONDS} onDone={() => nav(mentorNext(sp.get('next')), { replace: true })} />
        <p className="muted">이미 인증했나요? <Link to={withNext('/login', sp.get('next'))}>로그인</Link></p>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 440 }}>
      <h1>가입하기</h1>
      <p className="muted">창업 준비는 가입하고 이메일을 인증한 뒤 쓸 수 있어요. 계정 1개로 일주일에 3번 상담할 수 있어요.</p>
      <form className="card" onSubmit={submit} noValidate>
        <TextField label="이메일" type="email" autoComplete="email" value={email} onChange={setEmail} error={errors.email} />
        <TextField label="비밀번호" type="password" autoComplete="new-password" value={password} onChange={setPassword} />
        <TextField label="비밀번호 확인" type="password" autoComplete="new-password" value={confirm} onChange={setConfirm} />
        <PasswordChecklist password={password} confirm={confirm} />
        <div className={`field${errors.consent ? ' has-error' : ''}`}>
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>(필수) 입력한 정보는 추천과 승인한 지원서 제출에만 쓰고 행사 후 삭제하는 데 동의해요.</span>
          </label>
          {errors.consent && <p className="error-text">{errors.consent}</p>}
        </div>
        {formError && <p className="error-text" role="alert">{formError}</p>}
        <button className="btn primary block" disabled={busy || !ready}>{busy ? '처리 중...' : '가입하기'}</button>
      </form>
      <p style={{ marginTop: 16 }}>이미 계정이 있나요? <Link to={withNext('/login', sp.get('next'))}>로그인</Link></p>
    </div>
  );
}

export function Login() {
  const [sp] = useSearchParams();
  const next = safeNext(sp.get('next'));
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [needVerify, setNeedVerify] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!EMAIL_RE.test(email)) er.email = '이메일 형식이 올바르지 않아요';
    if (!password) er.password = '비밀번호를 입력해 주세요';
    setErrors(er);
    setFormError('');
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      const r = await api.login({ email, password });
      setUser(r.user);
      if (r.user.mustChangePassword) nav('/me?notice=password#password', { replace: true });
      else if (r.user.emailVerified === false) setNeedVerify(r.user.email);
      else nav(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'email_unverified') setNeedVerify(email);
      else if (err instanceof ApiClientError && err.code === 'unauthorized') setFormError('이메일 또는 비밀번호가 맞지 않아요');
      else setFormError(errMessage(err));
    } finally { setBusy(false); }
  }

  if (needVerify) {
    return (
      <div className="container stack" style={{ maxWidth: 480 }}>
        <h1>이메일 인증이 필요해요</h1>
        <p>아직 이메일 인증을 마치지 않았어요. 메일의 링크를 누르거나 코드를 입력해 주세요. 메일이 없다면 다시 보낼 수 있어요.</p>
        <VerifyPanel email={needVerify} onDone={() => nav(next, { replace: true })} />
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 440 }}>
      <h1>로그인</h1>
      <form className="card" onSubmit={submit} noValidate>
        <TextField label="이메일" type="email" autoComplete="email" value={email} onChange={setEmail} error={errors.email} />
        <TextField label="비밀번호" type="password" autoComplete="current-password" value={password} onChange={setPassword} error={errors.password} />
        {formError && <p className="error-text" role="alert">{formError}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? '처리 중...' : '로그인'}</button>
      </form>
      <p style={{ marginTop: 16 }}><Link to="/forgot">비밀번호 찾기</Link></p>
      <p>계정이 없나요? <Link to={withNext('/signup', sp.get('next'))}>가입하기</Link></p>
    </div>
  );
}

/** 메일 링크(?token=)는 자동 인증, 아니면 이메일 + 코드 입력. */
export function Verify() {
  const [sp] = useSearchParams();
  const token = sp.get('token');
  const next = mentorNext(sp.get('next'));
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [status, setStatus] = useState<'working' | 'failed' | 'form'>(token ? 'working' : 'form');
  const [error, setError] = useState('');
  const [email, setEmail] = useState(sp.get('email') ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const [cool, setCool] = useState(0);
  const [info, setInfo] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api.verifyEmail({ token }).then((r) => { setUser(r.user); nav(next, { replace: true }); }, (e) => {
      setError(e instanceof ApiClientError && e.code !== 'network' ? '인증 링크가 만료됐거나 이미 사용됐어요. 이메일을 입력해 인증 메일을 다시 받아 주세요.' : errMessage(e));
      setStatus('failed');
    });
  }, [token, next, nav, setUser]);

  useEffect(() => {
    if (cool <= 0) return;
    const t = setTimeout(() => setCool((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cool]);

  async function resend() {
    setInfo(''); setError('');
    if (!EMAIL_RE.test(email)) { setError('이메일 형식이 올바르지 않아요'); return; }
    try {
      await api.resendVerification(email);
      setInfo('가입된 이메일이면 인증 메일을 보냈어요. 메일함(스팸함 포함)을 확인해 주세요.');
      setConfirmed(true);
      setCool(VERIFY_RESEND_SECONDS);
    } catch (e) {
      if (e instanceof ApiClientError && e.code === 'too_many') { setCool(VERIFY_RESEND_SECONDS); setError('너무 자주 요청했어요. 잠시 뒤에 다시 보내 주세요.'); }
      else setError(errMessage(e));
    }
  }

  if (status === 'working') return <div className="container"><p role="status">이메일을 인증하는 중이에요...</p></div>;
  return (
    <div className="container stack" style={{ maxWidth: 480 }}>
      <h1>이메일 인증</h1>
      {status === 'failed' && <p className="error-text" role="alert">{error}</p>}
      <div className="card stack">
        <TextField label="이메일" type="email" autoComplete="email" value={email} onChange={(v) => { setEmail(v); setConfirmed(false); }} />
        <div className="row">
          <button type="button" className="btn" disabled={cool > 0} onClick={resend}>{cool > 0 ? `다시 보내기 (${cool}초 뒤)` : '인증 메일 보내기'}</button>
        </div>
        {status === 'form' && error && <p className="error-text" role="alert">{error}</p>}
        {info && <p className="muted" role="status">{info}</p>}
      </div>
      {EMAIL_RE.test(email) && (confirmed || status === 'form') && (
        <VerifyPanel email={email} lead="메일로 받은 6자리 코드를 입력해 주세요." onDone={() => nav(next, { replace: true })} />
      )}
      <p className="muted"><Link to="/login">로그인</Link></p>
    </div>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!EMAIL_RE.test(email)) { setError('이메일 형식이 올바르지 않아요'); return; }
    setBusy(true);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'too_many') setError('너무 자주 요청했어요. 잠시 뒤에 다시 시도해 주세요.');
      else setError(errMessage(err));
    } finally { setBusy(false); }
  }

  return (
    <div className="container stack" style={{ maxWidth: 440 }}>
      <h1>비밀번호 찾기</h1>
      <p>가입한 이메일을 입력하면 복구 비밀번호를 보내 드려요. 복구 비밀번호는 {RECOVERY_TTL_MINUTES}분 동안만 쓸 수 있고, 로그인한 뒤 새 비밀번호로 바꿔야 해요.</p>
      <form className="card" onSubmit={submit} noValidate>
        <TextField label="이메일" type="email" autoComplete="email" value={email} onChange={setEmail} error={error} />
        <button className="btn primary block" disabled={busy}>{busy ? '보내는 중...' : '복구 비밀번호 받기'}</button>
      </form>
      {sent && <p role="status" className="card">{FORGOT_PASSWORD_NOTICE}</p>}
      <p><Link to="/login">로그인으로 돌아가기</Link></p>
    </div>
  );
}
