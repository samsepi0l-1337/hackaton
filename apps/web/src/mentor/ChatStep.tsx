import { useEffect, useRef, useState } from 'react';
import { DIRECTION_STATUS_LABEL } from '@gil/shared';
import type { ChatMessage, DirectionStatus, ExploreChatRequest, ExploreSession, SummaryV2 } from '@gil/shared';
import { api } from '../api/client';
import { Field } from '../components/TextField';
import { errMessage } from '../lib/format';
import { ITEM_LABEL, Progress, ProblemLine, item } from './Common';
import type { ProblemInfo } from './storage';

const MANUAL_KEYS = ['interest', 'target', 'value', 'unknowns'] as const;

/** AI 장애 때 쓰는 직접 정리 양식. 모두 사용자 입력으로 저장한다. */
function ManualForm({ session, problem, onSaved }: { session: ExploreSession; problem: ProblemInfo | null; onSaved: (s: SummaryV2) => void }) {
  const [v, setV] = useState<Record<(typeof MANUAL_KEYS)[number], string>>({ interest: session.start.idea ?? '', target: '', value: '', unknowns: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    const ex = session.exploration;
    const summary: SummaryV2 = {
      interest: item(v.interest), target: item(v.target), value: item(v.value), unknowns: item(v.unknowns),
      exploration: {
        problem: problem ? { title: problem.title, source: problem.source, evidenceLevel: problem.evidenceLevel }
          : ex?.customProblem ? { title: ex.customProblem, source: null, evidenceLevel: '사용자 작성·외부 검증 전' } : null,
        reason: item(ex?.selectionReason ?? ''),
        direction: { ...item(ex?.direction ?? ''), status: (ex?.direction ? ex.directionStatus : 'hold') as DirectionStatus },
        hypotheses: item(''),
      },
    };
    setBusy(true); setErr('');
    try { const r = await api.saveSummary(summary); onSaved(r.summary ?? summary); } catch (e) { setErr(errMessage(e)); } finally { setBusy(false); }
  }
  return (
    <section className="card stack" aria-labelledby="mf">
      <h2 id="mf" style={{ margin: 0 }}>직접 정리하기</h2>
      <p className="muted">비워 둔 칸은 '미정'으로 남아요.</p>
      {MANUAL_KEYS.map((k) => (
        <Field key={k} label={ITEM_LABEL[k]}>
          <textarea className="input" rows={2} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} aria-label={ITEM_LABEL[k]} />
        </Field>
      ))}
      {err && <p className="error-text" role="alert">{err}</p>}
      <button className="btn primary" onClick={save} disabled={busy}>이 내용으로 정리하기</button>
    </section>
  );
}

function Suggestions({ list, status, direction, onChange }: {
  list: string[]; status: DirectionStatus; direction: string | null;
  onChange: (direction: string | null, status: DirectionStatus) => Promise<void>;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [text, setText] = useState('');
  return (
    <section className="stack" aria-labelledby="sg">
      <h3 id="sg" style={{ marginBottom: 0 }}>방향 예시</h3>
      <p className="muted">AI가 낸 예시예요. 고르기 전에는 내 선택으로 저장되지 않아요.</p>
      {list.slice(0, 2).map((s, i) => {
        const chosen = status === 'user_selected' && direction === s;
        return (
          <div key={s} className="card stack">
            <p style={{ margin: 0 }}>{s}</p>
            <div className="row"><span className={`badge ${chosen ? 'prov-user' : 'prov-ai'}`}>{chosen ? DIRECTION_STATUS_LABEL.user_selected : DIRECTION_STATUS_LABEL.ai_suggested}</span></div>
            {editing === i ? (
              <div className="stack">
                <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} aria-label="방향 수정" />
                <div className="row">
                  <button className="btn primary small" disabled={!text.trim()} onClick={async () => { await onChange(text.trim(), 'user'); setEditing(null); }}>수정한 내용 저장</button>
                  <button className="btn small" onClick={() => setEditing(null)}>취소</button>
                </div>
              </div>
            ) : (
              <div className="row">
                <button className="btn small primary" onClick={() => onChange(s, 'user_selected')}>이 방향 선택</button>
                <button className="btn small" onClick={() => { setEditing(i); setText(s); }}>수정</button>
                <button className="btn small" onClick={() => onChange(null, 'hold')}>아직 탐색 중</button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

export function ChatStep({ session, problem, onSession, onBackToStart, onSummary }: {
  session: ExploreSession; problem: ProblemInfo | null;
  onSession: (s: ExploreSession) => void; onBackToStart: () => void; onSummary: (s: SummaryV2) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(session.messages);
  const [qIndex, setQIndex] = useState(session.questionIndex);
  const [suggestions, setSuggestions] = useState<string[]>(session.exploration?.suggestions ?? []);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [err, setErr] = useState('');
  const [manual, setManual] = useState(false);
  const [direction, setDirection] = useState({ text: session.exploration?.direction ?? null, status: (session.exploration?.directionStatus ?? 'hold') as DirectionStatus });
  const last = useRef<ExploreChatRequest>({});
  const started = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const max = session.maxQuestions || 3;

  async function goSummary() {
    setSending(true); setErr('');
    try {
      api.track('chat_done');
      const r = await api.createSummary();
      onSummary(r.summary);
    } catch (e) { setErr(`요약을 만들지 못했어요. ${errMessage(e)}`); setManual(true); } finally { setSending(false); }
  }

  async function send(req: ExploreChatRequest, text?: string) {
    last.current = req;
    setSending(true); setErr(''); setFailed(false);
    try {
      const r = await api.exploreChat(req);
      setMessages(r.messages); setQIndex(r.questionIndex);
      if (r.suggestions.length) setSuggestions(r.suggestions);
      if (r.failed) { setFailed(true); setManual(true); if (text !== undefined) setInput(text); return; }
      setInput('');
      if (r.done) { await goSummary(); return; }
    } catch (e) { setFailed(true); setErr(errMessage(e)); if (text !== undefined) setInput(text); } finally { setSending(false); }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (session.messages.length === 0) void send({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);

  async function setDir(d: string | null, status: DirectionStatus) {
    try {
      onSession(await api.saveExploration({ direction: d, directionStatus: status }));
      setDirection({ text: d, status });
    } catch (e) { setErr(errMessage(e)); }
  }

  const lastMentor = [...messages].reverse().find((m) => m.role === 'mentor');
  const n = Math.min((lastMentor?.questionIndex ?? qIndex) + 1, max);
  const answered = messages.some((m) => m.role === 'user' && !m.skipped);

  return (
    <div className="stack">
      <Progress current={1} />
      {(problem || session.exploration?.customProblem) && (
        <section className="card stack" aria-label="선택한 문제">
          <span className="muted">내가 고른 문제</span>
          {problem ? <ProblemLine p={problem} /> : <div><strong>{session.exploration?.customProblem}</strong><div className="muted">직접 적은 문제 · 외부 검증 전</div></div>}
          <button className="btn small" onClick={onBackToStart}>다른 문제 보기</button>
        </section>
      )}

      <p className="muted" aria-live="polite">질문 {n}/{max}</p>
      <div className="chat" role="log" aria-label="대화">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}${m.skipped ? ' skipped' : ''}`}>
            <span className="sr-only">{m.role === 'mentor' ? '질문: ' : '내 답변: '}</span>{m.skipped ? (m.text || '건너뜀') : m.text}
          </div>
        ))}
        {sending && <div className="bubble mentor" role="status">생각을 정리하는 중이에요...</div>}
        <div ref={endRef} />
      </div>

      {failed && (
        <div className="card stack" role="alert">
          <p style={{ margin: 0 }}>AI 응답을 받지 못했어요. 입력한 내용은 그대로 남아 있어요.{err && ` (${err})`}</p>
          <div className="row">
            <button className="btn primary" onClick={() => send(last.current, input)} disabled={sending}>다시 시도</button>
            <button className="btn" onClick={() => setManual(true)}>직접 정리하기</button>
          </div>
        </div>
      )}
      {!failed && err && <p className="error-text" role="alert">{err}</p>}

      <fieldset className="stack" disabled={sending} style={{ border: 0, padding: 0, margin: 0 }}>
        <Field label="내 답변" hint="편하게 적어 주세요. 모르면 아래 버튼을 눌러도 돼요.">
          <textarea className="input" rows={3} value={input} onChange={(e) => setInput(e.target.value)} />
        </Field>
        <div className="row">
          <button className="btn primary" disabled={!input.trim()} onClick={() => send({ message: input.trim() }, input)}>보내기</button>
          <button className="btn" onClick={() => send({ unknown: true })}>아직 모르겠어요</button>
          <button className="btn" onClick={() => send({ skip: true })}>건너뛰기</button>
          <button className="btn ghost" onClick={onBackToStart}>이전</button>
        </div>
        <p className="muted">'아직 모르겠어요'는 미정으로 남기고, '건너뛰기'는 이 질문을 넘겨요. '이전'은 시작 정보로 돌아가요.</p>
        <div className="row">
          <button className="btn" onClick={() => send({ wantSuggestions: true })}>방향 예시 보기</button>
          {answered && <button className="btn" onClick={() => send({ finish: true })}>지금까지 내용 정리</button>}
        </div>
      </fieldset>

      {suggestions.length > 0 && <Suggestions list={suggestions} status={direction.status} direction={direction.text} onChange={setDir} />}
      {direction.status === 'hold' && suggestions.length > 0 && <p className="muted">방향을 정하지 않아도 준비 안내를 볼 수 있어요. 예시를 모두 고르지 않아도 부적합하다는 뜻이 아니에요.</p>}
      {manual && <ManualForm session={session} problem={problem} onSaved={onSummary} />}
    </div>
  );
}
