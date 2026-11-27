import { Suspense, useEffect, useRef, useState } from 'react';
import type { FocusEvent } from 'react';
import { CardSkeletons } from './States';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { loadMentor } from '../lazyPages';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { PortalIcon } from './PortalIcons';
import { useAuth } from './AuthContext';

// to 가 있으면 드롭다운 없이 바로 이동하는 항목이다.
const NAV_GROUPS: { label: string; to?: string; links: [string, string][] }[] = [
  { label: '지원사업', links: [['전체 공고', '/programs'], ['최근 공모', '/programs?sort=recent']] },
  { label: 'AI 창업 상담', to: '/mentor', links: [] },
  { label: '창업 가이드', links: [['창업 유형 테스트', '/test'], ['서비스 이용 방법', '/guide']] },
  { label: '내 활동', links: [['내 정보', '/me']] },
];

function preloadMentor() { void loadMentor().catch(() => {}); }
const mentorHints = (to: string) => (to === '/mentor' ? { onPointerEnter: preloadMentor, onFocus: preloadMentor } : {});

export function Layout() {
  const loc = useLocation();
  const { user, loading } = useAuth();
  // 로그인 전에는 로그인, 로그인 뒤에는 내 정보. 확인 중에는 자리만 지킨다.
  // 이미 로그인 화면이면 기존 next 를 그대로 쓴다 (로그인 안에 로그인을 겹치지 않는다).
  const onLogin = loc.pathname === '/login';
  const loginTo = onLogin ? '/login' + loc.search : `/login?next=${encodeURIComponent(loc.pathname + loc.search)}`;
  const [navOpen, setNavOpen] = useState(false);
  // 메뉴는 셋 중 하나라도 해당하면 열린다. 호버는 미리보기, 클릭은 고정, 포커스는 메뉴 안에 있는 동안 유지.
  const [pinned, setPinned] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [focusIn, setFocusIn] = useState<number | null>(null);
  // 직접 닫은 메뉴. 다음 포인터 진입이나 버튼 누름 전까지 호버·포커스보다 우선한다.
  const [dismissed, setDismissed] = useState<number | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  const closeAll = () => { setNavOpen(false); setPinned(null); setHover(null); setFocusIn(null); setDismissed(null); };

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
      const toggle = headerRef.current?.querySelector<HTMLButtonElement>('.mobile-menu');
      // 포커스가 헤더 메뉴 안에 있을 때만 옮긴다. 검색창 등의 포커스는 건드리지 않는다.
      if (toggle?.getAttribute('aria-expanded') === 'true' && active instanceof Element && headerRef.current?.contains(active)) toggle.focus();
      else if (group && headerRef.current?.contains(group)) group.querySelector<HTMLButtonElement>(':scope > button')?.focus();
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

  // 경로와 쿼리를 함께 비교한다. 기본 정렬(sort=deadline)은 없는 것과 같다. 해시 링크는 현재 쪽으로 세지 않는다.
  const norm = (path: string, search: string) => {
    const p = new URLSearchParams(search);
    if (p.get('sort') === 'deadline') p.delete('sort');
    p.sort();
    return path + '?' + p.toString();
  };
  const isCur = (to: string) => {
    if (to.includes('#')) return false;
    const [path, rest = ''] = to.split('?');
    return norm(path, rest) === norm(loc.pathname, loc.search);
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
              <Link to="/guide" {...cur('/guide')}>이용 방법</Link>
              <span></span>
              <a href="https://www.k-startup.go.kr/" target="_blank" rel="noreferrer">K-Startup <PortalIcon name="external" size={13} /></a>
            </div>
            <div className="account-actions">
              <Link to="/mentor" {...mentorHints('/mentor')} {...cur('/mentor')}><PortalIcon name="chat" /> AI 멘토</Link>
              <Link to="/programs" {...cur('/programs')}><PortalIcon name="search" /> 공고 검색</Link>
              {user || loading
                ? <Link to="/me" {...cur('/me')} style={loading ? { visibility: 'hidden' } : undefined}><PortalIcon name="user" /> 내 정보</Link>
                : <Link to={loginTo} {...(onLogin ? ({ 'aria-current': 'page' } as const) : {})}><PortalIcon name="login" /> 로그인</Link>}
            </div>
          </div>
          <button type="button" className="mobile-menu" aria-label={navOpen ? '메뉴 닫기' : '메뉴 열기'} aria-controls="portal-nav" aria-expanded={navOpen} onClick={() => { setNavOpen(!navOpen); setPinned(null); setHover(null); setFocusIn(null); setDismissed(null); }}>
            <PortalIcon name={navOpen ? 'close' : 'menu'} />
          </button>
        </div>
        <nav id="portal-nav" aria-label="주 메뉴" className={'portal-nav' + (navOpen ? ' is-open' : '')}>
          <div className="portal-width nav-items">
            {NAV_GROUPS.map((g, i) => {
              if (g.to) {
                const to = g.to;
                return (
                  <div className="nav-group" key={g.label}>
                    <Link className="nav-direct" to={to} {...mentorHints(to)} {...cur(to)} onClick={closeAll}>{g.label}</Link>
                  </div>
                );
              }
              const open = dismissed !== i && (pinned === i || hover === i || focusIn === i);
              return (
                <div
                  className="nav-group"
                  key={g.label}
                  onMouseEnter={() => { setHover(i); setDismissed((c) => (c === i ? null : c)); }}
                  onMouseLeave={() => setHover((c) => (c === i ? null : c))}
                  onFocus={(e) => { if ((e.target as Element).closest('.menu-panel')) setFocusIn(i); }}
                  onBlur={onGroupBlur(i)}
                >
                  <button type="button" aria-expanded={open} onClick={() => {
                    // 호버로만 열린 메뉴는 첫 클릭에 고정하고, 고정된 메뉴는 클릭하면 닫는다.
                    if (pinned === i) { setDismissed(i); setPinned(null); setFocusIn(null); } else { setDismissed(null); setPinned(i); }
                  }}>
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
            {user ? <Link className="mobile-account" to="/me" {...cur('/me')}>내 정보</Link> : <Link className="mobile-account" to={loginTo}>로그인</Link>}
          </div>
        </nav>
      </header>
      <main id="main" className="main"><Suspense fallback={<div className="container"><CardSkeletons /></div>}><RouteErrorBoundary key={loc.pathname}><Outlet /></RouteErrorBoundary></Suspense></main>
      <footer className="footer">
        <div className="portal-width footer-inner">
          <strong>해보까</strong>
          <p>로그인해서 보낸 상담 입력과 내 정보는 서버에 저장되고, 상담 문장은 외부 AI(Upstage)로 전송될 수 있어요. 상담 결과 화면의 초기화는 서버에 저장된 탐색 기록과 이 브라우저의 상담·테스트 저장분을 지워요. 계정을 지우면 서버 데이터가 지워지고, 브라우저 저장분은 따로 지워야 해요.</p>
          <p>공고 출처 · 공공데이터포털 K-Startup　|　<Link to="/licenses">오픈소스 라이선스</Link></p>
        </div>
      </footer>
    </div>
  );
}
