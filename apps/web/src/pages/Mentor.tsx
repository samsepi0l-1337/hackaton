import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ExploreOptionsResponse, ExploreSession, ExploreStep, StartProfile, SummaryV2 } from '@gil/shared';
import { api } from '../api/client';
import { CardSkeletons, ErrorState } from '../components/States';
import { ChatStep } from '../mentor/ChatStep';
import { ResultStep } from '../mentor/ResultStep';
import { StartStep } from '../mentor/StartStep';
import { SummaryStep } from '../mentor/SummaryStep';
import { loadSnapshot, saveSnapshot } from '../mentor/storage';
import type { ProblemInfo } from '../mentor/storage';

const EMPTY: ExploreSession = { step: 'start', start: {}, exploration: null, messages: [], questionIndex: 0, maxQuestions: 3, summary: null, regional: null, updatedAt: null };

interface Boot { opts: ExploreOptionsResponse; session: ExploreSession; start: StartProfile; view: ExploreStep; problem: ProblemInfo | null }

export function Mentor() {
  const [sp] = useSearchParams();
  const [boot, setBoot] = useState<Boot | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setError(null);
    Promise.all([api.exploreOptions(), api.exploreSession().catch(() => EMPTY)]).then(([opts, server]) => {
      const snap = loadSnapshot();
      const serverEmpty = !server.updatedAt && !server.summary && !server.start.readiness;
      // 서버 기록이 없고 이 기기에 저장본이 있으면 저장본으로 복구한다 (F9).
      const start: StartProfile = serverEmpty && snap ? snap.start : server.start;
      const param = sp.get('readiness');
      const fromParam = opts.readiness.find((o) => o.value === param)?.value;
      if (fromParam && !start.readiness) start.readiness = fromParam;
      let view: ExploreStep = serverEmpty && snap ? snap.view : server.step;
      let session = server;
      if (serverEmpty && snap?.summary) {
        session = { ...server, summary: snap.summary };
        api.saveSummary(snap.summary).catch(() => {});
      }
      if (serverEmpty && snap?.start.readiness) api.saveStart({ start: snap.start }).catch(() => {});
      if ((view === 'summary' || view === 'result') && !session.summary) view = 'chat';
      setBoot({ opts, session, start, view, problem: snap?.problem ?? null });
    }, setError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  if (error) return <div className="container"><ErrorState error={error} onRetry={() => setTick(tick + 1)} message="준비 화면을 불러오지 못했어요. 입력한 내용은 이 기기에 남아 있어요." /></div>;
  if (!boot) return <div className="container"><CardSkeletons count={3} /></div>;
  return <div className="container"><Flow boot={boot} /></div>;
}

function Flow({ boot }: { boot: Boot }) {
  const [session, setSession] = useState(boot.session);
  const [start, setStart] = useState(boot.start);
  const [view, setViewState] = useState<ExploreStep>(boot.view);
  const [problem, setProblem] = useState(boot.problem);
  const summary = session.summary;

  useEffect(() => { saveSnapshot({ view, start, summary, problem }); }, [view, start, summary, problem]);
  const setView = useCallback((v: ExploreStep) => { setViewState(v); window.scrollTo(0, 0); }, []);
  const setSummary = (s: SummaryV2) => setSession((cur) => ({ ...cur, summary: s }));

  if (view === 'start') {
    return (
      <StartStep opts={boot.opts} session={session} initial={start} problem={problem} onProblem={setProblem}
        onSession={(s) => setSession((cur) => ({ ...cur, exploration: s.exploration }))}
        onStarted={(s, st) => { setSession(s); setStart(st); setView(s.summary && s.step !== 'chat' ? 'summary' : 'chat'); }} />
    );
  }
  if (view === 'chat') {
    return (
      <ChatStep key={session.messages.length === 0 ? 'new' : 'resume'} session={session} problem={problem}
        onSession={(s) => setSession((cur) => ({ ...cur, exploration: s.exploration }))}
        onBackToStart={() => setView('start')}
        onSummary={(s) => { setSummary(s); setView('summary'); }} />
    );
  }
  if (view === 'summary' && summary) {
    return <SummaryStep summary={summary} onChange={setSummary} onBackToChat={() => setView('chat')} onResult={() => setView('result')} />;
  }
  if (summary) {
    return <ResultStep summary={summary} onEditSummary={() => setView('summary')} onMissingSummary={() => setView('chat')} />;
  }
  return null;
}
