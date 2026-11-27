import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AGE_MAX, AGE_MIN, STAGES, VERDICT_LABEL } from '@gil/shared';
import type { ProgramCard as Card, ProgramListQuery, Verdict } from '@gil/shared';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../components/AuthContext';
import { ProgramCard } from '../components/ProgramCard';
import { Chip, ChipGroup } from '../components/Chips';
import { CardSkeletons, EmptyState, ErrorState } from '../components/States';
import { Field } from '../components/TextField';

const DUE_LABEL = { '7': '7일 이내', '30': '30일 이내', always: '상시' } as const;
const SORT_LABEL = { deadline: '마감 임박순', latest: '최신 등록순' } as const;

function readQuery(sp: URLSearchParams): ProgramListQuery {
  const g = (k: string) => sp.get(k) || undefined;
  const age = Number(sp.get('age'));
  return {
    q: g('q'),
    region: g('region') as ProgramListQuery['region'],
    category: g('category'),
    stage: g('stage') as ProgramListQuery['stage'],
    age: sp.get('age') && Number.isFinite(age) ? age : undefined,
    due: g('due') as ProgramListQuery['due'],
    verdict: g('verdict') as Verdict | undefined,
    sort: (g('sort') as ProgramListQuery['sort']) ?? 'deadline',
    includeClosed: sp.get('includeClosed') === '1',
  };
}

export function Programs() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const query = readQuery(sp);
  const key = sp.toString();
  const [items, setItems] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [err, setErr] = useState<unknown>(null);
  const [more, setMore] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [qText, setQText] = useState(query.q ?? '');
  const categories = useAsync(() => api.categories(), []);
  const profile = useAsync(() => (user ? api.session() : Promise.resolve(null)), [user?.id]);
  const hasProfile = !!profile.data?.profileComplete;

  const load = useCallback(() => {
    setState('loading');
    api.programs(readQuery(new URLSearchParams(key))).then(
      (r) => { setItems(r.items); setTotal(r.total); setNext(r.nextOffset); setState('ready'); },
      (e) => { setErr(e); setState('error'); },
    );
  }, [key]);
  useEffect(load, [load]);
  useEffect(() => setQText(query.q ?? ''), [query.q]);

  async function loadMore() {
    if (next === null) return;
    setMore(true);
    try {
      const r = await api.programs({ ...query, offset: next });
      setItems((cur) => [...cur, ...r.items]);
      setNext(r.nextOffset);
    } catch (e) { setErr(e); setState('error'); } finally { setMore(false); }
  }

  function update(patch: Record<string, string | undefined>) {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
    setSp(n);
  }

  const chips: { label: string; clear: Record<string, undefined> }[] = [];
  if (query.region) chips.push({ label: `지역: ${query.region}`, clear: { region: undefined } });
  if (query.category) chips.push({ label: `분야: ${query.category}`, clear: { category: undefined } });
  if (query.stage) chips.push({ label: `단계: ${STAGES.find((s) => s.value === query.stage)?.label ?? query.stage}`, clear: { stage: undefined } });
  if (query.age !== undefined) chips.push({ label: `나이: 만 ${query.age}세`, clear: { age: undefined } });
  if (query.due) chips.push({ label: `마감: ${DUE_LABEL[query.due] ?? query.due}`, clear: { due: undefined } });
  if (query.verdict) chips.push({ label: `판정: ${VERDICT_LABEL[query.verdict] ?? query.verdict}`, clear: { verdict: undefined } });

  const toggleVal = <K extends string>(k: string, cur: K | undefined, v: K) => update({ [k]: cur === v ? undefined : v });

  return (
    <div className="container stack">
      <h1>공고 모음</h1>
      {!hasProfile && (
        <div className="banner row between">
          <span>상담을 하면 내가 지원 가능한지 바로 보여드려요</span>
          <Link className="btn small primary" to="/mentor">상담하기</Link>
        </div>
      )}
      <form className="row" onSubmit={(e) => { e.preventDefault(); update({ q: qText.trim() || undefined }); }}>
        <input className="input grow" type="search" placeholder="공고명·기관·지원 내용 검색" value={qText} onChange={(e) => setQText(e.target.value)} />
        <button className="btn primary">검색</button>
        <button type="button" className="btn" onClick={() => setSheet(true)}>필터</button>
      </form>
      <div className="row">
        {query.q && <Chip removable onClick={() => update({ q: undefined })}>검색: {query.q}</Chip>}
        {chips.map((c) => <Chip key={c.label} removable onClick={() => update(c.clear)}>{c.label}</Chip>)}
        {(chips.length > 0 || query.q) && <button className="btn small ghost" onClick={() => setSp(new URLSearchParams())}>모두 지우기</button>}
      </div>
      <div className="row between">
        <strong>{query.includeClosed ? '전체' : '모집 중'} {state === 'ready' ? total : '-'}개</strong>
        <div className="row">
          <label className="check muted"><input type="checkbox" checked={!!query.includeClosed} onChange={(e) => update({ includeClosed: e.target.checked ? '1' : undefined })} />마감 공고 보기</label>
          <select className="input" style={{ width: 'auto', minHeight: 34 }} value={query.sort} onChange={(e) => update({ sort: e.target.value === 'deadline' ? undefined : e.target.value })} aria-label="정렬">
            {Object.entries(SORT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      {state === 'loading' && <CardSkeletons count={4} />}
      {state === 'error' && <ErrorState error={err} onRetry={load} />}
      {state === 'ready' && items.length === 0 && (
        <EmptyState message="조건에 맞는 공고가 없어요." action={<div className="row" style={{ justifyContent: 'center' }}><button className="btn" onClick={() => setSp(new URLSearchParams())}>필터 초기화</button><Link className="btn primary" to="/mentor">상담 시작</Link></div>} />
      )}
      {state === 'ready' && (
        <div className="grid cols-2">{items.map((c) => <ProgramCard key={c.program.id} card={c} />)}</div>
      )}
      {state === 'ready' && next !== null && (
        <button className="btn block" disabled={more} onClick={loadMore}>{more ? '불러오는 중...' : '20개 더 보기'}</button>
      )}

      {sheet && (
        <div className="overlay" onClick={() => setSheet(false)}>
          <div className="sheet stack" role="dialog" aria-label="필터" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: 0 }}>필터</h2>
            <Field label="지역"><ChipGroup options={['부산', '전국'] as const} allowClear value={query.region} onChange={(v) => update({ region: v })} /></Field>
            <Field label="지원 분야"><ChipGroup options={categories.data?.categories ?? []} allowClear value={query.category} onChange={(v) => update({ category: v })} /></Field>
            <Field label="창업 단계">
              <ChipGroup options={STAGES.map((s) => s.value)} labels={Object.fromEntries(STAGES.map((s) => [s.value, s.label]))} allowClear value={query.stage} onChange={(v) => update({ stage: v })} />
            </Field>
            <Field label="대상 연령">
              <input className="input" type="number" min={AGE_MIN} max={AGE_MAX} placeholder="만 나이" value={query.age ?? ''} onChange={(e) => update({ age: e.target.value || undefined })} />
            </Field>
            <Field label="마감 기간"><ChipGroup options={['7', '30', 'always'] as const} labels={DUE_LABEL} allowClear value={query.due} onChange={(v) => toggleVal('due', query.due, v ?? 'always')} /></Field>
            {hasProfile && (
              <Field label="내 판정"><ChipGroup options={['eligible', 'check', 'ineligible'] as const} labels={VERDICT_LABEL} allowClear value={query.verdict} onChange={(v) => update({ verdict: v })} /></Field>
            )}
            <button className="btn primary block" onClick={() => setSheet(false)}>결과 보기 ({state === 'ready' ? total : '...'}개)</button>
          </div>
        </div>
      )}
    </div>
  );
}
