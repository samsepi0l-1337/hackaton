import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

const MENU = [
  { to: '/mentor', label: '창업 준비' },
  { to: '/programs', label: '지역 지원 살펴보기' },
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
          <p>입력한 정보는 창업 구상 정리와 준비 안내에만 사용해요. 로그인 없이 쓸 수 있고, 초기화하면 지울 수 있어요.</p>
          <p>지역 자료는 공식 출처와 확인일을 함께 표시해요. 이 서비스는 신청 자격이나 창업 성공을 보장하지 않아요.</p>
          <p><Link to="/licenses">오픈소스 라이선스 고지</Link></p>
        </div>
      </footer>
    </div>
  );
}
