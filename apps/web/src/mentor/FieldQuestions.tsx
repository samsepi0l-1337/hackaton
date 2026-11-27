import { useEffect, useRef, useState } from 'react';
import { FIELD_STATUS_LABEL } from '@gil/shared';
import type { FieldQuestion } from '@gil/shared';
import { LOCAL_AI_NOTE, rewrite } from '../lib/localAi';
import { ProvBadge } from './Common';

/**
 * 현장에 확인할 질문 (선택). 상태는 항상 '현장 확인 전'.
 * 보내기·요청 버튼은 없다. 내가 고친 문장은 이 기기에만 저장하고, 질문 id 가 같으면 다시 만들어도 남는다.
 */
export function FieldQuestions({ questions, edits, onEdit, problemTitle }: {
  questions: FieldQuestion[]; edits: Record<string, string>;
  onEdit: (id: string, text: string | null) => void; problemTitle?: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [soft, setSoft] = useState<Record<string, string>>({});
  const tried = useRef(new Set<string>());
  const list = questions.slice(0, 3);

  // 이 기기의 AI 가 쓸 수 있을 때만 말투를 다듬는다. 내가 고친 문장은 건드리지 않는다.
  useEffect(() => {
    for (const q of list) {
      const key = `${q.id}:${q.question}`;
      if (edits[q.id] !== undefined || tried.current.has(key)) continue;
      tried.current.add(key);
      void rewrite({ task: 'field', original: q.question, facts: [q.purpose, problemTitle ?? ''].filter(Boolean), maxLength: 160 })
        .then((t) => { if (t) setSoft((c) => ({ ...c, [q.id]: t })); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.map((q) => q.id + q.question).join('|')]);

  if (list.length === 0) return null;
  const shown = (q: FieldQuestion) => edits[q.id] ?? soft[q.id] ?? q.question;

  async function copyAll() {
    const body = list.map((q, i) => `${i + 1}. ${shown(q)}\n   (확인하려는 것: ${q.purpose})`).join('\n');
    try { await navigator.clipboard.writeText(`[현장에 확인할 질문 - ${FIELD_STATUS_LABEL}]\n${body}`); setNote('질문을 복사했어요.'); }
    catch { setNote('복사하지 못했어요. 브라우저 권한을 확인해 주세요.'); }
  }

  return (
    <details className="card" aria-labelledby="fq">
      <summary><strong id="fq">현장에 확인할 질문 ({list.length})</strong></summary>
      <div className="stack" style={{ marginTop: 12 }}>
        <p className="muted">준비하는 일을 실제로 하는 분께 먼저 물어볼 만한 질문이에요. 직접 물어보고 답을 정리하기 전까지는 확인되지 않은 상태예요. 이 앱이 질문을 대신 보내지 않아요.</p>
        {list.map((q) => (
          <div key={q.id} className="card stack">
            <div className="row">
              <span className="badge">{FIELD_STATUS_LABEL}</span>
              {q.source === 'ai' && <span className="badge prov-ai">AI 제안·미검증</span>}
              {edits[q.id] !== undefined && <ProvBadge p="user" />}
            </div>
            {editing === q.id ? (
              <div className="stack">
                <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="질문 수정" />
                <div className="row">
                  <button className="btn primary small" disabled={!text.trim()} onClick={() => { onEdit(q.id, text.trim()); setEditing(null); }}>수정한 내용 저장</button>
                  <button className="btn small" onClick={() => setEditing(null)}>취소</button>
                </div>
              </div>
            ) : (
              <>
                <p style={{ margin: 0 }}>{shown(q)}</p>
                {edits[q.id] === undefined && soft[q.id] && <p className="muted" style={{ margin: 0 }}>{LOCAL_AI_NOTE}</p>}
                <p className="muted" style={{ margin: 0 }}>확인하려는 것: {q.purpose}</p>
                <div className="row">
                  <button className="btn small" onClick={() => { setEditing(q.id); setText(shown(q)); }}>수정</button>
                  {edits[q.id] !== undefined && <button className="btn small" onClick={() => onEdit(q.id, null)}>처음 문장으로</button>}
                </div>
              </>
            )}
          </div>
        ))}
        <div className="row"><button className="btn" onClick={copyAll}>질문 모두 복사</button></div>
        {note && <p className="muted" role="status">{note}</p>}
      </div>
    </details>
  );
}
