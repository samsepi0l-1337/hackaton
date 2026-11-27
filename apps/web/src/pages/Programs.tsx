import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { READINESS_OPTIONS, RESOURCE_SORTS, RESOURCE_SORT_LABEL, RESOURCE_TYPES, dDay, dDayLabel } from '@gil/shared';
import type { ReadinessStage, ResourceCard, ResourceSort, ResourceType } from '@gil/shared';
import { api } from '../api/client';
import { RecruitBadge } from '../components/ResourceView';
import { AREAS, RegionPicker } from '../components/RegionPicker';
import { HeartButton } from '../components/HeartButton';
import { useAuth } from '../components/AuthContext';
import { CardSkeletons, EmptyState, ErrorState } from '../components/States';
import '../styles/pages-programs.css';

const PAGE_SIZE = 10;
const PAGE_WINDOW = 5;

/** 글에 나온 구·군 이름. 긴 이름부터 지워 "강서구"가 "서구"로 잡히지 않게 한다. 2글자 이름(중구 등)은 줄임말을 쓰지 않는다. */
function mentionedDistricts(text: string, districts: string[]): Set<string> {
  let t = text;
  const found = new Set<string>();
  for (const d of [...districts].sort((a, b) => b.length - a.length)) {
    const forms = d.length >= 3 ? [d, d.slice(0, -1)] : [d];
    for (const f of forms) {
      if (t.includes(f)) { found.add(d); t = t.split(f).join(' '); }
    }
  }
  return found;
}

export function Programs() {
  const [sp, setSp] = useSearchParams();
  const type = (RESOURCE_TYPES as readonly string[]).includes(sp.get('type') ?? '') ? (sp.get('type') as ResourceType) : undefined;
  const stage = READINESS_OPTIONS.find((o) => o.value === sp.get('stage'))?.value as ReadinessStage | undefined;
  const sort: ResourceSort = (RESOURCE_SORTS as readonly string[]).includes(sp.get('sort') ?? '') ? (sp.get('sort') as ResourceSort) : 'deadline';
  const region = (sp.get('region') ?? '') in AREAS ? sp.get('region')! : undefined;
  const district = region && AREAS[region].districts.includes(sp.get('district') ?? '') ? sp.get('district')! : undefined;
  const q = sp.get('q') ?? '';
  const pageParam = Math.max(1, Math.floor(Number(sp.get('page')) || 1));
  const [qText, setQText] = useState(q);
  const [items, setItems] = useState<ResourceCard[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [err, setErr] = useState<unknown>(null);
  const { user } = useAuth();
  const [topics, setTopics] = useState<string[]>([]);
  const likedCount = items.filter((x) => x.liked).length;
  useEffect(() => {
    if (!user || sort !== 'fit') { setTopics([]); return; }
    api.likes().then((r) => setTopics(r.topics), () => setTopics([]));
  }, [user, sort, likedCount]);
  const setLiked = (id: string, liked: boolean) => setItems((xs) => xs.map((x) => (x.resource.id === id ? { ...x, liked } : x)));

  const requestId = useRef(0);
  const load = useCallback(() => {
    const id = ++requestId.current;
    setState('loading');
    api.resources({ type, stage, q: q || undefined, sort }).then(
      (r) => { if (id === requestId.current) { setItems(r.items); setState('ready'); } },
      (e) => { if (id === requestId.current) { setErr(e); setState('error'); } },
    );
  }, [type, stage, q, sort, user?.id]);
  useEffect(() => {
    load();
    return () => { requestId.current++; };
  }, [load]);
  useEffect(() => setQText(q), [q]);

  function update(patch: Record<string, string | undefined>) {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
    if (!('page' in patch)) n.delete('page');
    setSp(n);
  }
  const filtered = type || stage || q || region || district;
  const now = new Date();
  const inArea = region ? items.filter((x) => (x.resource.regions as readonly string[]).some((g) => g === region || g === '부울경')) : items;
  const wideIds = new Set<string>();
  let shown = inArea;
  if (region && district) {
    const names = AREAS[region].districts;
    const named: ResourceCard[] = [];
    const wide: ResourceCard[] = [];
    for (const x of inArea) {
      const r = x.resource;
      const m = mentionedDistricts([r.title, r.agency, r.target, r.content, r.procedure].filter(Boolean).join(' '), names);
      if (m.has(district)) named.push(x);
      else if (m.size === 0) { wide.push(x); wideIds.add(r.id); }
    }
    shown = [...named, ...wide];
  }
  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const page = Math.min(pageParam, totalPages);
  const winStart = Math.max(1, Math.min(page - 2, totalPages - PAGE_WINDOW + 1));
  const winEnd = Math.min(totalPages, winStart + PAGE_WINDOW - 1);
  const pageItems = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  function goPage(n: number) {
    update({ page: n > 1 ? String(n) : undefined });
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="container stack programs-page">
      <h1>지역 지원 살펴보기</h1>
      <p className="muted">교육·상담·공간·지원사업 중 공식 자료로 확인한 경로예요. 로그인 없이 볼 수 있어요.</p>
      <form className="row" onSubmit={(e) => { e.preventDefault(); update({ q: qText.trim() || undefined }); }}>
        <label className="sr-only" htmlFor="rq">키워드 검색</label>
        <input id="rq" className="input grow" type="search" placeholder="기관·제목·지원 내용 검색" value={qText} onChange={(e) => setQText(e.target.value)} />
        <button className="btn primary">검색</button>
      </form>
      <div className="grid cols-2">
        <div className="field">
          <label className="label" htmlFor="rt">유형</label>
          <select id="rt" className="input" value={type ?? ''} onChange={(e) => update({ type: e.target.value || undefined })}>
            <option value="">전체</option>
            {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="rs">준비 단계</label>
          <select id="rs" className="input" value={stage ?? ''} onChange={(e) => update({ stage: e.target.value || undefined })}>
            <option value="">전체</option>
            {READINESS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="rr">지역</label>
          <RegionPicker id="rr" region={region} district={district} onChange={(r, d) => update({ region: r, district: d })} />
        </div>
        <div className="field">
          <label className="label" htmlFor="ro">정렬</label>
          <select id="ro" className="input" value={sort} onChange={(e) => update({ sort: e.target.value === 'deadline' ? undefined : e.target.value })}>
            {RESOURCE_SORTS.map((s) => <option key={s} value={s}>{RESOURCE_SORT_LABEL[s]}</option>)}
          </select>
        </div>
      </div>
      {sort === 'fit' && (
        <p className="muted" role="note">
          {!user ? '로그인하고 하트(♡)를 누르면, 누른 공고와 비슷한 공고와 내 정보 조건에 맞는 공고가 앞에 나와요.'
            : topics.length ? `하트 누른 공고에서 읽은 관심: ${topics.join(' · ')}. 내 정보 조건과 창업 준비 단계도 함께 봐요.`
            : '마음에 드는 공고에 하트(♡)를 누르면 비슷한 공고가 앞에 나와요. 지금은 내 정보 조건과 창업 준비 단계로만 정렬해요.'}
          {user && <> <Link to="/me">내 정보 고치기</Link></>}
        </p>
      )}
      {filtered && <button className="btn small ghost" onClick={() => setSp(sort === 'deadline' ? new URLSearchParams() : new URLSearchParams({ sort }))}>조건 모두 지우기</button>}

      {state === 'loading' && <CardSkeletons count={3} />}
      {state === 'error' && <ErrorState error={err} onRetry={load} />}
      {state === 'ready' && shown.length === 0 && (
        <EmptyState message="현재 확인된 자료에서 맞는 경로를 찾지 못했어요." action={<Link className="btn primary" to="/mentor">창업 준비 안내 받기</Link>} />
      )}
      {state === 'ready' && (
        <div className="grid cols-2">
          {pageItems.map(({ resource: r, views, liked }) => {
            const d = r.recruitStatus === 'closed' ? -1 : dDay(r.endDate, now);
            return (
            <article key={r.id} className="card stack program-card">
              <div className="row"><span className="tag">{r.type}</span><RecruitBadge status={r.recruitStatus} />{wideIds.has(r.id) && <span className="tag">{region} 전역</span>}<HeartButton id={r.id} title={r.title} liked={!!liked} onChange={(v) => setLiked(r.id, v)} /></div>
              <h3 style={{ margin: 0 }}><Link to={`/programs/${encodeURIComponent(r.id)}`}>{r.title}</Link></h3>
              <p className="muted">{r.agency}</p>
              <p>{r.content}</p>
              <p className="muted">
                {r.endDate && (d !== null && d >= 0 && d <= 7
                  ? <span className="badge dday-soon">{d === 0 ? '오늘 마감' : dDayLabel(d)}</span>
                  : <span className="badge">{dDayLabel(d)}</span>)} {r.startDate && `등록 ${r.startDate} · `}{r.endDate ? `마감 ${r.endDate}` : '마감일 확인 필요'} · 조회 {views ?? 0}
              </p>
              <p className="muted">확인일 {r.checkedAt ?? '확인 필요'}{r.test && ' · 팀 검수 전 테스트 자료'}</p>
              <Link className="btn small" to={`/programs/${encodeURIComponent(r.id)}`}>자세히</Link>
            </article>
            );
          })}
        </div>
      )}
      {state === 'ready' && totalPages > 1 && (
        <nav className="row" aria-label="페이지" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          {winStart > 1 && <button className="btn small" onClick={() => goPage(1)}>처음</button>}
          <button className="btn small" disabled={page <= 1} onClick={() => goPage(page - 1)}>이전</button>
          {Array.from({ length: winEnd - winStart + 1 }, (_, i) => winStart + i).map((n) => (
            <button key={n} className={`btn small${n === page ? ' primary' : ''}`} aria-current={n === page ? 'page' : undefined} onClick={() => goPage(n)}>{n}</button>
          ))}
          <button className="btn small" disabled={page >= totalPages} onClick={() => goPage(page + 1)}>다음</button>
          {winEnd < totalPages && <button className="btn small" onClick={() => goPage(totalPages)}>끝</button>}
        </nav>
      )}
    </div>
  );
}
