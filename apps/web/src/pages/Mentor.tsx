import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ConsultQuota, ExploreOptionsResponse, ExploreSession, ExploreStep, ProblemCard, StartProfile, SummaryV2 } from '@gil/shared';
import '../styles/pages-mentor.css';
import { api } from '../api/client';
import type { FocusSession } from '../api/client';
import { CardSkeletons, ErrorState } from '../components/States';
import { errMessage } from '../lib/format';
import { ITEM_LABEL, ProvBadge, getItem } from '../mentor/Common';
import { adoptServer, hasLocalProgress, patchStore, readStore } from '../mentor/storage';
import type { Store } from '../mentor/storage';

const loadChat = () => import('../mentor/ChatStep');
const loadResult = () => import('../mentor/ResultStep');
const loadStart = () => import('../mentor/StartStep');
const loadSummary = () => import('../mentor/SummaryStep');
const ChatStep = lazy(() => loadChat().then((m) => ({ default: m.ChatStep })));
const ResultStep = lazy(() => loadResult().then((m) => ({ default: m.ResultStep })));
const StartStep = lazy(() => loadStart().then((m) => ({ default: m.StartStep })));
const SummaryStep = lazy(() => loadSummary().then((m) => ({ default: m.SummaryStep })));

const EMPTY: FocusSession = { step: 'start', start: {}, exploration: null, messages: [], questionIndex: 0, maxQuestions: 3, summary: null, regional: null, updatedAt: null };

interface Boot {
  opts: ExploreOptionsResponse; session: FocusSession; start: StartProfile; view: ExploreStep; problem: ProblemCard | null;
  quota: ConsultQuota | null; readOnly: boolean; notice: string;
}

function sessionOf(st: Store): ExploreSession {
  return { step: st.view, start: st.start, exploration: st.exploration, messages: st.messages, questionIndex: st.questionIndex, maxQuestions: 3,
    summary: st.summary, regional: st.regional, updatedAt: st.serverUpdatedAt };
}
function viewOf(v: ExploreStep, summary: SummaryV2 | null): ExploreStep { return (v === 'summary' || v === 'result') && !summary ? 'chat' : v; }

/** 이 기기에 저장본이 있으면 서버 응답을 기다리지 않고 바로 그린다 (F9). */
function localBoot(): Boot | null {
  const st = readStore();
  if (!st.options || !hasLocalProgress(st)) return null;
  return { opts: st.options, session: sessionOf(st), start: st.start, view: viewOf(st.view, st.summary), problem: st.problem, quota: st.quota, readOnly: false, notice: '' };
}

/** ?focus=<id> 를 현재 시작 정보에 합쳐 저장한다. 진행 중이어도 대화·단계는 건드리지 않는다. 실패하면 조용히 넘어간다. */
async function saveFocusParam(id: string): Promise<void> {
  try {
    const cur = await api.exploreSession().then((s) => s.start, () => readStore().start);
    await api.saveStart({ start: { ...cur, focusResourceId: id } });
  } catch { /* 관심 공고 없이 계속 */ }
}

export function Mentor() {
  const [sp, setSp] = useSearchParams();
  const [boot, setBoot] = useState<Boot | null>(localBoot);
  const [gen, setGen] = useState(0);
  const [quotaHint, setQuotaHint] = useState<ConsultQuota | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setError(null);
    let dead = false;
    const focusId = sp.get('focus');
    if (focusId) { const next = new URLSearchParams(sp); next.delete('focus'); setSp(next, { replace: true }); }
    (focusId ? saveFocusParam(focusId) : Promise.resolve()).then(() => Promise.all([api.exploreOptions(), api.exploreSession().then((s) => ({ s, ok: true }), () => ({ s: EMPTY, ok: false }))])).then(([opts, { s: server, ok }]) => {
      if (dead) return;
      const wf = (s: ExploreSession): FocusSession => ({ ...s, focus: server.focus ?? null });
      patchStore({ options: opts });
      const st = readStore();
      const local = hasLocalProgress(st);
      const serverEmpty = ok && !server.updatedAt && !server.summary && !server.start.readiness;
      const param = sp.get('readiness');
      const fromParam = opts.readiness.find((o) => o.value === param)?.value;
      if (server.quota) { patchStore({ quota: server.quota }); setQuotaHint(server.quota); }
      const quota = server.quota ?? st.quota;

      if (!ok) { // 서버에 닿지 않으면 이 기기 저장본으로 계속한다
        if (!boot) setBoot({ opts, session: sessionOf(st), start: st.start, view: viewOf(st.view, st.summary), problem: st.problem, quota, readOnly: false, notice: local ? '서버에 연결하지 못해 이 기기에 저장된 내용을 보여줘요.' : '' });
        return;
      }
      if (serverEmpty && local && (st.summary || st.result)) {
        // 서버 기록은 없고 이 기기에 요약·결과가 있다: 읽기 전용으로 보여주고 "이어서 하기"를 준다.
        setBoot({ opts, session: sessionOf(st), start: st.start, view: 'result', problem: st.problem, quota, readOnly: true, notice: '서버에 저장된 진행이 없어요. 이 기기에 저장된 내용을 읽기만 할 수 있어요.' });
        setGen((g) => g + 1);
        return;
      }
      if (serverEmpty && local) {
        // 요약 전 진행: 시작 정보·탐색 방향을 서버에 조용히 다시 보내고, 서버가 모르는 대화는 비운다.
        if (st.start.readiness) api.saveStart({ start: st.start }).catch(() => {});
        const ex = st.exploration;
        if (ex) api.saveExploration({ problemId: ex.problemId, origin: ex.origin, customProblem: ex.customProblem, selectionReason: ex.selectionReason }).catch(() => {});
        const cleared = patchStore({ messages: [], questionIndex: 0, suggestions: [], view: st.view === 'chat' ? 'start' : st.view });
        setBoot({ opts, session: wf(sessionOf(cleared)), start: cleared.start, view: viewOf(cleared.view, null), problem: cleared.problem, quota, readOnly: false, notice: '' });
        setGen((g) => g + 1);
        return;
      }
      const sv = server.updatedAt ? Date.parse(server.updatedAt) : NaN;
      const synced = st.serverUpdatedAt ? Date.parse(st.serverUpdatedAt) : NaN;
      const serverNewer = !local || (!Number.isNaN(sv) && (Number.isNaN(synced) || sv > synced));
      if (serverNewer) {
        const start: StartProfile = { ...server.start };
        if (fromParam && !start.readiness && !local) start.readiness = fromParam;
        const problem = st.problem && server.exploration?.problemId === st.problem.id ? st.problem : null;
        const next = adoptServer({
          view: viewOf(server.step, server.summary), start, exploration: server.exploration, messages: server.messages, questionIndex: server.questionIndex,
          summary: server.summary, regional: server.regional, problem, quota: quota ?? null,
          suggestions: server.exploration?.suggestions?.length ? server.exploration.suggestions : st.suggestions,
        }, server.updatedAt);
        setBoot({ opts, session: { ...server, start }, start, view: next.view, problem, quota: quota ?? null, readOnly: false, notice: '' });
        setGen((g) => g + 1);
        return;
      }
      // 이 기기 쪽이 같거나 더 새롭다. 화면은 그대로 두고 상담 횟수만 맞춘다.
      if (!boot) setBoot({ opts, session: wf(sessionOf(st)), start: st.start, view: viewOf(st.view, st.summary), problem: st.problem, quota, readOnly: false, notice: '' });
    }, (e) => { if (!dead && !boot) setError(e); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  if (error) return <div className="container mentor-page"><ErrorState error={error} onRetry={() => setTick(tick + 1)} message="준비 화면을 불러오지 못했어요. 입력한 내용은 이 기기에 남아 있어요." /></div>;
  if (!boot) return <div className="container mentor-page"><CardSkeletons count={3} /></div>;
  return <div className="container mentor-page"><Flow key={gen} boot={boot} quotaHint={quotaHint} onResumed={() => setTick((t) => t + 1)} /></div>;
}

function LocalSummary({ summary }: { summary: SummaryV2 }) {
  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>구상 요약 (이 기기에 저장된 내용)</h2>
      {(['interest', 'target', 'value', 'unknowns'] as const).map((k) => { const it = getItem(summary, k); return <div key={k}><strong>{ITEM_LABEL[k]}</strong> <ProvBadge p={it.provenance} /><p style={{ margin: 0 }}>{it.text || '미정'}</p></div>; })}
    </section>
  );
}

/** 서버에 기록이 없을 때 이 기기 저장본을 읽기 전용으로 보여준다. "이어서 하기"는 시작 정보·탐색 방향·요약을 서버에 다시 보낸다. */
function LocalView({ boot, onResumed }: { boot: Boot; onResumed: () => void }) {
  const st = readStore();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function resume() {
    setBusy(true); setErr('');
    try {
      if (st.start.readiness) await api.saveStart({ start: st.start });
      const ex = st.exploration;
      if (ex) await api.saveExploration({ problemId: ex.problemId, origin: ex.origin, customProblem: ex.customProblem, selectionReason: ex.selectionReason, direction: ex.direction, directionStatus: ex.directionStatus });
      if (st.summary) await api.saveSummary(st.summary);
      onResumed();
    } catch (e) { setErr(errMessage(e)); setBusy(false); }
  }
  return (
    <div className="stack">
      <section className="card stack" role="status">
        <p style={{ margin: 0 }}><strong>{boot.notice}</strong></p>
        <p className="muted">'이어서 하기'를 누르면 이 기기에 저장된 시작 정보와 구상 요약을 서버에 다시 보내요. 대화 내용은 다시 보내지 않고, 상담 횟수는 늘지 않아요.</p>
        {err && <p className="error-text" role="alert">{err}</p>}
        <div className="row"><button className="btn primary" onClick={resume} disabled={busy}>{busy ? '보내는 중...' : '이어서 하기'}</button></div>
      </section>
      {st.result && st.summary
        ? <Suspense fallback={<CardSkeletons />}><ResultStep readOnly summary={st.summary} problemTitle={boot.problem?.title} onEditSummary={() => {}} onMissingSummary={() => {}} /></Suspense>
        : st.summary && <LocalSummary summary={st.summary} />}
    </div>
  );
}

function Flow({ boot, quotaHint, onResumed }: { boot: Boot; quotaHint: ConsultQuota | null; onResumed: () => void }) {
  const [session, setSession] = useState<FocusSession>(boot.session);
  const focus = session.focus ?? null;
  const onFocusRemoved = () => setSession((cur) => ({ ...cur, focus: null, start: { ...cur.start, focusResourceId: null } as ExploreSession['start'] }));
  const [start, setStart] = useState(boot.start);
  const [view, setViewState] = useState<ExploreStep>(boot.view);
  const [problem] = useState(boot.problem);
  const [quota, setQuota] = useState<ConsultQuota | null>(quotaHint ?? boot.quota);
  const summary = session.summary;

  useEffect(() => { if (quotaHint) setQuota(quotaHint); }, [quotaHint]);
  useEffect(() => {
    if (boot.readOnly) return;
    const next = view === 'start' ? loadChat : view === 'chat' ? loadSummary : view === 'summary' ? loadResult : null;
    if (next) void next().catch(() => {});
  }, [boot.readOnly, view]);
  useEffect(() => {
    if (boot.readOnly) return;
    patchStore({ view, start, problem, exploration: session.exploration, summary, regional: session.regional, quota });
  }, [boot.readOnly, view, start, problem, session.exploration, summary, session.regional, quota]);

  // 대화 화면은 들어올 때만 새로 만든다. 메시지 수로 key 를 정하면 첫 답이 온 뒤 다시 만들어져 오류·재시도 상태가 사라진다.
  const [chatKey, setChatKey] = useState(0);
  const setView = useCallback((v: ExploreStep) => { if (v === 'chat') setChatKey((k) => k + 1); setViewState(v); window.scrollTo(0, 0); }, []);
  /** 서버 세션을 다시 읽어 상담 횟수와 동기화 시각을 맞춘다. */
  const refreshSession = useCallback(() => {
    // 탐색 상태(방향)도 서버 값으로 맞춘다: 요약에서 고친 방향이 대화 화면에 보이게.
    api.exploreSession().then((s) => { if (s.quota) setQuota(s.quota); setSession((cur) => ({ ...cur, exploration: s.exploration })); patchStore({ serverUpdatedAt: s.updatedAt, ...(s.quota ? { quota: s.quota } : {}) }); }, () => {});
  }, []);
  const setSummary = (s: SummaryV2) => { setSession((cur) => ({ ...cur, summary: s })); refreshSession(); };
  /** 정리한 상담을 이어서 한다. 서버가 다음 질문을 붙이면 대화 화면으로 돌아간다. */
  const continueChat = async () => {
    const r = await api.exploreChat({ more: true } as Parameters<typeof api.exploreChat>[0]);
    const extra = r as typeof r & { maxQuestions?: number; quota?: ConsultQuota };
    patchStore({ messages: r.messages, questionIndex: r.questionIndex });
    if (extra.quota) setQuota(extra.quota);
    setSession((cur) => ({ ...cur, messages: r.messages, questionIndex: r.questionIndex, maxQuestions: extra.maxQuestions ?? cur.maxQuestions, step: 'chat' }));
    setView('chat');
  };

  if (boot.readOnly) return <LocalView boot={boot} onResumed={onResumed} />;

  const notice = boot.notice && <p className="muted" role="status">{boot.notice}</p>;
  if (view === 'start') {
    return (
      <>{notice}
        <Suspense fallback={<CardSkeletons />}><StartStep opts={boot.opts} initial={start} quota={quota} focus={focus} onFocusRemoved={onFocusRemoved}
          onStarted={(s, st) => { setSession({ ...s, focus: (s as FocusSession).focus === undefined ? session.focus : (s as FocusSession).focus }); setStart(st); if (s.quota) setQuota(s.quota); patchStore({ serverUpdatedAt: s.updatedAt }); setView(s.summary && s.step !== 'chat' ? 'summary' : 'chat'); }} /></Suspense>
      </>
    );
  }
  if (view === 'chat') {
    const st = readStore();
    const chatSession: ExploreSession = { ...session, messages: st.messages, questionIndex: st.questionIndex };
    return (
      <Suspense fallback={<CardSkeletons />}><ChatStep key={chatKey} session={chatSession} problem={problem} quota={quota} focus={focus} onFocusRemoved={onFocusRemoved}
        onSession={(s) => setSession((cur) => ({ ...cur, exploration: s.exploration }))}
        onQuota={setQuota} onRefreshQuota={refreshSession}
        onBackToStart={() => setView('start')}
        onSummary={(s) => { setSummary(s); setView('summary'); }} /></Suspense>
    );
  }
  if (view === 'summary' && summary) {
    return <Suspense fallback={<CardSkeletons />}><SummaryStep summary={summary} onChange={setSummary} onBackToChat={() => setView('chat')} onBackToStart={() => setView('start')} onResult={() => setView('result')} onContinue={continueChat} /></Suspense>;
  }
  if (summary) {
    return <Suspense fallback={<CardSkeletons />}><ResultStep summary={summary} problemTitle={problem?.title} conditions={session.start.conditions} onEditSummary={() => setView('summary')} onBackToStart={() => setView('start')} onMissingSummary={() => setView('chat')} /></Suspense>;
  }
  return null;
}
