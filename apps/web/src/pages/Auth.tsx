import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PASSWORD_MIN } from '@gil/shared';
import { api, ApiClientError } from '../api/client';
import { useAuth } from '../components/AuthContext';
import { safeNext } from '../components/RequireAuth';
import { TextField } from '../components/TextField';
import { errMessage } from '../lib/format';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const [sp] = useSearchParams();
  const next = safeNext(sp.get('next'));
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';

  async function submit(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!EMAIL_RE.test(email)) er.email = '이메일 형식이 올바르지 않아요';
    if (password.length < PASSWORD_MIN) er.password = `비밀번호는 ${PASSWORD_MIN}자 이상이에요`;
    if (signup && !consent) er.consent = '개인정보 안내에 동의해 주세요';
    setErrors(er);
    setFormError('');
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      const r = signup ? await api.signup({ email, password, consent }) : await api.login({ email, password });
      setUser(r.user);
      nav(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'conflict') setFormError('이미 가입된 이메일이에요');
      else if (err instanceof ApiClientError && err.code === 'unauthorized') setFormError('이메일 또는 비밀번호가 맞지 않아요');
      else setFormError(errMessage(err));
    } finally { setBusy(false); }
  }

  const other = `${signup ? '/login' : '/signup'}${sp.get('next') ? `?next=${encodeURIComponent(sp.get('next')!)}` : ''}`;
  return (
    <div className="container" style={{ maxWidth: 440 }}>
      <h1>{signup ? '가입하기' : '로그인'}</h1>
      <form className="card" onSubmit={submit} noValidate>
        <TextField label="이메일" type="email" autoComplete="email" value={email} onChange={setEmail} error={errors.email} />
        <TextField label="비밀번호" type="password" autoComplete={signup ? 'new-password' : 'current-password'} value={password} onChange={setPassword} error={errors.password} hint={signup ? `${PASSWORD_MIN}자 이상` : undefined} />
        {signup && (
          <div className={`field${errors.consent ? ' has-error' : ''}`}>
            <label className="check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>(필수) 입력한 정보는 추천과 승인한 지원서 제출에만 쓰고 행사 후 삭제하는 데 동의해요.</span>
            </label>
            {errors.consent && <p className="error-text">{errors.consent}</p>}
          </div>
        )}
        {formError && <p className="error-text" role="alert">{formError}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? '처리 중...' : signup ? '가입하기' : '로그인'}</button>
      </form>
      <p style={{ marginTop: 16 }}>{signup ? '이미 계정이 있나요?' : '계정이 없나요?'} <Link to={other}>{signup ? '로그인' : '가입하기'}</Link></p>
    </div>
  );
}

export const Login = () => <AuthForm mode="login" />;
export const Signup = () => <AuthForm mode="signup" />;
