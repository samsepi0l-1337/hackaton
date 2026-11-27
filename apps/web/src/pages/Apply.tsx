import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { APPLICATION_STATUS_LABEL } from '@gil/shared';
import type { ApplicationView, FieldError } from '@gil/shared';
import { api, ApiClientError } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { errMessage } from '../lib/format';
import { CardSkeletons, EmptyState, ErrorState } from '../components/States';
import '../styles/pages-programs.css';
import '../styles/pages-apply.css';

const isLong = (max: number | null) => max === null || max > 100;
const when = (iso: string) => iso.slice(0, 16).replace('T', ' ');

export function Apply() {
  const { id = '' } = useParams();
  const { data, error, loading, reload } = useAsync(() => api.application(id), [id]);
  const [app, setApp] = useState<ApplicationView | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fieldErrs, setFieldErrs] = useState<FieldError[]>([]);
  const [saved, setSaved] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  function adopt(a: ApplicationView) {
    setApp(a);
    setValues(Object.fromEntries(a.fields.map((f) => [f.key, f.value])));
    setConfirmed(false);
  }
  useEffect(() => { if (data) adopt(data); }, [data]);

  async function run(fn: () => Promise<ApplicationView>, ok?: string) {
    setBusy(true); setErr(''); setFieldErrs([]); setSaved(false);
    try {
      adopt(await fn());
      if (ok) setSaved(true);
    } catch (x) {
      if (x instanceof ApiClientError && x.fields.length) setFieldErrs(x.fields);
      setErr(errMessage(x));
    } finally { setBusy(false); }
  }

  if (loading && !app) return <div className="container"><CardSkeletons count={2} /></div>;
  if (error instanceof ApiClientError && error.code === 'not_found') {
    return <div className="container"><EmptyState message="지원서를 찾을 수 없어요." action={<Link className="btn primary" to="/me">내 정보로</Link>} /></div>;
  }
  if (!app) return <div className="container"><ErrorState error={error} onRetry={reload} /></div>;

  const p = app.program;
  const st = app.status;
  const editable = st === 'drafting';
  const fieldErr = (key: string) => fieldErrs.find((f) => f.field === key)?.message;
  const save = () => run(() => api.updateApplication(app.id, { values }), 'saved');

  return (
    <div className="container stack program-detail apply-page">
      <div className="row"><span className="badge">{APPLICATION_STATUS_LABEL[st]}</span>{p.endDate && <span className="muted">마감 {p.endDate}</span>}</div>
      <h1>{p.title}</h1>
      <p className="muted">{p.agency}</p>
      <p className="banner" role="note">
        연습용 초안이고 제출도 모의로 처리돼요. 실제 신청은 공식 사이트에서 해야 해요.
        {p.url && <> <a href={p.url} target="_blank" rel="noreferrer">공식 안내에서 신청하기</a></>}
      </p>

      {editable && (
        <form className="card stack" onSubmit={(e) => e.preventDefault()} noValidate>
          {app.fields.map((f) => {
            const v = values[f.key] ?? '';
            const e = fieldErr(f.key);
            const idAttr = `f-${f.key}`;
            const common = {
              id: idAttr, className: 'input', value: v, maxLength: f.maxLength ?? undefined,
              'aria-invalid': !!e, onChange: (ev: { target: { value: string } }) => setValues((o) => ({ ...o, [f.key]: ev.target.value })),
            };
            return (
              <div key={f.key} className="apply-field">
                <label className="apply-label" htmlFor={idAttr}>
                  <span>{f.label}{f.required && <span className="apply-req" aria-label="필수">*</span>}</span>
                  <span className="apply-count">{v.length}{f.maxLength !== null && `/${f.maxLength}`}</span>
                </label>
                {isLong(f.maxLength) ? <textarea {...common} /> : <input type="text" {...common} />}
                {f.identity && <p className="apply-note">이 칸은 AI가 채우지 않아요. 직접 적어 주세요.</p>}
                {e && <p className="error-text" role="alert">{e}</p>}
              </div>
            );
          })}
          {err && <p className="error-text" role="alert">{err}</p>}
          {saved && <p role="status">저장했어요.</p>}
          <div className="row">
            <button className="btn" type="button" disabled={busy} onClick={save}>임시 저장</button>
            <button className="btn primary" type="button" disabled={busy} onClick={() => run(() => api.updateApplication(app.id, { values, requestApproval: true }))}>제출 전 확인</button>
          </div>
        </form>
      )}

      {st === 'awaiting_approval' && (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>제출 전 확인</h2>
          <dl className="apply-summary" style={{ margin: 0 }}>
            {app.fields.map((f) => (
              <div key={f.key}><dt>{f.label}</dt><dd>{f.value || <span className="muted">(비워 둠)</span>}</dd></div>
            ))}
          </dl>
          <label className="check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />작성한 내용을 확인했어요</label>
          {err && <p className="error-text" role="alert">{err}</p>}
          <div className="row">
            <button className="btn" type="button" disabled={busy} onClick={() => run(() => api.updateApplication(app.id, { values }))}>다시 고치기</button>
            <button className="btn primary" type="button" disabled={busy || !confirmed} onClick={() => run(() => api.approveApplication(app.id))}>{busy ? '제출하는 중...' : '모의 제출'}</button>
          </div>
        </section>
      )}

      {st === 'completed' && (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>모의 제출을 마쳤어요</h2>
          <p className="apply-receipt" style={{ margin: 0 }}>{app.receiptNo}</p>
          <p className="muted" style={{ margin: 0 }}>연습용 접수번호예요. 실제로 접수된 것이 아니에요.</p>
          {p.url && <div><a className="btn primary" href={p.url} target="_blank" rel="noreferrer">공식 안내에서 신청하기</a></div>}
        </section>
      )}

      {st === 'failed' && (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>제출하지 못했어요</h2>
          <p style={{ margin: 0 }}>{app.failReason ?? '알 수 없는 이유로 실패했어요.'}</p>
          {err && <p className="error-text" role="alert">{err}</p>}
          {app.retries < 1 && <div><button className="btn primary" type="button" disabled={busy} onClick={() => run(() => api.retryApplication(app.id))}>{busy ? '다시 시도하는 중...' : '다시 시도'}</button></div>}
        </section>
      )}

      {!['drafting', 'awaiting_approval', 'completed', 'failed'].includes(st) && (
        <section className="card"><p className="muted" style={{ margin: 0 }}>지금은 고칠 수 없는 상태예요.</p></section>
      )}

      {app.history.length > 0 && (
        <ul className="apply-history">
          {app.history.map((h, i) => <li key={i}>{APPLICATION_STATUS_LABEL[h.status]} · {when(h.at)}</li>)}
        </ul>
      )}
    </div>
  );
}
