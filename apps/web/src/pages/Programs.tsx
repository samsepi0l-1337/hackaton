import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { READINESS_OPTIONS, RESOURCE_SORTS, RESOURCE_SORT_LABEL, RESOURCE_TYPES, dDay, dDayLabel } from '@gil/shared';
import type { ReadinessStage, ResourceCard, ResourceSort, ResourceType } from '@gil/shared';
import { api } from '../api/client';
import { RecruitBadge } from '../components/ResourceView';
import { CardSkeletons, EmptyState, ErrorState } from '../components/States';

const PAGE_SIZE = 10;

export function Programs() {
  const [sp, setSp] = useSearchParams();
  const type = (RESOURCE_TYPES as readonly string[]).includes(sp.get('type') ?? '') ? (sp.get('type') as ResourceType) : undefined;
  const stage = READINESS_OPTIONS.find((o) => o.value === sp.get('stage'))?.value as ReadinessStage | undefined;
  const sort: ResourceSort = (RESOURCE_SORTS as readonly string[]).includes(sp.get('sort') ?? '') ? (sp.get('sort') as ResourceSort) : 'deadline';
  const q = sp.get('q') ?? '';
  const pageParam = Math.max(1, Math.floor(Number(sp.get('page')) || 1));
  const [qText, setQText] = useState(q);
  const [items, setItems] = useState<ResourceCard[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [err, setErr] = useState<unknown>(null);

  const load = useCallback(() => {
    setState('loading');
    api.resources({ type, stage, q: q || undefined, sort }).then(
      (r) => { setItems(r.items); setState('ready'); },
      (e) => { setErr(e); setState('error'); },
    );
  }, [type, stage, q, sort]);
  useEffect(load, [load]);
  useEffect(() => setQText(q), [q]);

  function update(patch: Record<string, string | undefined>) {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
    if (!('page' in patch)) n.delete('page');
    setSp(n);
  }
  const filtered = type || stage || q;
  const now = new Date();
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(pageParam, totalPages);
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  function goPage(n: number) {
    update({ page: n > 1 ? String(n) : undefined });
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="container stack">
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
      </div>
      <div className="row" role="group" aria-label="정렬" style={{ flexWrap: 'wrap' }}>
        {RESOURCE_SORTS.map((s) => (
          <button key={s} type="button" className={`btn small${s === sort ? ' primary' : ''}`} aria-pressed={s === sort} onClick={() => update({ sort: s === 'deadline' ? undefined : s })}>{RESOURCE_SORT_LABEL[s]}</button>
        ))}
      </div>
      {filtered && <button className="btn small ghost" onClick={() => setSp(sort === 'deadline' ? new URLSearchParams() : new URLSearchParams({ sort }))}>조건 모두 지우기</button>}

      {state === 'loading' && <CardSkeletons count={3} />}
      {state === 'error' && <ErrorState error={err} onRetry={load} />}
      {state === 'ready' && items.length === 0 && (
        <EmptyState message="현재 확인된 자료에서 맞는 경로를 찾지 못했어요." action={<Link className="btn primary" to="/mentor">창업 준비 안내 받기</Link>} />
      )}
      {state === 'ready' && (
        <div className="grid cols-2">
          {pageItems.map(({ resource: r, views }) => {
            const d = r.recruitStatus === 'closed' ? -1 : dDay(r.endDate, now);
            return (
            <article key={r.id} className="card stack">
              <div className="row"><span className="tag">{r.type}</span><RecruitBadge status={r.recruitStatus} /></div>
              <h3 style={{ margin: 0 }}><Link to={`/programs/${encodeURIComponent(r.id)}`}>{r.title}</Link></h3>
              <p className="muted">{r.agency}</p>
              <p>{r.content}</p>
              <p className="muted">
                {r.endDate && <span className="badge">{dDayLabel(d)}</span>} {r.startDate && `등록 ${r.startDate} · `}{r.endDate ? `마감 ${r.endDate}` : '마감일 확인 필요'} · 조회 {views ?? 0}
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
          <button className="btn small" disabled={page <= 1} onClick={() => goPage(page - 1)}>이전</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button key={n} className={`btn small${n === page ? ' primary' : ''}`} aria-current={n === page ? 'page' : undefined} onClick={() => goPage(n)}>{n}</button>
          ))}
          <button className="btn small" disabled={page >= totalPages} onClick={() => goPage(page + 1)}>다음</button>
        </nav>
      )}
    </div>
  );
}
