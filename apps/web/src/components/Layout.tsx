import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

const MENU = [
  { to: '/programs', label: '공고 모음' },
  { to: '/mentor', label: '상담' },
  { to: '/test', label: '창업 유형 테스트' },
];

export function Layout() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const close = () => setOpen(false);
  const account = loading ? null : user
    ? <Link to="/me" onClick={close}>내 정보</Link>
    : <Link to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} onClick={close}>로그인</Link>;

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="logo" onClick={close}>부산 창업 길잡이</Link>
          <nav className="nav">
            {MENU.map((m) => <NavLink key={m.to} to={m.to} className={({ isActive }) => (isActive ? 'active' : '')}>{m.label}</NavLink>)}
          </nav>
          <span className="grow" />
          {account}
          <button className="btn small ghost hamburger" aria-label="메뉴" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? '닫기' : '메뉴'}
          </button>
        </div>
        {open && (
          <nav className="nav-mobile">
            {MENU.map((m) => <NavLink key={m.to} to={m.to} onClick={close}>{m.label}</NavLink>)}
          </nav>
        )}
      </header>
      <main className="main"><Outlet /></main>
      <footer className="footer">
        <div className="container stack">
          <p>입력한 정보는 지원사업 추천과 사용자가 승인한 지원서 제출에만 사용하며, 행사 후 삭제해요.</p>
          <p>데이터 출처: 공공데이터포털 K-Startup 지원사업 공고. 이 서비스는 지원 자격을 보장하지 않아요.</p>
          <p><Link to="/licenses">오픈소스 라이선스 고지</Link></p>
        </div>
      </footer>
    </div>
  );
}
