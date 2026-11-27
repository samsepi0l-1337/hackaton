import { useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { BufsFeedbackItem, BufsFeedbackResponse } from '@gil/shared';
import { api, ApiClientError } from '../api/client';
import { TextField } from '../components/TextField';
import { CardSkeletons, ErrorState } from '../components/States';
import { errMessage } from '../lib/format';
import '../styles/pages-account.css';

const PAGE = 20;
const yn = (v: boolean | null) => (v === null ? '-' : v ? '예' : '아니오');
const pct = (v: number | null) => (v === null ? '-' : `${Math.round(v * 100)}%`);
const avg = (v: number | null) => (v === null ? '-' : v.toFixed(1));
const ba = (v: { before?: number; after?: number } | null) => (v && (v.before !== undefined || v.after !== undefined) ? `${v.before ?? '-'} → ${v.after ?? '-'}` : '-');
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ko-KR'); };

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="card"><div className="muted">{label}</div><strong style={{ fontSize: 'var(--font-size-lg)' }}>{value}</strong></div>;
}

function rows(it: BufsFeedbackItem): [string, ReactNode][] {
  return [
    ['시각', when(it.createdAt)], ['사용자', it.user], ['시작 상태', it.readiness ?? '-'], ['문제', it.problemId ?? '-'], ['검토 지역', it.reviewRegion ?? '-'],
    ['도움 됨', `${yn(it.helpful)}${it.reason ? ` · ${it.reason}` : ''}`], ['방향이 정리됨', yn(it.directionClear)], ['더 알아볼 것', it.wantToExplore ?? '-'],
    ['준비할 것 이해(전→후)', ba(it.knowWhatToPrepare)], ['지역 검토 의향(전→후)', ba(it.regionIntent)],
    ['지역 경로 발견', `${yn(it.foundRegionalPath)}${it.pathName ? ` · ${it.pathName}` : ''}`],
  ];
}

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await api.bufsLogin(password); setPassword(''); onDone(); } catch (x) {
      if (x instanceof ApiClientError && x.status === 429) setErr(`로그인 시도가 너무 많아 잠겼어요. 잠시 뒤에 다시 시도해 주세요. ${x.message}`);
      else if (x instanceof ApiClientError && (x.status === 401 || x.status === 403)) setErr('비밀번호가 맞지 않아요');
      else setErr(errMessage(x));
    } finally { setBusy(false); }
  }
  return (
    <div className="container account-page narrow">
      <h1>관리자</h1>
      <form className="card" onSubmit={submit} noValidate>
        <TextField label="관리자 비밀번호" type="password" autoComplete="current-password" value={password} onChange={setPassword} error={err} />
        <button className="btn primary block" disabled={busy || !password}>{busy ? '확인 중...' : '들어가기'}</button>
      </form>
    </div>
  );
}

function Board({ onLogout }: { onLogout: () => void }) {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<BufsFeedbackResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let dead = false;
    setError(null);
    setData(null); // 다음 페이지가 올 때까지 이전 줄을 새 번호로 보여 주지 않는다.
    api.bufsFeedback(PAGE, offset).then((d) => { if (!dead) setData(d); }, (e) => {
      if (dead) return;
      if (e instanceof ApiClientError && (e.status === 401 || e.status === 403)) onLogout(); else setError(e);
    });
    return () => { dead = true; };
  }, [offset, tick, onLogout]);

  async function logout() { await api.bufsLogout().catch(() => {}); onLogout(); }

  const s = data?.summary;
  const last = data ? Math.min(offset + PAGE, data.total) : 0;
  return (
    <div className="container stack account-page">
      <div className="row between"><h1 style={{ margin: 0 }}>의견 모아보기</h1><button className="btn" onClick={logout}>로그아웃</button></div>
      {error ? <ErrorState error={error} onRetry={() => setTick((t) => t + 1)} /> : !data || !s ? <CardSkeletons count={2} /> : (
        <>
          <div className="grid cols-2">
            <Stat label="도움 됨 비율" value={pct(s.helpfulRate)} />
            <Stat label="방향 정리 비율" value={pct(s.directionClearRate)} />
            <Stat label="지역 경로 발견 비율" value={pct(s.foundPathRate)} />
            <Stat label="지역 검토 의향 평균 (전 → 후)" value={`${avg(s.regionIntentAvg.before)} → ${avg(s.regionIntentAvg.after)}`} />
          </div>
          <p className="muted">전체 {data.total}건 · 최신순{data.total > 0 && ` · ${offset + 1}~${last}번째`}</p>
          {data.items.length === 0 ? <p className="card">아직 받은 의견이 없어요.</p> : (
            <>
              <div className="bufs-table" style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--font-size-sm)' }}>
                  <thead><tr>{['시각', '사용자', '시작 상태', '문제', '검토 지역', '도움 됨·이유', '방향 정리', '더 알아볼 것', '준비 이해(전→후)', '지역 의향(전→후)', '지역 경로'].map((h) => <th key={h} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--color-border)' }}>{h}</th>)}</tr></thead>
                  <tbody>{data.items.map((it) => <tr key={it.id}>{rows(it).map(([k, v]) => <td key={k} style={{ padding: 8, borderBottom: '1px solid var(--color-border)', verticalAlign: 'top' }}>{v}</td>)}</tr>)}</tbody>
                </table>
              </div>
              <div className="bufs-cards stack">
                {data.items.map((it) => (
                  <div className="card" key={it.id}>
                    <dl style={{ margin: 0 }}>{rows(it).map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0' }}><dt className="muted">{k}</dt><dd style={{ margin: 0, textAlign: 'right' }}>{v}</dd></div>)}</dl>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="row">
            <button className="btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>이전</button>
            <button className="btn" disabled={last >= data.total} onClick={() => setOffset(offset + PAGE)}>다음</button>
          </div>
        </>
      )}
    </div>
  );
}

/** /bufs: 관리자 비밀번호 로그인 후 의견 목록. 비밀번호는 클라이언트에 저장하지 않는다. */
export function Bufs() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [error, setError] = useState<unknown>(null);
  const check = useCallback(() => { setError(null); api.bufsMe().then((r) => setAdmin(r.admin), (e) => { setAdmin(false); setError(e); }); }, []);
  useEffect(check, [check]);
  const out = useCallback(() => setAdmin(false), []);
  if (admin === null) return <div className="container account-page"><CardSkeletons count={2} /></div>;
  return admin ? <Board onLogout={out} /> : <>{error ? <div className="container account-page narrow"><ErrorState error={error} onRetry={check} /></div> : null}<Login onDone={() => setAdmin(true)} /></>;
}
