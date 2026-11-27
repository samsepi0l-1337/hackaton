import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { CardSkeletons } from './States';
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

function LoggedOut() {
  return (
    <div className="container stack" style={{ maxWidth: 560 }}>
      <h1>AI 창업 상담</h1>
      <section className="card stack">
        <h2 style={{ margin: 0 }}>이런 걸 해 드려요</h2>
        <p style={{ margin: 0 }}>관심·상황을 고르고, 대화로 구상을 정리하면, 부산에서 준비할 일과 연결할 수 있는 지원을 한 번에 안내해요.</p>
        <ol style={{ margin: 0 }}>
          <li>관심·상황: 지금 어디쯤인지, 어떤 분야에 관심 있는지 고릅니다.</li>
          <li>구상 정리: 질문 3개에 답하면 구상 요약이 만들어져요.</li>
          <li>준비 안내: 먼저 준비할 일, 현장에 물어볼 질문, 연결할 수 있는 지원을 보여줘요.</li>
        </ol>
      </section>
      <section className="card stack">
        <h2 style={{ margin: 0 }}>왜 로그인이 필요한가요?</h2>
        <p style={{ margin: 0 }}>무료로 쓸 수 있어요. 상담 횟수를 계정마다 관리하고 진행 내용을 이어서 보여주려면 로그인이 필요해요.</p>
        <div className="row"><Link className="btn primary" to="/login?next=%2Fmentor">로그인하고 상담 시작</Link></div>
      </section>
      <section className="card stack">
        <h2 style={{ margin: 0 }}>로그인 없이 쓸 수 있어요</h2>
        <ul className="plain-list">
          <li><Link to="/test">창업 유형 테스트</Link> <span className="muted">· 나에게 맞는 창업 유형 알아보기</span></li>
          <li><Link to="/programs">공고 보기</Link> <span className="muted">· 지원사업 공고 찾아보기</span></li>
          <li><Link to="/guide">이용 방법</Link> <span className="muted">· 서비스 사용법 안내</span></li>
        </ul>
      </section>
    </div>
  );
}

/** /mentor: 로그인 + 이메일 인증 필요. 로그아웃 상태면 상담 소개와 로그인 안내를 보여준다. 복구 비밀번호로 들어왔다면 먼저 새 비밀번호를 정한다. */
export function MentorGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="container"><CardSkeletons count={2} /></div>;
  if (!user) return <LoggedOut />;
  return <Inner>{children}</Inner>;
}

function Inner({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  if (user.mustChangePassword) return <Navigate to="/me?notice=password#password" replace />;
  if (!user.emailVerified) return <VerifyNeeded email={user.email} />;
  return <>{children}</>;
}
