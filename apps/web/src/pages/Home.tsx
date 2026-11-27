import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { PortalIcon } from '../components/PortalIcons';
import { ACCOUNT_LINKS, FIELD_LINKS, SHORTCUTS, SHORTCUTS_COLLAPSED, STAGE_TABS } from './homeLinks';
import { safeHref } from '../lib/format';

const ddayLabel = (d: number | null) => (d === null ? '상시' : d < 0 ? '마감' : d === 0 ? 'D-DAY' : `D-${d}`);
const ddayClass = (d: number | null) => (d === null ? 'dday-always' : d < 0 ? 'dday-closed' : d <= 7 ? 'dday-soon' : '');

export function Home() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState(0);
  const res = useAsync(() => api.home(), []);
  const sum = res.data;
  const stage = STAGE_TABS[tab];

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const t = q.trim();
    nav(t ? '/programs?q=' + encodeURIComponent(t) : '/programs');
  };

  return (
    <div className="portal-width dashboard">
      <h1 className="sr-only">해보까</h1>
      <div className="top-grid">
        <div className="primary-stack">
          <div className="search-area">
            <form role="search" className="search-pill" onSubmit={onSearch}>
              <div className="search-input">
                <img src="/images/gull.png" alt="" />
                <input aria-label="창업 지원 공고 검색" type="search" placeholder="어떤 창업 지원사업을 찾으세요?" value={q} onChange={(e) => setQ(e.target.value)} />
                <button aria-label="검색"><PortalIcon name="search" size={25} /></button>
              </div>
              <Link to="/mentor">AI 창업멘토</Link>
            </form>
            <p>기관·제목·지원 내용 키워드로 부산 창업 지원사업을 찾아보세요.</p>
            <nav className="first-steps" aria-label="처음 이용 순서">
              <span className="first-steps-label">처음이라면</span>
              <ol>
                <li><Link to="/test"><b aria-hidden="true">1</b>창업 유형 테스트</Link></li>
                <li><Link to="/mentor"><b aria-hidden="true">2</b>AI 창업 상담</Link></li>
                <li><Link to="/programs?sort=fit"><b aria-hidden="true">3</b>맞춤형 공고</Link></li>
              </ol>
              <Link className="first-steps-guide" to="/guide">이용 방법</Link>
            </nav>
          </div>
          <section className="pane shortcuts">
            <div className="pane-title">
              <h2>자주 찾는 서비스</h2>
              <button className="text-action" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                {expanded ? '접기' : '펼쳐보기'}
                <PortalIcon name="grid" size={15} />
              </button>
            </div>
            <div className="shortcut-grid">
              {SHORTCUTS.slice(0, expanded ? SHORTCUTS.length : SHORTCUTS_COLLAPSED).map((s) => (
                <Link key={s.label} to={s.to}>
                  {s.label}
                  <span className={'tile-icon ' + s.color}><PortalIcon name={s.icon} size={18} /></span>
                </Link>
              ))}
            </div>
          </section>
        </div>
        <section className="pane account-panel">
          <h2>하트와 내 정보 조건을<br />참고한 순서로 볼 수 있어요.</h2>
          <div className="account-grid">
            {ACCOUNT_LINKS.map((a) => (
              <Link key={a.label} to={a.to}><span><PortalIcon name={a.icon} size={19} /></span>{a.label}</Link>
            ))}
          </div>
          <Link className="btn primary block" to="/me">내 정보 보기</Link>
        </section>
      </div>
      <div className="lower-grid">
        <section className="pane stage-panel">
          <div className="pane-title">
            <h2>단계별 창업 가이드</h2>
            <PortalIcon name="compass" size={19} />
          </div>
          <div className="stage-tabs">
            {STAGE_TABS.map((t, i) => (
              <button key={t.value} aria-pressed={tab === i} onClick={() => setTab(i)}><span aria-hidden="true">{t.icon}</span>{t.label}</button>
            ))}
          </div>
          <p className="stage-prompt">{stage.prompt}</p>
          <div className="stage-links">
            {stage.links.map((l) => <Link key={l.to} to={l.to}><span><b>{l.label}</b><small>{l.desc}</small></span><PortalIcon name="next" size={15} /></Link>)}
          </div>
        </section>
        <div className="middle-stack">
          <section className="pane service-panel" id="how-to">
            <div className="pane-title">
              <h2>원클릭 창업 상담</h2>
            </div>
            <p>아이디어 정리부터 지원사업 추천까지</p>
            <ol className="process-list">
              <li><PortalIcon name="doc" /><b>사업 정보 입력</b><small>아이디어와 고객</small></li>
              <li><PortalIcon name="chat" /><b>AI 멘토 상담</b><small>질문으로 구체화</small></li>
              <li><PortalIcon name="flag" /><b>경로 최대 3개</b><small>추천과 확인된 출처 링크</small></li>
            </ol>
            <Link className="start-link" to="/mentor">상담 이어서 하기<PortalIcon name="next" size={16} /></Link>
          </section>
          <section className="pane fields-panel">
            <div className="pane-title">
              <h2>유형·키워드로 찾기</h2>
            </div>
            <div className="field-links">
              {FIELD_LINKS.map((f) => <Link key={f.label} to={f.to}>{f.label}</Link>)}
            </div>
          </section>
        </div>
        <div className="right-stack">
          <section className="pane deadline-panel">
            <div className="pane-title">
              <h2>마감일이 가까운 공고</h2>
            </div>
            <div className="live-stats">
              <span>모집 중 <b>{sum ? sum.openCount : '–'}</b>건</span>
              <i></i>
              <span>7일 이내 마감 <b>{sum ? sum.closingThisWeek : '–'}</b>건</span>
            </div>
            {res.loading && (
              <ul className="deadline-list" aria-busy="true" aria-label="불러오는 중">
                {[0, 1, 2].map((i) => <li key={i}><div className="skeleton" style={{ height: 44 }} /></li>)}
              </ul>
            )}
            {res.error && (
              <div className="state" role="alert">
                <p>마감 공고를 불러오지 못했어요. 다시 시도해 주세요.</p>
                <button className="btn small" onClick={res.reload}>다시 시도</button>
              </div>
            )}
            {sum && sum.closingSoon.length === 0 && <p className="muted" style={{ margin: '12px 0 0', minHeight: 108 }}>마감일이 정해진 열린 공고가 없어요. 전체 지원공고에서 다른 공고를 찾아보세요.</p>}
            {sum && sum.closingSoon.length > 0 && (
              <ul className="deadline-list">
                {sum.closingSoon.slice(0, 2).map(({ program: p, dDay }) => (
                  <li key={p.id}>
                    <a title={p.title} href={safeHref(p.url)} target="_blank" rel="noreferrer">
                      <strong>{p.title}</strong>
                      <span className={'badge ' + ddayClass(dDay)}>{ddayLabel(dDay)}</span>
                    </a>
                    <div>
                      <small>{[p.agency, p.region, p.category].filter(Boolean).join(' · ')}</small>
                      <a href={safeHref(p.url)} target="_blank" rel="noreferrer" aria-label={p.title + ' 원문 보기'}>원문 <PortalIcon name="external" size={12} /></a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <Link className="type-banner" to="/test">
            <span>창업 유형 테스트</span>
            <strong>나에게 맞는<br />창업 스타일은?</strong>
            <small>12문항 · 약 1분 <PortalIcon name="next" size={15} /></small>
          </Link>
        </div>
      </div>
    </div>
  );
}
