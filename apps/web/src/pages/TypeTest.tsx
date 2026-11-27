import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { TYPE_AXES, TYPE_QUESTIONS, describeType, isValidTypeCode, scoreTypeTest } from '@gil/shared';
import type { TypeResult } from '@gil/shared';
import { api } from '../api/client';
import { useAuth } from '../components/AuthContext';
import { BottomBar } from '../components/BottomBar';
import { loadLocalTest, saveLocalTest } from '../lib/typeTestStorage';
import '../styles/pages-account.css';

function ResultView({ result }: { result: TypeResult }) {
  const hasScores = TYPE_AXES.some((a) => result.axisScores[a.axis].left + result.axisScores[a.axis].right > 0);
  return (
    <div className="stack">
      <div className="hero">
        <div className="muted">내 창업 유형</div>
        <h1 style={{ marginBottom: 4 }}>{result.code}</h1>
        <h3>{result.name}</h3>
        <p style={{ margin: 0 }}>{result.oneLine}</p>
      </div>
      {hasScores && (
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
      )}
      <section className="card">
        <h3>강점</h3><ul>{result.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
        <h3>주의할 점</h3><p>{result.caution}</p>
      </section>
    </div>
  );
}

export function TypeTest() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const shared = sp.get('type');
  const saved = loadLocalTest();
  const [phase, setPhase] = useState<'start' | 'quiz' | 'result'>(isValidTypeCode(shared) ? 'result' : 'start');
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [result, setResult] = useState<TypeResult | null>(isValidTypeCode(shared) ? describeType(shared) : null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  function finish(a: Record<number, string>) {
    const r = scoreTypeTest(a);
    setResult(r);
    setPhase('result');
    saveLocalTest({ answers: a, code: r.code });
    if (user) api.typeTest({ answers: a }).catch(() => setError('계정에는 저장하지 못했어요. 이 기기에는 저장했어요.'));
  }

  function pick(letter: string) {
    const q = TYPE_QUESTIONS[idx]!;
    const next = { ...answers, [q.id]: letter };
    setAnswers(next);
    if (idx + 1 < TYPE_QUESTIONS.length) setIdx(idx + 1); else finish(next);
  }

  async function copyLink() {
    const url = `${location.origin}/test?type=${result?.code ?? ''}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); window.prompt('링크를 복사해 주세요', url); }
  }

  const reset = () => { setAnswers({}); setIdx(0); setResult(null); setCopied(false); setPhase('start'); nav('/test', { replace: true }); };

  if (phase === 'start') {
    return (
      <div className="container stack account-page test-page">
        <h1>창업 유형 테스트</h1>
        <p>12문항 · 약 1분. 로그인 없이 할 수 있어요. 재미·참고용이며 자격 판정에 쓰지 않아요.</p>
        {saved && isValidTypeCode(saved.code) && <div className="card"><p>지난 결과: <strong>{saved.code}</strong></p><button className="btn small" onClick={() => { setResult(scoreTypeTest(saved.answers)); setPhase('result'); }}>결과 보기</button></div>}
        <button className="btn primary block" onClick={() => setPhase('quiz')}>테스트 시작</button>
      </div>
    );
  }

  if (phase === 'quiz') {
    const q = TYPE_QUESTIONS[idx]!;
    return (
      <div className="container stack account-page test-page">
        <div className="row between"><span>{idx + 1}/{TYPE_QUESTIONS.length}</span><button className="btn small ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>이전</button></div>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={TYPE_QUESTIONS.length} aria-valuenow={idx + 1}><div style={{ width: `${((idx + 1) / TYPE_QUESTIONS.length) * 100}%` }} /></div>
        <h2>{q.text}</h2>
        {q.options.map((o) => (
          <button key={o.letter} className={`option-btn${answers[q.id] === o.letter ? ' selected' : ''}`} onClick={() => pick(o.letter)}>{o.text}</button>
        ))}
      </div>
    );
  }

  return (
    <div className="container stack account-page test-page">
      {result &&<ResultView result={result} />}
      {error && <p className="error-text" role="alert">{error}</p>}
      <p className="muted">재미·참고용이며 자격 판정에 쓰지 않아요.{!user && ' 결과는 이 기기에 저장했어요.'}</p>
      <div className="row">
        <button className="btn" onClick={copyLink}>{copied ? '링크를 복사했어요' : '링크 복사'}</button>
        <button className="btn" onClick={reset}>다시 하기</button>
      </div>
      {!user && <p className="muted">창업 준비는 <Link to="/signup?next=/mentor">가입</Link>하고 이메일을 인증한 뒤 쓸 수 있어요.</p>}
      <BottomBar>
        <button className="btn primary" onClick={() => nav('/mentor')}>이 유형으로 창업 준비 시작</button>
      </BottomBar>
    </div>
  );
}
