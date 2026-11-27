import { Suspense, useEffect, useRef, useState } from 'react';
import type { FocusEvent } from 'react';
import { CardSkeletons } from './States';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { loadMentor } from '../lazyPages';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { PortalIcon } from './PortalIcons';

const NAV_GROUPS: { label: string; links: [string, string][] }[] = [
  { label: '지원사업', links: [['전체 공고', '/programs'], ['마감 빠른 순 공고', '/programs?sort=deadline']] },
  { label: 'AI 창업 상담', links: [['멘토 상담', '/mentor'], ['이번 주 상담 횟수', '/me']] },
  { label: '창업 가이드', links: [['창업 유형 테스트', '/test'], ['서비스 이용 방법', '/#how-to']] },
  { label: '내 활동', links: [['내 정보', '/me'], ['이번 주 상담 횟수', '/me']] },
];

function preloadMentor() { void loadMentor().catch(() => {}); }
const mentorHints = (to: string) => (to === '/mentor' ? { onPointerEnter: preloadMentor, onFocus: preloadMentor } : {});

export function Layout() {
  const loc = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  // 메뉴는 셋 중 하나라도 해당하면 열린다. 호버는 미리보기, 클릭은 고정, 포커스는 메뉴 안에 있는 동안 유지.
  const [pinned, setPinned] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [focusIn, setFocusIn] = useState<number | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  const closeAll = () => { setNavOpen(false); setPinned(null); setHover(null); setFocusIn(null); };

  useEffect(() => {
    setNavOpen(false);
    setPinned(null);
    setHover(null);
    setFocusIn(null);
    if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView();
  }, [loc.key, loc.hash]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (headerRef.current?.contains(e.target as Node)) return;
      setNavOpen(false);
      setPinned(null);
      setHover(null);
      setFocusIn(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const active = document.activeElement;
      const group = active instanceof Element ? active.closest('.nav-group') : null;
      // 포커스가 메뉴 안에 있을 때만 그 메뉴의 버튼으로 돌려놓는다. 검색창 등의 포커스는 건드리지 않는다.
      if (group && headerRef.current?.contains(group)) group.querySelector<HTMLButtonElement>(':scope > button')?.focus();
      setNavOpen(false);
      setPinned(null);
      setHover(null);
      setFocusIn(null);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const isCur = (to: string) => {
    const [path, rest = ''] = to.split('#')[0].split('?');
    if (to.includes('#') || path !== loc.pathname) return false;
    return rest ? loc.search === '?' + rest : !loc.search.includes('sort=');
  };
  const cur = (to: string) => (isCur(to) ? ({ 'aria-current': 'page' } as const) : {});

  const onGroupBlur = (i: number) => (e: FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setPinned((c) => (c === i ? null : c));
    setFocusIn((c) => (c === i ? null : c));
  };

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
          <Link className="brand" to="/" aria-label="해보까 홈" {...cur('/')}>
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
              <Link to="/mentor" {...mentorHints('/mentor')} {...cur('/mentor')}><PortalIcon name="chat" /> AI 멘토</Link>
              <Link to="/programs" {...cur('/programs')}><PortalIcon name="search" /> 공고 검색</Link>
              <Link to="/me" {...cur('/me')}><PortalIcon name="user" /> 내 정보</Link>
              <Link to="/admin" {...cur('/admin')}><PortalIcon name="bars" /> 팀 통계</Link>
            </div>
          </div>
          <button type="button" className="mobile-menu" aria-label={navOpen ? '메뉴 닫기' : '메뉴 열기'} aria-controls="portal-nav" aria-expanded={navOpen} onClick={() => { setNavOpen(!navOpen); setPinned(null); setHover(null); setFocusIn(null); }}>
            <PortalIcon name={navOpen ? 'close' : 'menu'} />
          </button>
        </div>
        <nav id="portal-nav" aria-label="주 메뉴" className={'portal-nav' + (navOpen ? ' is-open' : '')}>
          <div className="portal-width nav-items">
            {NAV_GROUPS.map((g, i) => {
              const open = pinned === i || hover === i || focusIn === i;
              return (
                <div
                  className="nav-group"
                  key={g.label}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover((c) => (c === i ? null : c))}
                  onFocus={(e) => { if ((e.target as Element).closest('.menu-panel')) setFocusIn(i); }}
                  onBlur={onGroupBlur(i)}
                >
                  <button type="button" aria-expanded={open} onClick={() => setPinned(pinned === i ? null : i)}>
                    {g.label}
                    <PortalIcon name="down" size={16} />
                  </button>
                  {open && (
                    <div className="menu-panel">
                      {g.links.map(([label, to]) => <Link key={label} to={to} onClick={closeAll} {...mentorHints(to)} {...cur(to)}>{label}</Link>)}
                    </div>
                  )}
                </div>
              );
            })}
            <Link className="mobile-account" to="/me" {...cur('/me')}>내 정보</Link>
            <Link className="mobile-account" to="/admin" {...cur('/admin')}>팀 통계</Link>
          </div>
        </nav>
      </header>
      <main id="main" className="main"><Suspense fallback={<div className="container"><CardSkeletons /></div>}><RouteErrorBoundary key={loc.pathname}><Outlet /></RouteErrorBoundary></Suspense></main>
      <footer className="footer">
        <div className="portal-width footer-inner">
          <strong>해보까</strong>
          <p>입력한 내용은 서버에 저장되고, 문장 정리를 위해 외부 AI(Upstage)로 전송될 수 있어요. 상담 화면에서 처음부터 시작하거나 내 정보에서 계정을 지우면 함께 지워져요.</p>
          <p>공고 출처 · 공공데이터포털 K-Startup　|　<Link to="/licenses">오픈소스 라이선스</Link></p>
        </div>
      </footer>
    </div>
  );
}
