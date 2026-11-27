import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DIRECTION_STATUS_LABEL } from '@gil/shared';
import type { ChatMessage, ConsultQuota, DirectionStatus, ExploreChatRequest, ExploreSession, SummaryV2 } from '@gil/shared';
import type { ProblemCard } from '@gil/shared';
import { api, ApiClientError } from '../api/client';
import type { FocusInfo } from '../api/client';
import { FocusBanner } from './StartStep';
import { Field } from '../components/TextField';
import { errMessage } from '../lib/format';
import { ITEM_LABEL, Progress, ProblemLine, item } from './Common';
import { patchStore, readStore, toInfo } from './storage';
import type { ProblemInfo } from './storage';
import { QUOTA_NOTE, QuotaLine, resetDate } from './Quota';

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
  onChange: (direction: string | null, status: DirectionStatus) => Promise<boolean>;
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
                  <button className="btn primary small" disabled={!text.trim()} onClick={async () => { if (await onChange(text.trim(), 'user')) setEditing(null); }}>수정한 내용 저장</button>
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

export function ChatStep({ session, problem: card, quota, focus, onFocusRemoved, onSession, onQuota, onRefreshQuota, onBackToStart, onSummary }: {
  session: ExploreSession; problem: ProblemCard | null; quota: ConsultQuota | null;
  focus: FocusInfo | null; onFocusRemoved: () => void;
  onSession: (s: ExploreSession) => void; onQuota: (q: ConsultQuota) => void; onRefreshQuota: () => void;
  onBackToStart: () => void; onSummary: (s: SummaryV2) => void;
}) {
  const problem: ProblemInfo | null = card ? toInfo(card) : null;
  const [messages, setMessages] = useState<ChatMessage[]>(session.messages);
  const [qIndex, setQIndex] = useState(session.questionIndex);
  const [suggestions, setSuggestions] = useState<string[]>(session.exploration?.suggestions?.length ? session.exploration.suggestions : readStore().suggestions);
  const [input, setInput] = useState(() => readStore().draft);
  const [limit, setLimit] = useState<{ message: string; quota?: ConsultQuota } | null>(null);
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
    setSending(true); setErr(''); setFailed(false); setLimit(null);
    try {
      const r = await api.exploreChat(req);
      onRefreshQuota();
      setMessages(r.messages); setQIndex(r.questionIndex);
      if (r.suggestions.length) setSuggestions(r.suggestions);
      if (r.failed) { setFailed(true); setManual(true); if (text !== undefined) setInput(text); return; }
      // 답을 보낸 요청만 입력칸을 비운다. 건너뛰기·예시 보기 같은 요청은 쓰던 글을 남긴다.
      if (req.message !== undefined) setInput('');
      if (r.done) { await goSummary(); return; }
    } catch (e) {
      if (e instanceof ApiClientError && e.code === 'limit') {
        // 상담 횟수 초과: 입력은 그대로 두고, 이미 만든 요약·지원 경로 목록은 계속 볼 수 있게 한다.
        if (e.quota) onQuota(e.quota);
        setLimit({ message: e.message, quota: e.quota });
        if (text !== undefined) setInput(text);
      } else { setFailed(true); setErr(errMessage(e)); if (text !== undefined) setInput(text); }
    } finally { setSending(false); }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (session.messages.length === 0) void send({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);
  // 보내는 동안 fieldset 이 잠기면 포커스가 페이지 처음으로 빠진다. 끝나면 답변 칸으로 돌려준다.
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const wasSending = useRef(false);
  useEffect(() => {
    if (wasSending.current && !sending && (document.activeElement === document.body || document.activeElement === null)) answerRef.current?.focus();
    wasSending.current = sending;
  }, [sending]);
  useEffect(() => { patchStore({ messages, questionIndex: qIndex, suggestions }); }, [messages, qIndex, suggestions]);
  useEffect(() => {
    const t = window.setTimeout(() => patchStore({ draft: input }), 400);
    return () => window.clearTimeout(t);
  }, [input]);

  // 질문 문장은 다시 쓰지 않는다 (2026-11-27 평가: AI 가 다시 쓰면 뜻이 바뀜). 서버가 반응 한 문장 + 규칙 질문을 보낸다.

  async function setDir(d: string | null, status: DirectionStatus): Promise<boolean> {
    try {
      onSession(await api.saveExploration({ direction: d, directionStatus: status }));
      setDirection({ text: d, status });
      return true;
    } catch (e) { setErr(errMessage(e)); return false; }
  }
  // 다시 시도: 답을 보냈던 요청이면 지금 입력칸의 글을 보낸다 (실패 뒤에 고쳤을 수 있다).
  function retry() {
    const req = last.current.message !== undefined && input.trim() ? { ...last.current, message: input.trim() } : last.current;
    void send(req, input);
  }

  const lastMentor = [...messages].reverse().find((m) => m.role === 'mentor');
  const n = Math.min((lastMentor?.questionIndex ?? qIndex) + 1, max);
  const answered = messages.some((m) => m.role === 'user' && !m.skipped);

  return (
    <div className="stack">
      <Progress current={1} onGo={onBackToStart} />
      {focus && <FocusBanner focus={focus} start={session.start} onRemoved={onFocusRemoved} />}
      {(problem || session.exploration?.customProblem) && (
        <section className="card stack" aria-label="선택한 문제">
          <span className="muted">내가 고른 문제</span>
          {problem ? <ProblemLine p={problem} /> : <div><strong>{session.exploration?.customProblem}</strong><div className="muted">직접 적은 문제 · 외부 검증 전</div></div>}
          <button className="btn small" onClick={onBackToStart}>다른 문제 보기</button>
        </section>
      )}

      <p className="muted" aria-live="polite">질문 {n}/{max}</p>
      <QuotaLine quota={quota} />
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
            <button className="btn primary" onClick={retry} disabled={sending}>다시 시도</button>
            <button className="btn" onClick={() => setManual(true)}>직접 정리하기</button>
          </div>
        </div>
      )}
      {limit && (
        <div className="card stack" role="alert">
          <p style={{ margin: 0 }}><strong>이번 주 상담 횟수를 모두 사용했어요.</strong> {limit.message}</p>
          {(limit.quota?.resetAt ?? quota?.resetAt) && <p style={{ margin: 0 }}>{resetDate(limit.quota?.resetAt ?? quota?.resetAt ?? null)} 이후에 다시 상담할 수 있어요.</p>}
          <p className="muted">입력한 내용은 이 기기에 그대로 남아 있어요. {QUOTA_NOTE}</p>
          <div className="row">
            {session.summary && <button className="btn primary" onClick={() => onSummary(session.summary!)}>이미 만든 구상 요약 보기</button>}
            <Link className="btn" to="/programs">지역 지원 목록 보기</Link>
            <button className="btn" onClick={retry} disabled={sending}>다시 확인</button>
            <button className="btn ghost" onClick={onBackToStart}>이전</button>
          </div>
        </div>
      )}
      {!failed && err && <p className="error-text" role="alert">{err}</p>}

      <fieldset className="stack" disabled={sending || !!limit} style={{ border: 0, padding: 0, margin: 0 }}>
        <Field label="내 답변" hint="편하게 적어 주세요. 모르면 아래 버튼을 눌러도 돼요.">
          <textarea ref={answerRef} className="input" rows={3} value={input} onChange={(e) => setInput(e.target.value)} />
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
