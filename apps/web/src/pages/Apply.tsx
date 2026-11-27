import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { APPLICATION_STATUS_LABEL } from '@gil/shared';
import type { ApplicationStatus, ApplicationView } from '@gil/shared';
import { api, ApiClientError } from '../api/client';
import { BottomBar } from '../components/BottomBar';
import { CardSkeletons, ErrorState } from '../components/States';
import { TextArea, TextField } from '../components/TextField';
import { errMessage } from '../lib/format';

const FLOW: ApplicationStatus[] = ['preparing', 'drafting', 'awaiting_approval', 'filling', 'submitting', 'completed'];
const POLL: ApplicationStatus[] = ['preparing', 'filling', 'submitting'];

function Status({ app }: { app: ApplicationView }) {
  const reached = new Set(app.history.map((h) => h.status));
  reached.add(app.status);
  return (
    <ol className="timeline" aria-label="진행 상태">
      {FLOW.map((s) => <li key={s} className={reached.has(s) ? 'on' : ''}>{APPLICATION_STATUS_LABEL[s]}</li>)}
      {(app.status === 'failed' || app.status === 'action_required') && <li className="on">{APPLICATION_STATUS_LABEL[app.status]}</li>}
    </ol>
  );
}

export function Apply() {
  const { programId = '' } = useParams();
  const [app, setApp] = useState<ApplicationView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const [copied, setCopied] = useState(false);

  const adopt = useCallback((a: ApplicationView) => {
    setApp(a);
    setValues(Object.fromEntries(a.fields.map((f) => [f.key, f.value])));
  }, []);

  const init = useCallback(async () => {
    setError(null);
    try {
      const list = await api.applications();
      const existing = list.items.find((x) => x.programId === programId);
      adopt(existing ?? (await api.createApplication({ programId })));
    } catch (e) {
      if (e instanceof ApiClientError && e.code === 'conflict') {
        try { const l = await api.applications(); const x = l.items.find((i) => i.programId === programId); if (x) { adopt(x); return; } } catch { /* 아래로 */ }
      }
      setError(e);
    }
  }, [programId, adopt]);
  useEffect(() => { void init(); }, [init]);

  // 진행 중 상태는 2초마다 갱신한다 (F16).
  useEffect(() => {
    if (!app || !POLL.includes(app.status)) return;
    const t = window.setInterval(() => { api.application(app.id).then((a) => { if (a.status !== app.status) adopt(a); else setApp(a); }).catch(() => {}); }, 2000);
    return () => window.clearInterval(t);
  }, [app, adopt]);

  async function run(fn: () => Promise<ApplicationView>, keepValues = false) {
    setBusy(true); setMsg('');
    try { const a = await fn(); if (keepValues) setApp(a); else adopt(a); } catch (e) { setMsg(errMessage(e)); } finally { setBusy(false); }
  }

  if (error) return <div className="container"><ErrorState error={error} onRetry={init} /></div>;
  if (!app) return <div className="container"><p>공고 양식을 가져오는 중...</p><CardSkeletons count={3} /></div>;

  const status = app.status;
  const missing = app.fields.filter((f) => f.required && !(values[f.key] ?? '').trim());
  const over = app.fields.filter((f) => f.maxLength !== null && (values[f.key] ?? '').length > f.maxLength);
  const copyAll = async () => {
    const t = app.fields.map((f) => `${f.label}\n${values[f.key] ?? ''}`).join('\n\n');
    try { await navigator.clipboard.writeText(t); setCopied(true); } catch { setMsg('복사하지 못했어요'); }
  };

  return (
    <div className="container stack">
      <h1>지원서 작성</h1>
      <p className="muted">{app.program.title} · {app.program.agency}</p>
      <Status app={app} />
      <p className="muted">양식 파일: {app.formFileName} · 신청 경로: {app.channel === 'web' ? '웹' : app.channel === 'email' ? '이메일' : '모의 제출'}</p>
      {msg && <p className="error-text" role="alert">{msg}</p>}

      {status === 'preparing' && <div className="card"><p>공고 양식을 가져오는 중이에요...</p><CardSkeletons count={2} /></div>}

      {status === 'drafting' && (
        <>
          <p className="muted">AI 초안이에요. 내용을 확인하고 고쳐 주세요. 이름·연락처·이메일 같은 신원 정보는 직접 입력해야 해요.</p>
          {app.fields.map((f) => {
            const v = values[f.key] ?? '';
            const e = f.maxLength !== null && v.length > f.maxLength ? `${f.maxLength}자 이하로 써 주세요` : undefined;
            return f.maxLength !== null && f.maxLength <= 60 && !f.identity
              ? <TextField key={f.key} label={f.label} required={f.required} maxLength={f.maxLength} value={v} error={e} onChange={(x) => setValues({ ...values, [f.key]: x })} />
              : f.identity
                ? <TextField key={f.key} label={`${f.label} (직접 입력)`} required={f.required} value={v} onChange={(x) => setValues({ ...values, [f.key]: x })} />
                : <TextArea key={f.key} label={f.label} required={f.required} rows={5} maxLength={f.maxLength} value={v} error={e} onChange={(x) => setValues({ ...values, [f.key]: x })} />;
          })}
          {missing.length > 0 && <p className="error-text">필수 항목: {missing.map((f) => f.label).join(', ')}</p>}
          <BottomBar>
            <button className="btn" disabled={busy} onClick={() => run(() => api.updateApplication(app.id, { values }), true)}>임시 저장</button>
            <button className="btn primary" disabled={busy || missing.length > 0 || over.length > 0} onClick={() => run(() => api.updateApplication(app.id, { values, requestApproval: true }))}>승인 요청</button>
          </BottomBar>
        </>
      )}

      {status === 'awaiting_approval' && (
        <>
          <h2>제출할 내용 확인</h2>
          <div className="stack">
            {app.fields.map((f) => <div key={f.key} className="card"><div className="muted">{f.label}</div><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{app.approval?.values[f.key] ?? f.value}</p></div>)}
          </div>
          <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>이 내용으로 제출합니다</span></label>
          <button className="btn" disabled={busy} onClick={() => run(() => api.updateApplication(app.id, { values: Object.fromEntries(app.fields.map((f) => [f.key, f.value])) }))}>수정하기</button>
          <BottomBar>
            <button className="btn primary" disabled={busy || !agree} onClick={() => run(() => api.approve(app.id, { confirm: true }))}>승인하고 제출</button>
          </BottomBar>
        </>
      )}

      {(status === 'filling' || status === 'submitting') && <div className="card"><p>{APPLICATION_STATUS_LABEL[status]}... 화면은 자동으로 갱신돼요.</p><CardSkeletons count={1} /></div>}

      {status === 'action_required' && (
        <div className="card stack">
          <p><strong>사용자 조치가 필요해요.</strong> {app.failReason ?? '원문 사이트에서 직접 진행해 주세요.'}</p>
          <div className="row">
            <a className="btn primary" href={app.program.url} target="_blank" rel="noreferrer">원문에서 직접 하기</a>
            <button className="btn" onClick={copyAll}>{copied ? '복사했어요' : '입력값 복사'}</button>
          </div>
        </div>
      )}

      {status === 'failed' && (
        <div className="card stack">
          <p><strong>제출에 실패했어요.</strong> {app.failReason ?? ''}</p>
          {app.retries < 1
            ? <button className="btn primary" disabled={busy} onClick={() => run(() => api.retry(app.id))}>다시 시도</button>
            : <a className="btn primary" href={app.program.url} target="_blank" rel="noreferrer">원문에서 직접 하기</a>}
        </div>
      )}

      {status === 'completed' && (
        <div className="card stack">
          <h2 style={{ margin: 0 }}>제출이 완료됐어요</h2>
          {app.receiptNo && <p>접수 번호: <strong>{app.receiptNo}</strong></p>}
          {app.receiptImageUrl && <img src={app.receiptImageUrl} alt="접수 확인" style={{ maxWidth: '100%' }} />}
          <Link className="btn primary" to="/me">제출 내역 보기</Link>
        </div>
      )}
    </div>
  );
}
