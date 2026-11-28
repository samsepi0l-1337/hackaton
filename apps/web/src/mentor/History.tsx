import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ExploreHistoryEntry, ExploreHistoryItem } from '@gil/shared';
import { api } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CardSkeletons, ErrorState } from '../components/States';
import { errMessage } from '../lib/format';
import { ResultStep } from './ResultStep';

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });
}

/** 상담 시작 화면의 '지난 상담' 목록. 보관한 상담이 없으면 아무것도 그리지 않는다. */
export function PastConsults() {
  const [items, setItems] = useState<ExploreHistoryItem[]>([]);
  const [drop, setDrop] = useState<ExploreHistoryItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { api.exploreHistory().then((r) => setItems(r.items), () => {}); }, []);
  if (items.length === 0) return null;
  async function remove() {
    if (!drop) return;
    setBusy(true); setErr('');
    try { const r = await api.deleteExploreHistory(drop.id); setItems(r.items); setDrop(null); } catch (e) { setErr(errMessage(e)); } finally { setBusy(false); }
  }
  return (
    <section className="card stack" aria-labelledby="past">
      <h2 id="past" style={{ margin: 0 }}>지난 상담</h2>
      <p className="muted" style={{ margin: 0 }}>‘처음부터 새 상담’으로 보관한 결과예요. 최근 5개까지 남아요.</p>
      <ul className="past-list">
        {items.map((h) => (
          <li key={h.id}>
            <Link to={`/mentor/history/${encodeURIComponent(h.id)}`}>
              <strong>{h.title}</strong>
              <small className="muted">{[when(h.archivedAt), h.problemTitle].filter(Boolean).join(' · ')}</small>
            </Link>
            <button className="btn small ghost" type="button" onClick={() => setDrop(h)} aria-label={h.title + ' 지우기'}>지우기</button>
          </li>
        ))}
      </ul>
      {err && <p className="error-text" role="alert">{err}</p>}
      {drop && (
        <ConfirmDialog title="이 지난 상담을 지울까요?" confirmLabel="지우기" danger busy={busy} onConfirm={remove} onCancel={() => setDrop(null)}>
          <p>‘{drop.title}’ 결과가 지워지고 되돌릴 수 없어요. 지금 진행 중인 상담은 그대로예요.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

/** /mentor/history/:id — 보관한 상담 결과를 읽기 전용으로 보여 준다. */
export function MentorHistory() {
  const { id = '' } = useParams();
  const [entry, setEntry] = useState<ExploreHistoryEntry | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { setError(null); api.exploreHistoryEntry(id).then(setEntry, setError); }, [id, tick]);
  if (error) return <div className="stack"><ErrorState error={error} onRetry={() => setTick(tick + 1)} /><p><Link to="/mentor">AI 창업 상담으로 돌아가기</Link></p></div>;
  if (!entry || !entry.result.summary) return <div className="stack"><CardSkeletons count={3} /></div>;
  return (
    <div>
      <ResultStep archived={entry} summary={entry.result.summary} problemTitle={entry.problemTitle ?? undefined} onEditSummary={() => {}} onMissingSummary={() => {}} />
    </div>
  );
}
