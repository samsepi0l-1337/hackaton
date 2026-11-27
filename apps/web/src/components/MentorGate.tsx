import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { RequireAuth } from './RequireAuth';
import { VerifyPanel } from './VerifyPanel';

function VerifyNeeded({ email }: { email: string }) {
  const [done, setDone] = useState(false);
  const nav = useNavigate();
  return (
    <div className="container stack" style={{ maxWidth: 480 }}>
      <h1>이메일 인증이 필요해요</h1>
      <p>창업 준비는 이메일 인증을 마친 계정으로 쓸 수 있어요. 가입한 이메일로 보낸 메일의 링크를 누르거나 코드를 입력해 주세요.</p>
      <VerifyPanel email={email} onDone={() => { setDone(true); nav('/mentor', { replace: true }); }} />
      {done && <p className="muted" role="status">인증했어요.</p>}
      <p className="muted"><Link to="/me">내 정보</Link>에서도 인증할 수 있어요.</p>
    </div>
  );
}

/** /mentor: 로그인 + 이메일 인증 필요. 복구 비밀번호로 들어왔다면 먼저 새 비밀번호를 정한다. */
export function MentorGate({ children }: { children: ReactNode }) {
  return <RequireAuth><Inner>{children}</Inner></RequireAuth>;
}

function Inner({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  if (user.mustChangePassword) return <Navigate to="/me?notice=password#password" replace />;
  if (!user.emailVerified) return <VerifyNeeded email={user.email} />;
  return <>{children}</>;
}
