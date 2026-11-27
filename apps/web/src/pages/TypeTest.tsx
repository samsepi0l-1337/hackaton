import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TYPE_AXES, TYPE_QUESTIONS, scoreTypeTest } from '@gil/shared';
import type { TypeResult } from '@gil/shared';
import { api } from '../api/client';
import { useAuth } from '../components/AuthContext';
import { BottomBar } from '../components/BottomBar';
import { loadLocalTest, saveLocalTest } from '../lib/typeTestStorage';

export function ResultView({ result }: { result: TypeResult }) {
  return (
    <div className="stack">
      <div className="hero">
        <div className="muted">내 창업 유형</div>
        <h1 style={{ marginBottom: 4 }}>{result.code}</h1>
        <h3>{result.name}</h3>
        <p style={{ margin: 0 }}>{result.oneLine}</p>
      </div>
      <section className="card">
        {TYPE_AXES.map((a) => {
          const s = result.axisScores[a.axis];
          const total = s.left + s.right || 1;
          return (
            <div className="axis" key={a.axis}>
              <div className="labels"><span>{a.left} {a.leftName} ({s.left})</span><span>({s.right}) {a.right} {a.rightName}</span></div>
              <div className="bar"><span style={{ width: `${(s.left / total) * 100}%` }} /></div>
            </div>
          );
        })}
      </section>
      <section className="card">
        <h3>강점</h3><ul>{result.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
        <h3>주의할 점</h3><p>{result.caution}</p>
        <h3>잘 맞는 업종</h3><div className="row">{result.industries.map((i) => <span className="tag" key={i}>{i}</span>)}</div>
        <h3 style={{ marginTop: 12 }}>먼저 보면 좋은 지원 분야</h3>
        <div className="row">{result.categories.map((c) => <Link key={c} className="btn small" to={`/programs?category=${encodeURIComponent(c)}`}>{c}</Link>)}</div>
      </section>
    </div>
  );
}

export function TypeTest() {
  const { user } = useAuth();
  const nav = useNavigate();
  const saved = loadLocalTest();
  const [phase, setPhase] = useState<'start' | 'quiz' | 'result'>('start');
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [result, setResult] = useState<TypeResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function finish(a: Record<number, string>) {
    const r = scoreTypeTest(a);
    setResult(r);
    setPhase('result');
    if (user) {
      api.typeTest({ answers: a }).catch((e) => setError(e instanceof Error ? e.message : '저장하지 못했어요'));
    } else {
      saveLocalTest({ answers: a, code: r.code });
    }
  }

  function pick(letter: string) {
    const q = TYPE_QUESTIONS[idx]!;
    const next = { ...answers, [q.id]: letter };
    setAnswers(next);
    if (idx + 1 < TYPE_QUESTIONS.length) setIdx(idx + 1); else void finish(next);
  }

  async function share() {
    const url = `${location.origin}/test`;
    try { await navigator.clipboard.writeText(`내 창업 유형은 ${result?.code}! ${url}`); setCopied(true); } catch { setCopied(false); window.prompt('링크를 복사해 주세요', url); }
  }

  const reset = () => { setAnswers({}); setIdx(0); setResult(null); setPhase('start'); };

  if (phase === 'start') {
    return (
      <div className="container stack">
        <h1>창업 유형 테스트</h1>
        <p>12문항 · 약 1분. 로그인 없이 할 수 있어요.</p>
        {saved && <div className="card"><p>지난 결과: <strong>{saved.code}</strong></p><button className="btn small" onClick={() => { setResult(scoreTypeTest(saved.answers)); setPhase('result'); }}>결과 보기</button></div>}
        <button className="btn primary block" onClick={() => setPhase('quiz')}>테스트 시작</button>
      </div>
    );
  }

  if (phase === 'quiz') {
    const q = TYPE_QUESTIONS[idx]!;
    return (
      <div className="container stack">
        <div className="row between"><span>{idx + 1}/{TYPE_QUESTIONS.length}</span><button className="btn small ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>이전</button></div>
        <div className="progress"><div style={{ width: `${((idx + 1) / TYPE_QUESTIONS.length) * 100}%` }} /></div>
        <h2>{q.text}</h2>
        {q.options.map((o) => (
          <button key={o.letter} className={`option-btn${answers[q.id] === o.letter ? ' selected' : ''}`} onClick={() => pick(o.letter)}>{o.text}</button>
        ))}
      </div>
    );
  }

  return (
    <div className="container stack">
      {result && <ResultView result={result} />}
      {error && <p className="error-text">{error}</p>}
      {!user && <p className="muted">결과는 이 브라우저에 저장했어요. 로그인하면 계정에 저장해요.</p>}
      <p className="muted">재미·참고용 결과이며 지원 자격 판정에는 쓰지 않아요.</p>
      <div className="row">
        <button className="btn" onClick={share}>{copied ? '복사했어요' : '결과 공유'}</button>
        <button className="btn" onClick={reset}>다시 하기</button>
      </div>
      <BottomBar>
        <button className="btn primary" onClick={() => nav(`/mentor?type=${result?.code}`)}>이 유형으로 상담 시작</button>
      </BottomBar>
    </div>
  );
}
