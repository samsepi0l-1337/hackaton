import { Suspense, useEffect, useRef, useState } from 'react';
import { CardSkeletons } from './States';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { loadMentor } from '../lazyPages';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { PortalIcon } from './PortalIcons';

const NAV_GROUPS: { label: string; links: [string, string][] }[] = [
  { label: '지원사업', links: [['전체 공고', '/programs'], ['부산 지역 공고', '/programs'], ['이번 주 마감', '/programs?sort=deadline']] },
  { label: 'AI 창업 상담', links: [['멘토 상담', '/mentor'], ['지난 상담', '/me']] },
  { label: '창업 가이드', links: [['창업 유형 테스트', '/test'], ['서비스 이용 방법', '/#how-to']] },
  { label: '내 활동', links: [['내 정보', '/me'], ['지원서 제출 내역', '/me']] },
];

function preloadMentor() { void loadMentor().catch(() => {}); }
const mentorHints = (to: string) => (to === '/mentor' ? { onPointerEnter: preloadMentor, onFocus: preloadMentor } : {});

export function Layout() {
  const loc = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<number | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  const closeAll = () => { setNavOpen(false); setOpenGroup(null); };

  useEffect(() => {
    setNavOpen(false);
    setOpenGroup(null);
    if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView();
  }, [loc.key, loc.hash]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (headerRef.current?.contains(e.target as Node)) return;
      setNavOpen(false);
      setOpenGroup(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      headerRef.current?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')?.focus();
      setNavOpen(false);
      setOpenGroup(null);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="app">
      <a className="skip" href="#main">본문 바로가기</a>
      <div className="civic-strip">
        <div className="portal-width">
          <span className="sea-mark" aria-hidden="true">≈</span>
          부산 청년 창업 지원 정보를 공식 출처와 함께 안내합니다.
        </div>
      </div>
      <header className="portal-header" ref={headerRef}>
        <div className="portal-width masthead">
          <Link className="brand" to="/" aria-label="해보까 홈">
            <img src="/brand.svg" alt="" />
            <span><b>해보까</b></span>
          </Link>
          <div className="mast-actions">
            <div className="utility">
              <Link to="/#how-to">이용 방법</Link>
              <span></span>
              <a href="https://www.k-startup.go.kr/" target="_blank" rel="noreferrer">K-Startup <PortalIcon name="external" size={13} /></a>
            </div>
            <div className="account-actions">
              <Link to="/mentor" {...mentorHints('/mentor')}><PortalIcon name="chat" /> AI 멘토</Link>
              <Link to="/programs"><PortalIcon name="search" /> 공고 검색</Link>
              <Link to="/me"><PortalIcon name="user" /> 내 정보</Link>
              <Link to="/admin"><PortalIcon name="bars" /> 팀 통계</Link>
            </div>
          </div>
          <button type="button" className="mobile-menu" aria-label={navOpen ? '메뉴 닫기' : '메뉴 열기'} aria-controls="portal-nav" aria-expanded={navOpen} onClick={() => { setNavOpen(!navOpen); setOpenGroup(null); }}>
            <PortalIcon name={navOpen ? 'close' : 'menu'} />
          </button>
        </div>
        <nav id="portal-nav" aria-label="주 메뉴" className={'portal-nav' + (navOpen ? ' is-open' : '')}>
          <div className="portal-width nav-items">
            {NAV_GROUPS.map((g, i) => (
              <div
                className="nav-group"
                key={g.label}
                onMouseEnter={() => setOpenGroup(i)}
                onMouseLeave={() => setOpenGroup((cur) => (cur === i ? null : cur))}
              >
                <button type="button" aria-expanded={openGroup === i} onClick={() => setOpenGroup(openGroup === i ? null : i)}>
                  {g.label}
                  <PortalIcon name="down" size={16} />
                </button>
                {openGroup === i && (
                  <div className="menu-panel">
                    {g.links.map(([label, to]) => <Link key={label} to={to} onClick={closeAll} {...mentorHints(to)}>{label}</Link>)}
                  </div>
                )}
              </div>
            ))}
            <Link className="mobile-account" to="/me">내 정보</Link>
            <Link className="mobile-account" to="/admin">팀 통계</Link>
          </div>
        </nav>
      </header>
      <main id="main" className="main"><Suspense fallback={<div className="container"><CardSkeletons /></div>}><RouteErrorBoundary key={loc.pathname}><Outlet /></RouteErrorBoundary></Suspense></main>
      <footer className="footer">
        <div className="portal-width footer-inner">
          <strong>해보까</strong>
          <p>입력한 정보는 추천과 승인한 지원서 제출에만 쓰며, 행사 후 삭제합니다.</p>
          <p>공고 출처 · 공공데이터포털 K-Startup　|　<Link to="/licenses">오픈소스 라이선스</Link></p>
        </div>
      </footer>
    </div>
  );
}
