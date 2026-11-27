import { useState } from 'react';
import { DIRECTION_STATUS_LABEL } from '@gil/shared';
import type { SummaryV2 } from '@gil/shared';
import { api } from '../api/client';
import { BottomBar } from '../components/BottomBar';
import { errMessage } from '../lib/format';
import { EvidenceBadge, ITEM_LABEL, Progress, ProvBadge, getItem, withItem } from './Common';
import type { ItemKey } from './Common';

const MAIN: ItemKey[] = ['interest', 'target', 'value', 'unknowns'];
const EXPLORE: ItemKey[] = ['reason', 'direction', 'hypotheses'];

export function SummaryEditor({ summary, onChange, keys }: { summary: SummaryV2; onChange: (s: SummaryV2) => void; keys: ItemKey[] }) {
  const [editing, setEditing] = useState<ItemKey | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save(k: ItemKey) {
    setBusy(true); setErr('');
    try {
      const next = withItem(summary, k, text);
      const r = await api.saveSummary(next);
      onChange(r.summary ?? next);
      setEditing(null);
    } catch (e) { setErr(errMessage(e)); } finally { setBusy(false); }
  }

  return (
    <>
      {keys.map((k) => {
        const it = getItem(summary, k);
        const dirStatus = k === 'direction' ? summary.exploration.direction.status : null;
        return (
          <div key={k} className="summary-item stack">
            <div className="row between">
              <strong>{ITEM_LABEL[k]}</strong>
              <span className="row">
                <ProvBadge p={it.provenance} />
                {dirStatus && <span className="badge">{DIRECTION_STATUS_LABEL[dirStatus]}</span>}
              </span>
            </div>
            {editing === k ? (
              <div className="stack">
                <label className="sr-only" htmlFor={`ed-${k}`}>{ITEM_LABEL[k]} 수정</label>
                <textarea id={`ed-${k}`} className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
                <p className="muted" role="note">수정하면 '직접 입력'으로 바뀌고, 준비 안내가 새로 만들어지며 '준비 완료 표시'가 초기화돼요.</p>
                {err && <p className="error-text" role="alert">{err}</p>}
                <div className="row">
                  <button className="btn primary small" disabled={busy} onClick={() => save(k)}>{busy ? '저장 중...' : '저장'}</button>
                  <button className="btn small" disabled={busy} onClick={() => setEditing(null)}>취소</button>
                </div>
              </div>
            ) : (
              <>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{it.text || (k === 'direction' ? '아직 탐색 중' : '미정')}</p>
                <div><button className="btn small" onClick={() => { setEditing(k); setText(it.text); setErr(''); }}>{ITEM_LABEL[k]} 수정</button></div>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

export function SummaryStep({ summary, onChange, onBackToChat, onResult }: {
  summary: SummaryV2; onChange: (s: SummaryV2) => void; onBackToChat: () => void; onResult: () => void;
}) {
  const p = summary.exploration.problem;
  return (
    <div className="stack">
      <Progress current={1} />
      <h1>지금까지 정리한 구상</h1>
      <p className="muted">완성된 사업계획서가 아니에요. 지금 알고 있는 것과 앞으로 확인할 것을 나눠 둔 정리예요.</p>

      <section className="card stack highlight" aria-labelledby="dir">
        <h2 id="dir" style={{ margin: 0 }}>내가 선택한 탐색 방향</h2>
        <div className="stack">
          <strong>선택한 문제</strong>
          {p ? (
            <div>
              <div>{p.title}</div>
              <div className="row">{p.evidenceLevel && <EvidenceBadge level={p.evidenceLevel} />}</div>
              <div className="muted">출처: {p.source ? (/^https?:/.test(p.source) ? <a href={p.source} target="_blank" rel="noreferrer">원문 (새 창)</a> : p.source) : '확인 필요'}</div>
            </div>
          ) : <p style={{ margin: 0 }}>아직 탐색 중</p>}
        </div>
        <SummaryEditor summary={summary} onChange={onChange} keys={EXPLORE} />
      </section>

      <section className="card stack" aria-labelledby="four">
        <h2 id="four" style={{ margin: 0 }}>창업 구상 요약</h2>
        <SummaryEditor summary={summary} onChange={onChange} keys={MAIN} />
      </section>

      <button className="btn" onClick={onBackToChat}>대화로 돌아가기</button>
      <BottomBar>
        <button className="btn primary" onClick={onResult}>준비 안내 보기</button>
      </BottomBar>
    </div>
  );
}
