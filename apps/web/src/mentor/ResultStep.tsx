import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AFFILIATIONS, BUSAN_DISTRICTS, OUTSIDE_BUSAN, REGIONAL_STATUS_LABEL } from '@gil/shared';
import type { ExploreFeedbackRequest, ExploreResultResponse, PrepItem, SummaryV2, UserConditions } from '@gil/shared';
import { api } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ResourceResultCard } from '../components/ResourceView';
import { CardSkeletons, EmptyState, ErrorState } from '../components/States';
import { Field } from '../components/TextField';
import { errMessage } from '../lib/format';
import { ITEM_LABEL, Progress, ProvBadge, getItem } from './Common';
import type { ItemKey } from './Common';
import { clearSnapshot, patchStore, readStore } from './storage';
import { FieldQuestions } from './FieldQuestions';
import { rewrite } from '../lib/localAi';

const SUMMARY_KEYS: ItemKey[] = ['interest', 'target', 'value', 'unknowns'];

function PrepBlock({ prep, onToggle, primary }: { prep: PrepItem; onToggle: (p: PrepItem) => void; primary?: boolean }) {
  return (
    <div className={primary ? 'card stack highlight' : 'stack'}>
      <div className="row"><h3 style={{ margin: 0 }}>{prep.title}</h3>{prep.source === 'ai' && <span className="badge prov-ai">AI 제안·미검증</span>}</div>
      <p><strong>필요한 이유</strong> {prep.why}</p>
      <p><strong>진행 방법</strong> {prep.how}</p>
      <p><strong>정리할 결과</strong> {prep.output}</p>
      {prep.resourceId && <p><Link to={`/programs/${encodeURIComponent(prep.resourceId)}`}>연결된 지역 안내 보기</Link></p>}
      <div className="row">
        <button className={`btn${prep.done ? ' primary' : ''}`} aria-pressed={prep.done} onClick={() => onToggle(prep)}>{prep.done ? '준비 완료 표시됨' : '준비 완료 표시'}</button>
      </div>
      {primary && <p className="muted">'준비 완료 표시'는 내가 스스로 표시하는 거예요. 외부 상담이나 신청을 마쳤다는 뜻이 아니에요.</p>}
    </div>
  );
}

function ConditionForm({ initial, onSave, onClose }: { initial?: UserConditions; onSave: (c: UserConditions) => Promise<void>; onClose: () => void }) {
  const [ageUnknown, setAgeUnknown] = useState(initial?.age === 'unknown');
  const [age, setAge] = useState(typeof initial?.age === 'number' ? String(initial.age) : '');
  const [residence, setResidence] = useState(initial?.residence ?? '');
  const [affiliation, setAffiliation] = useState(initial?.affiliation ?? '');
  const [biz, setBiz] = useState(initial?.hasBusiness === undefined ? '' : String(initial.hasBusiness));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    const c: UserConditions = {};
    if (ageUnknown) c.age = 'unknown'; else if (age.trim() && Number.isFinite(Number(age))) c.age = Number(age);
    if (residence) c.residence = residence;
    if (affiliation) c.affiliation = affiliation;
    if (biz) c.hasBusiness = biz === 'unknown' ? 'unknown' : biz === 'true';
    setBusy(true); setErr('');
    try { await onSave(c); } catch (e) { setErr(errMessage(e)); setBusy(false); }
  }
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="내 조건 확인">
      <div className="sheet stack">
        <h2 style={{ margin: 0 }}>내 조건 확인</h2>
        <p className="muted">지원 경로의 조건과 비교할 때만 써요. 모르면 '모름'을 골라도 되고, 건너뛰어도 요약과 준비 안내는 그대로예요.</p>
        <Field label="만 나이">
          <input className="input" type="number" min={0} max={120} inputMode="numeric" value={age} disabled={ageUnknown} onChange={(e) => setAge(e.target.value)} />
          <label className="check"><input type="checkbox" checked={ageUnknown} onChange={(e) => setAgeUnknown(e.target.checked)} />모름</label>
        </Field>
        <Field label="거주지">
          <select className="input" value={residence} onChange={(e) => setResidence(e.target.value)}>
            <option value="">선택 안 함</option>
            {BUSAN_DISTRICTS.map((d) => <option key={d} value={`부산 ${d}`}>부산 {d}</option>)}
            <option value={OUTSIDE_BUSAN}>{OUTSIDE_BUSAN}</option>
            <option value="unknown">모름</option>
          </select>
        </Field>
        <Field label="소속">
          <select className="input" value={affiliation} onChange={(e) => setAffiliation(e.target.value)}>
            <option value="">선택 안 함</option>
            {AFFILIATIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            <option value="unknown">모름</option>
          </select>
        </Field>
        <Field label="사업자등록">
          <select className="input" value={biz} onChange={(e) => setBiz(e.target.value)}>
            <option value="">선택 안 함</option>
            <option value="false">아직 없어요</option>
            <option value="true">있어요</option>
            <option value="unknown">모름</option>
          </select>
        </Field>
        {err && <p className="error-text" role="alert">{err}</p>}
        <div className="row">
          <button className="btn grow" onClick={onClose} disabled={busy}>닫기</button>
          <button className="btn primary grow" onClick={submit} disabled={busy}>{busy ? '확인 중...' : '조건 대조하기'}</button>
        </div>
      </div>
    </div>
  );
}

function Scale({ label, value, onChange }: { label: string; value?: number; onChange: (v: number) => void }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="muted">{label}</legend>
      <div className="scale">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n}><input type="radio" name={label} checked={value === n} onChange={() => onChange(n)} />{n}</label>
        ))}
      </div>
    </fieldset>
  );
}

function BeforeAfter({ title, value, onChange }: { title: string; value: { before?: number; after?: number }; onChange: (v: { before?: number; after?: number }) => void }) {
  return (
    <div className="stack">
      <strong>{title}</strong>
      <p className="muted">1점 전혀 아니다 ~ 5점 매우 그렇다 (선택)</p>
      <Scale label={`${title} 이용 전`} value={value.before} onChange={(n) => onChange({ ...value, before: n })} />
      <Scale label={`${title} 이용 후`} value={value.after} onChange={(n) => onChange({ ...value, after: n })} />
    </div>
  );
}

function Feedback() {
  const [f, setF] = useState<ExploreFeedbackRequest>(() => readStore().feedback);
  useEffect(() => { patchStore({ feedback: f }); }, [f]);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [err, setErr] = useState('');
  async function submit() {
    setState('busy'); setErr('');
    try { await api.exploreFeedback(f); api.track('feedback'); patchStore({ feedback: {} }); setState('done'); } catch (e) { setErr(errMessage(e)); setState('idle'); }
  }
  if (state === 'done') return <section className="card" role="status"><p style={{ margin: 0 }}>의견을 보내 주셔서 고마워요.</p></section>;
  return (
    <section className="card stack" aria-labelledby="fb">
      <h2 id="fb" style={{ margin: 0 }}>의견 남기기 (모두 선택)</h2>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend><strong>준비 방향을 정하는 데 도움이 되었나요?</strong></legend>
        <div className="row">
          <button className="btn" aria-pressed={f.helpful === true} onClick={() => setF({ ...f, helpful: true })}>도움 됨</button>
          <button className="btn" aria-pressed={f.helpful === false} onClick={() => setF({ ...f, helpful: false })}>아쉬움</button>
        </div>
      </fieldset>
      <Field label="이유 (선택)"><textarea className="input" rows={2} value={f.reason ?? ''} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      <BeforeAfter title="현재 무엇부터 준비할지 알고 있다" value={f.knowWhatToPrepare ?? {}} onChange={(v) => setF({ ...f, knowWhatToPrepare: v })} />
      <BeforeAfter title="부울경을 창업 준비 지역으로 검토할 의향이 있다" value={f.regionIntent ?? {}} onChange={(v) => setF({ ...f, regionIntent: v })} />
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend><strong>이 지역에서 준비할 경로를 찾았나요?</strong></legend>
        <div className="row">
          <button className="btn" aria-pressed={f.foundRegionalPath === true} onClick={() => setF({ ...f, foundRegionalPath: true })}>찾았어요</button>
          <button className="btn" aria-pressed={f.foundRegionalPath === false} onClick={() => setF({ ...f, foundRegionalPath: false })}>못 찾았어요</button>
        </div>
      </fieldset>
      <Field label="찾은 경로 이름 (선택)"><input className="input" value={f.pathName ?? ''} onChange={(e) => setF({ ...f, pathName: e.target.value })} /></Field>
      {err && <p className="error-text" role="alert">{err}</p>}
      <button className="btn primary" onClick={submit} disabled={state === 'busy'}>의견 보내기</button>
    </section>
  );
}

function toText(summary: SummaryV2, prep: ExploreResultResponse['prep']): string {
  const lines = ['[나의 창업 준비 방향]', '(사업계획서가 아니라 구상 정리예요)', ''];
  lines.push(`탐색 방향: ${summary.exploration.direction.text || '아직 탐색 중'}`);
  for (const k of SUMMARY_KEYS) { const it = getItem(summary, k); lines.push(`${ITEM_LABEL[k]}: ${it.text || '미정'} (${it.provenance === 'user' ? '직접 입력' : it.provenance === 'ai' ? 'AI 제안·미검증' : '미정'})`); }
  lines.push('', '[우선 준비사항]');
  for (const p of [prep.primary, ...prep.followUps]) lines.push(`- ${p.title}: ${p.how} (정리할 결과: ${p.output})${p.done ? ' [준비 완료 표시]' : ''}`);
  return lines.join('\n');
}

function overlay(r: ExploreResultResponse, done: Record<string, boolean>): ExploreResultResponse {
  const m = (p: PrepItem): PrepItem => ({ ...p, done: done[p.id] ?? p.done });
  return { ...r, prep: { primary: m(r.prep.primary), followUps: r.prep.followUps.map(m) } };
}
const doneMap = (r: ExploreResultResponse): Record<string, boolean> =>
  Object.fromEntries([r.prep.primary, ...r.prep.followUps].map((p) => [p.id, p.done]));

export function ResultStep({ summary, problemTitle, readOnly = false, onEditSummary, onMissingSummary }: {
  summary: SummaryV2; problemTitle?: string; readOnly?: boolean; onEditSummary: () => void; onMissingSummary: () => void;
}) {
  const [res, setRes] = useState<ExploreResultResponse | null>(() => { const st = readStore(); return st.result ? overlay(st.result, st.prepDone) : null; });
  const [offline, setOffline] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>(() => readStore().fieldEdits);
  const [localReasons, setLocalReasons] = useState<Record<string, string>>({});
  const triedReason = useRef(new Set<string>());
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const [cond, setCond] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const tracked = useRef(false);
  const expanded = useRef(false);

  const keep = (r: ExploreResultResponse) => {
    const ids = new Set((r.fieldQuestions ?? []).map((q) => q.id));
    const kept = Object.fromEntries(Object.entries(readStore().fieldEdits).filter(([id]) => ids.has(id)));
    setEdits(kept);
    patchStore({ result: r, prepDone: doneMap(r), fieldEdits: kept });
  };

  useEffect(() => {
    if (readOnly) return;
    setError(null);
    api.exploreResult().then((r) => {
      if (!r.summary) { onMissingSummary(); return; }
      setRes(r); setOffline(false); keep(r);
      if (!tracked.current) { tracked.current = true; api.track('result'); }
    }, (e) => { if (readStore().result) setOffline(true); else setError(e); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  // 이 기기의 AI 로 지원 경로 이유 문장을 다듬는다 (쓸 수 있을 때만). 실패하면 서버 문장 그대로.
  useEffect(() => {
    if (!res) return;
    for (const c of res.resources.slice(0, 3)) {
      const key = `${c.resource.id}:${c.reason}`;
      if (triedReason.current.has(key)) continue;
      triedReason.current.add(key);
      const r0 = c.resource;
      const facts = [r0.title, r0.agency, r0.content, r0.target, r0.procedure, r0.prep, r0.costPeriod, r0.affiliationLimit,
        res.summary?.interest.text, res.summary?.target.text, res.summary?.value.text].filter((x): x is string => !!x);
      void rewrite({ task: 'reason', original: c.reason, facts, maxLength: 200 })
        .then((t) => { if (t) setLocalReasons((m) => ({ ...m, [r0.id]: t })); });
    }
  }, [res]);

  if (error) return <div className="stack"><Progress current={2} /><ErrorState error={error} onRetry={() => setTick(tick + 1)} /></div>;
  if (!res) return <div className="stack"><Progress current={2} /><CardSkeletons count={3} /></div>;

  const s = res.summary ?? summary;
  const prepAll = res.prep;
  const togglePrep = async (p: PrepItem) => {
    const done = !p.done;
    const apply = (d: boolean) => setRes((r) => r && ({ ...r, prep: {
      primary: r.prep.primary.id === p.id ? { ...r.prep.primary, done: d } : r.prep.primary,
      followUps: r.prep.followUps.map((x) => (x.id === p.id ? { ...x, done: d } : x)),
    } }));
    apply(done);
    patchStore({ prepDone: { ...readStore().prepDone, [p.id]: done } });
    if (readOnly) return;
    try { await api.setPrepDone(p.id, done); } catch (e) { apply(p.done); patchStore({ prepDone: { ...readStore().prepDone, [p.id]: p.done } }); setNote(errMessage(e)); }
  };
  const onLink = (id: string) => () => api.track('resource_link', id);
  const hasOtherRegion = res.resources.some((c) => c.resource.regions.some((r) => r === '울산' || r === '경남'));
  const reg = res.regional;
  const regResources = reg ? res.resources.filter((c) => reg.resourceIds.includes(c.resource.id)) : [];

  async function copy() {
    try { await navigator.clipboard.writeText(toText(s, prepAll)); setNote('요약과 준비사항을 복사했어요.'); } catch { setNote('복사하지 못했어요. 브라우저 권한을 확인해 주세요.'); }
  }
  async function reset() {
    setBusy(true);
    try { if (!readOnly) await api.resetExplore(); clearSnapshot(); window.location.assign('/mentor'); } catch (e) { setNote(errMessage(e)); setBusy(false); setConfirm(false); }
  }

  return (
    <div className="stack">
      <Progress current={2} />
      <h1>나의 창업 준비 방향</h1>
      {offline && <p className="muted" role="status">서버에 연결하지 못해 이 기기에 저장된 결과를 보여줘요. 최신 내용과 다를 수 있어요.</p>}

      <section className="card stack" aria-labelledby="sum">
        <div className="row between"><h2 id="sum" style={{ margin: 0 }}>구상 요약</h2>{!readOnly && <button className="btn small" onClick={onEditSummary}>내용 수정</button>}</div>
        <p className="muted">지금 준비 상태를 점수나 등급으로 평가하지 않아요.</p>
        <div><strong>탐색 방향</strong> <ProvBadge p={s.exploration.direction.provenance} /> <span className="badge">{s.exploration.direction.status === 'hold' ? '아직 탐색 중' : ''}</span>
          <p style={{ margin: 0 }}>{s.exploration.direction.text || '아직 탐색 중'}</p></div>
        {SUMMARY_KEYS.map((k) => { const it = getItem(s, k); return <div key={k}><strong>{ITEM_LABEL[k]}</strong> <ProvBadge p={it.provenance} /><p style={{ margin: 0 }}>{it.text || '미정'}</p></div>; })}
      </section>

      {reg && (
        <section className="card stack" aria-labelledby="rg">
          <div className="row"><h2 id="rg" style={{ margin: 0 }}>부울경에서 시작한다면</h2><span className="badge">{REGIONAL_STATUS_LABEL[reg.status]}</span></div>
          <p className="muted">검토 지역: {reg.region}. 지역 점수나 순위는 보여주지 않아요.</p>
          <div className="stack">
            <h3 style={{ margin: 0 }}>이 지역에서 검토할 이유</h3>
            {reg.status === 'weak' ? <p style={{ margin: 0 }}>현재 자료로 지역 연관성을 판단하기 어려워요.</p> : <p style={{ margin: 0 }}>{reg.basis}</p>}
            {res.contexts.length > 0 ? (
              <details onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open && !expanded.current) { expanded.current = true; api.track('regional_expand'); } }}>
                <summary>공식 배경 자료 보기 ({res.contexts.length})</summary>
                <ul className="plain-list" style={{ marginTop: 8 }}>
                  {res.contexts.map((c) => (
                    <li key={c.id}>
                      <div>{c.background}</div>
                      <div className="muted">출처: {c.url ? <a href={c.url} target="_blank" rel="noreferrer">원문 (새 창)</a> : '원문 확인 필요'} · 확인일 {c.checkedAt ?? '확인 필요'}{c.test && ' · 팀 검수 전 테스트 자료'}</div>
                    </li>
                  ))}
                </ul>
              </details>
            ) : <p className="muted">연결된 공식 출처가 아직 없어요. 확인 필요.</p>}
          </div>
          <div className="stack">
            <h3 style={{ margin: 0 }}>확인할 고객·시장</h3>
            <div className="row"><ProvBadge p={reg.customerHypothesis.provenance} /></div>
            <p style={{ margin: 0 }}>{reg.customerHypothesis.text || '미정'}</p>
            <p className="muted">가설이에요. 실제 수요나 계약 가능성의 증거가 아니에요.</p>
          </div>
          <div className="stack">
            <h3 style={{ margin: 0 }}>지역에서 준비할 경로</h3>
            {reg.resourceIds.length === 0 || regResources.length === 0
              ? <p style={{ margin: 0 }}>확인된 이용 경로 없음</p>
              : <ul className="plain-list">{regResources.map((c) => <li key={c.resource.id}><Link to={`/programs/${encodeURIComponent(c.resource.id)}`}>{c.resource.title}</Link> <span className="muted">· {c.resource.agency}</span></li>)}</ul>}
          </div>
        </section>
      )}

      <section className="stack" aria-labelledby="pr">
        <h2 id="pr" style={{ marginBottom: 0 }}>우선 준비사항</h2>
        <PrepBlock prep={prepAll.primary} onToggle={togglePrep} primary />
        {prepAll.followUps.length > 0 && (
          <details className="card">
            <summary>이어서 준비할 것 ({prepAll.followUps.length})</summary>
            <div className="stack" style={{ marginTop: 12 }}>{prepAll.followUps.map((p) => <PrepBlock key={p.id} prep={p} onToggle={togglePrep} />)}</div>
          </details>
        )}
      </section>

      <FieldQuestions questions={res.fieldQuestions ?? []} edits={edits} problemTitle={problemTitle}
        onEdit={(id, text) => {
          const next = { ...edits }; if (text === null) delete next[id]; else next[id] = text;
          setEdits(next); patchStore({ fieldEdits: next });
        }} />

      <section className="stack" aria-labelledby="rs">
        <div className="row between">
          <h2 id="rs" style={{ margin: 0 }}>{hasOtherRegion ? '선택한 지역의 준비 경로' : '부산에서 연결할 수 있는 지원'}</h2>
          {!readOnly && <button className="btn small" onClick={() => setCond(true)}>내 조건 확인</button>}
        </div>
        <p className="muted">{res.coverageNote}</p>
        {res.resources.length === 0
          ? <EmptyState message="현재 확인된 자료에서 맞는 경로를 찾지 못했어요." action={res.noMatchReason ? <p className="muted">{res.noMatchReason}</p> : undefined} />
          : res.resources.slice(0, 3).map((c) => <ResourceResultCard key={c.resource.id} card={c} localReason={localReasons[c.resource.id]} onLink={onLink(c.resource.id)} />)}
        <p className="muted">{res.conditionNote}</p>
        <p><Link to="/programs">지역 지원 전체 살펴보기</Link></p>
      </section>

      {!readOnly && <Feedback />}

      <section className="card stack">
        <h2 style={{ margin: 0 }}>저장과 초기화</h2>
        <p className="muted">내용은 이 기기에 저장돼요. 다른 기기나 브라우저에서는 이어지지 않아요. 공개 링크로 자동 공유되지 않아요.</p>
        <div className="row">
          <button className="btn" onClick={copy}>요약·준비사항 복사</button>
          <button className="btn danger" onClick={() => setConfirm(true)}>초기화</button>
        </div>
        {note && <p className="muted" role="status">{note}</p>}
      </section>

      {cond && <ConditionForm initial={undefined} onClose={() => setCond(false)} onSave={async (c) => { const r = await api.saveConditions(c); setRes(r); keep(r); setCond(false); }} />}
      {confirm && (
        <ConfirmDialog title="처음부터 다시 할까요?" confirmLabel="초기화" danger busy={busy} onConfirm={reset} onCancel={() => setConfirm(false)}>
          <p>아래 내용이 지워지고 되돌릴 수 없어요.</p>
          <ul>
            <li>서버에 저장된 시작 정보, 선택한 문제와 탐색 방향</li>
            <li>대화 내용과 구상 요약, 준비 완료 표시</li>
            <li>입력한 내 조건</li>
            <li>이 기기(브라우저)에 저장된 진행 상황</li>
          </ul>
        </ConfirmDialog>
      )}
    </div>
  );
}
