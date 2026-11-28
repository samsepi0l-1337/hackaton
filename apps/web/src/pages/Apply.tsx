import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { APPLICATION_STATUS_LABEL } from '@gil/shared';
import type { ApplicationView, FieldError } from '@gil/shared';
import { api, ApiClientError } from '../api/client';
import type { ExportFormat, PolishSuggestion } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { errMessage, safeHref } from '../lib/format';
import { CardSkeletons, EmptyState, ErrorState } from '../components/States';
import '../styles/pages-programs.css';
import '../styles/pages-apply.css';

const isLong = (max: number | null) => max === null || max > 100;
const when = (iso: string) => iso.slice(0, 16).replace('T', ' ');
const POLISH_LIMIT = 5;

/** base64 파일을 브라우저에서 내려받는다. */
function saveFile(name: string, mime: string, b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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
  const [polish, setPolish] = useState<Record<string, PolishSuggestion>>({});
  const [polishMsg, setPolishMsg] = useState('');
  const [polishLeft, setPolishLeft] = useState<number | null>(null);
  const [polishing, setPolishing] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportMsg, setExportMsg] = useState('');
  const [exportErr, setExportErr] = useState('');
  const [myForm, setMyForm] = useState<{ busy: boolean; msg: string; err: string }>({ busy: false, msg: '', err: '' });

  function adopt(a: ApplicationView) {
    setApp(a);
    setValues(Object.fromEntries(a.fields.map((f) => [f.key, f.value])));
    setConfirmed(false);
    const left = (a as { polishRemaining?: number }).polishRemaining;
    if (typeof left === 'number') setPolishLeft(left);
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
  const left = polishLeft ?? POLISH_LIMIT;
  const pending = Object.values(polish).filter((x) => values[x.key] !== x.after);

  async function askPolish() {
    if (!app) return;
    setPolishing(true); setPolishMsg(''); setPolish({});
    try {
      const r = await api.polishApplication(app.id, values);
      setPolishLeft(r.remaining);
      setPolish(Object.fromEntries(r.suggestions.map((x) => [x.key, x])));
      setPolishMsg(r.suggestions.length
        ? `${r.suggestions.length}개 항목을 다듬었어요. 칸마다 확인하고 적용해 주세요.`
        : '더 다듬을 곳을 찾지 못했어요. 지금 글을 그대로 써도 괜찮아요.');
    } catch (x) {
      if (x instanceof ApiClientError && x.code === 'polish_limit') setPolishLeft(0);
      setPolishMsg(errMessage(x));
    } finally { setPolishing(false); }
  }
  const apply = (keys: string[]) => {
    setValues((o) => ({ ...o, ...Object.fromEntries(keys.map((k) => [k, polish[k].after])) }));
    setSaved(false);
  };
  const dismiss = (key: string) => setPolish((o) => { const n = { ...o }; delete n[key]; return n; });

  async function download(format: ExportFormat) {
    if (!app) return;
    setExporting(format); setExportErr(''); setExportMsg('');
    try {
      // 작성 중이면 지금 쓴 내용을 먼저 저장해서 파일에 담는다.
      if (app.status === 'drafting') adopt(await api.updateApplication(app.id, { values }));
      const f = await api.exportApplication(app.id, format);
      saveFile(f.fileName, f.mimeType, f.fileBase64);
      const kind = { hwpx: '한글(HWPX)', docx: '워드(DOCX)', pptx: '파워포인트(PPTX)' }[f.format];
      setExportMsg(f.source === 'form'
        ? `공고 원본 양식(${kind})에 내용을 채워 내려받았어요. 빈 칸이 없는지 한 번 더 확인해 주세요.`
        : f.source === 'standard_form_fields'
          ? '공고 양식은 바로 채울 수 없는 형식이라, 그 양식의 항목으로 공통 양식(공문 형식)을 만들었어요.'
          : '공통 양식(공문 형식)으로 내려받았어요. 공고에 정해진 양식이 있으면 내용을 그 양식에 옮겨 주세요.');
    } catch (x) {
      setExportErr(errMessage(x));
    } finally { setExporting(null); }
  }
  /** 사용자가 찾은 제출 양식(DOCX·HWPX·PPTX)을 올리면 지원서 내용을 채워 돌려준다. */
  async function fillMine(file: File) {
    if (!app) return;
    setMyForm({ busy: true, msg: '', err: '' });
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error('4MB 이하의 양식 파일을 올려 주세요.');
      if (app.status === 'drafting') adopt(await api.updateApplication(app.id, { values }));
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const r = await api.fillMyForm(app.id, file.name, btoa(bin));
      saveFile(r.fileName, r.mimeType, r.fileBase64);
      setMyForm({ busy: false, err: '', msg: `올린 양식에 ${r.filled.length}개 항목(${r.filled.join(', ')})을 채워 내려받았어요. 나머지 칸은 직접 확인해 주세요.` });
    } catch (x) {
      setMyForm({ busy: false, msg: '', err: x instanceof Error ? errMessage(x) : String(x) });
    }
  }
  const printValues = app.fields.map((f) => ({ ...f, value: editable ? (values[f.key] ?? '') : f.value }));

  return (
    <div className="container stack program-detail apply-page">
      <div className="row"><span className="badge">{APPLICATION_STATUS_LABEL[st]}</span>{p.endDate && <span className="muted">마감 {p.endDate}</span>}</div>
      <h1>{p.title}</h1>
      <p className="muted">{p.agency}</p>
      <p className="banner" role="note">
        해보까는 지원서를 대신 제출하지 않아요. 작성을 마치면 지원서 파일을 내려받아 공식 사이트에서 직접 신청해 주세요.
        {safeHref(p.url) && <> <a href={safeHref(p.url)} target="_blank" rel="noreferrer">공식 안내에서 신청하기</a></>}
      </p>

      {editable && (
        <section className="card apply-polish" aria-labelledby="apply-polish-h">
          <div className="apply-polish-text">
            <h2 id="apply-polish-h">AI로 다듬기</h2>
            <p>적어 둔 내용과 상담에서 나눈 이야기를 바탕으로 Solar가 문장을 다듬어요. 고른 칸만 바뀌고, 없는 경험이나 숫자는 만들지 않아요.</p>
          </div>
          <div className="apply-polish-action">
            <button className="btn primary" type="button" disabled={polishing || busy || left <= 0} onClick={askPolish}>
              {polishing ? '다듬는 중...' : 'AI로 다듬기'}
            </button>
            <span className="muted">남은 횟수 {left}/{POLISH_LIMIT}</span>
          </div>
          {polishMsg && <p className="apply-polish-msg" role="status">{polishMsg}</p>}
          {pending.length > 1 && <button className="btn" type="button" onClick={() => apply(pending.map((x) => x.key))}>다듬은 글 모두 적용</button>}
        </section>
      )}

      {editable && (
        <form className="card stack" onSubmit={(e) => e.preventDefault()} noValidate>
          {/* 저장·확인 요청 중에는 칸을 잠근다. 응답이 오면 서버 값으로 바뀌어 그 사이에 쓴 글이 사라지기 때문이다. */}
          <fieldset disabled={busy} className="stack" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
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
                {polish[f.key] && v !== polish[f.key].after && (
                  <div className="apply-suggest">
                    <p className="apply-suggest-label">다듬은 글</p>
                    <p className="apply-suggest-text">{polish[f.key].after}</p>
                    <div className="row">
                      <button className="btn primary" type="button" onClick={() => apply([f.key])}>이 글로 바꾸기</button>
                      <button className="btn" type="button" onClick={() => dismiss(f.key)}>그대로 두기</button>
                    </div>
                  </div>
                )}
                {polish[f.key] && v === polish[f.key].after && <p className="apply-note">다듬은 글을 적용했어요. 임시 저장을 눌러 저장해 주세요.</p>}
                {e && <p className="error-text" role="alert">{e}</p>}
              </div>
            );
          })}
          </fieldset>
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
            <button className="btn primary" type="button" disabled={busy || !confirmed} aria-describedby={confirmed ? undefined : 'apply-confirm-hint'} onClick={() => run(() => api.approveApplication(app.id))}>{busy ? '마무리하는 중...' : '작성 완료'}</button>
          </div>
          {!confirmed && <p id="apply-confirm-hint" className="muted" style={{ margin: 0 }}>'작성한 내용을 확인했어요'에 체크하면 작성을 마칠 수 있어요.</p>}
        </section>
      )}

      {st === 'completed' && (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>지원서를 완성했어요</h2>
          <p style={{ margin: 0 }}>아래 '지원서 파일 내려받기'에서 한글·워드·PDF 파일로 받아 공식 사이트에 제출해 주세요.</p>
          {safeHref(p.url) && <div><a className="btn primary" href={safeHref(p.url)} target="_blank" rel="noreferrer">공식 안내에서 신청하기</a></div>}
        </section>
      )}

      {st === 'failed' && (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>작성을 마치지 못했어요</h2>
          <p style={{ margin: 0 }}>{app.failReason ?? '알 수 없는 이유로 실패했어요.'}</p>
          {err && <p className="error-text" role="alert">{err}</p>}
          {app.retries >= 1 && <p className="muted" style={{ margin: 0 }}>다시 시도는 한 번만 할 수 있어요. 새 지원서를 만들어 주세요.</p>}
          {app.retries < 1 && <div><button className="btn primary" type="button" disabled={busy} onClick={() => run(() => api.retryApplication(app.id))}>{busy ? '다시 시도하는 중...' : '다시 시도'}</button></div>}
        </section>
      )}

      {!['drafting', 'awaiting_approval', 'completed', 'failed'].includes(st) && (
        <section className="card"><p className="muted" style={{ margin: 0 }}>지금은 고칠 수 없는 상태예요.</p></section>
      )}

      <section className="card stack apply-export" aria-labelledby="apply-export-h">
        <h2 id="apply-export-h" style={{ margin: 0 }}>지원서 파일 내려받기</h2>
        <p className="muted" style={{ margin: 0 }}>
          제출할 파일로 받아 공식 사이트에 직접 올려요. 워드·파워포인트·한글 중 원하는 형식으로 받아요. 공고에 공식 양식(DOCX·PPTX·HWPX)이 있으면 그 양식에 채우고, 없으면 같은 내용의 공문 형식 공통 양식으로 만들어요.
        </p>
        <div className="row">
          <button className="btn" type="button" disabled={!!exporting || busy} onClick={() => download('docx')}>{exporting === 'docx' ? '만드는 중...' : '워드(DOCX)'}</button>
          <button className="btn" type="button" disabled={!!exporting || busy} onClick={() => download('pptx')}>{exporting === 'pptx' ? '만드는 중...' : '파워포인트(PPTX)'}</button>
          <button className="btn" type="button" disabled={!!exporting || busy} onClick={() => download('hwpx')}>{exporting === 'hwpx' ? '만드는 중...' : '한글(HWPX)'}</button>
          <button className="btn" type="button" disabled={!!exporting} onClick={() => window.print()}>PDF로 저장</button>
        </div>
        <p className="apply-note">HWPX는 한글 2014 이상에서 열려요. HWP 파일이 필요하면 한글에서 열고 'HWP로 저장'을 눌러 주세요. PDF는 인쇄 창에서 'PDF로 저장'을 골라 주세요.</p>
        {exportMsg && <p role="status" style={{ margin: 0 }}>{exportMsg}</p>}
        {exportErr && <p className="error-text" role="alert">{exportErr}</p>}
        <div className="apply-myform">
          <h3>내가 찾은 제출 양식에 채우기</h3>
          <p className="muted">공고 사이트에서 받은 신청서 양식(DOCX·PPTX·HWPX)을 올리면, 항목 이름에 맞춰 지금까지 쓴 내용을 채워 돌려드려요. HWP·PDF·PPT 양식은 한글·워드·파워포인트에서 새 형식으로 저장한 뒤 올려 주세요.</p>
          <label className="btn">
            {myForm.busy ? '양식을 채우는 중...' : '양식 파일 올리기'}
            <input type="file" accept=".docx,.hwpx,.pptx" className="sr-only" disabled={myForm.busy || busy}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void fillMine(f); }} />
          </label>
          {myForm.msg && <p role="status" style={{ margin: 0 }}>{myForm.msg}</p>}
          {myForm.err && <p className="error-text" role="alert">{myForm.err}</p>}
        </div>
      </section>

      <article className="apply-print" aria-hidden="true">
        <h1>{p.title} 지원서</h1>
        <p>{p.agency}</p>
        <table>
          <tbody>
            {printValues.map((f) => (
              <tr key={f.key}><th scope="row">{f.label}</th><td>{f.value || (f.identity ? '(직접 작성)' : '')}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="apply-print-foot">해보까에서 작성한 초안입니다. 제출 전에 공고 원본 양식과 내용을 확인해 주세요.</p>
      </article>

      {app.history.length > 0 && (
        <ul className="apply-history">
          {app.history.map((h, i) => <li key={i}>{APPLICATION_STATUS_LABEL[h.status]} · {when(h.at)}</li>)}
        </ul>
      )}
    </div>
  );
}
