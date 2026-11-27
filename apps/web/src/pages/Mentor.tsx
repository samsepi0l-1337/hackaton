import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AFFILIATIONS, AGE_MAX, AGE_MIN, BIZ_FORMS, BUSAN_DISTRICTS, CUSTOMER_AGES, CUSTOMER_DESC_MAX, CUSTOMER_REGIONS, CUSTOMER_TYPES,
  IDEA_MAX, INDUSTRIES, MENTOR_QUESTION_COUNT, OUTSIDE_BUSAN, PROBLEM_MAX, READINESS, REVENUE_MODELS, STAGES, SUPPORT_NEEDS,
  TEAM_SIZES, validateProfileSection,
} from '@gil/shared';
import type {
  Agency, ChatMessage, ConsultProfile, FieldError, IdeaSummary, MentorResultResponse, MentorSession, MentorStep,
  PlanItem, ProfileSection, Recommendation,
} from '@gil/shared';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { BottomBar } from '../components/BottomBar';
import { ChipGroup, MultiChipGroup } from '../components/Chips';
import { ProgramCard } from '../components/ProgramCard';
import { StepIndicator } from '../components/StepIndicator';
import { CardSkeletons, EmptyState, ErrorState } from '../components/States';
import { Field, TextArea, TextField } from '../components/TextField';
import { errMessage } from '../lib/format';

const STEPS: MentorStep[] = ['form', 'chat', 'summary', 'result'];
const STEP_LABELS = ['① 사업 정보', '② 멘토 대화', '③ 요약', '④ 추천 결과'];
const SECTIONS: ProfileSection[] = ['me', 'business', 'customer'];
const SECTION_TITLES = ['나에 대해', '하고 싶은 사업', '타겟 고객'];
const SUMMARY_LABELS: Record<keyof IdeaSummary, string> = { problem: '문제', customer: '고객', solution: '해결책', revenue: '수익 구조', busan: '부산 연결점' };

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/* ---------- ① 폼 ---------- */
function ProfileForm({ initial, onDone, onBack }: { initial: ConsultProfile; onDone: (p: ConsultProfile) => void; onBack?: () => void }) {
  const [profile, setProfile] = useState<ConsultProfile>(initial);
  const [section, setSection] = useState(0);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [save, setSave] = useState<SaveState>('idle');
  const timer = useRef<number>();
  const latest = useRef(profile);
  latest.current = profile;

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    setSave('saving');
    try { await api.saveProfile({ profile: latest.current }); setSave('saved'); } catch { setSave('error'); }
  }, []);

  const set = <K extends keyof ConsultProfile>(k: K, v: ConsultProfile[K]) => {
    setProfile((p) => ({ ...p, [k]: v }));
    setErrors((e) => e.filter((x) => x.field !== k));
    setSave('idle');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 800);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const err = (f: keyof ConsultProfile) => errors.find((e) => e.field === f)?.message;
  const p = profile;

  async function next() {
    const errs = validateProfileSection(SECTIONS[section]!, p);
    setErrors(errs);
    if (errs.length) {
      requestAnimationFrame(() => document.querySelector(`[data-field="${errs[0]!.field}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    await flush();
    if (section < 2) { setSection(section + 1); window.scrollTo(0, 0); } else onDone(p);
  }

  return (
    <div className="stack">
      <div className="row between"><h2 style={{ margin: 0 }}>{section + 1}/3 {SECTION_TITLES[section]}</h2><span className="muted" aria-live="polite">{save === 'saving' ? '저장 중...' : save === 'saved' ? '저장됨' : save === 'error' ? '저장 실패' : ''}</span></div>
      {section === 0 && (
        <>
          {p.typeCode && <div className="row"><span className="tag">내 유형: {p.typeCode}</span></div>}
          <TextField label="나이 (만)" name="age" required type="number" value={p.age?.toString() ?? ''} placeholder={`${AGE_MIN}~${AGE_MAX}`} error={err('age')} onChange={(v) => set('age', v === '' ? undefined : Number(v))} />
          <Field label="창업 단계" name="stage" required error={err('stage')}>
            <ChipGroup options={STAGES.map((s) => s.value)} labels={Object.fromEntries(STAGES.map((s) => [s.value, s.label]))} value={p.stage} onChange={(v) => set('stage', v)} />
          </Field>
          {p.stage && p.stage !== 'pre' && (
            <Field label="사업자 개업일" name="openedAt" required error={err('openedAt')}>
              <input className="input" type="date" value={p.openedAt ?? ''} onChange={(e) => set('openedAt', e.target.value || undefined)} />
            </Field>
          )}
          <Field label="사업장 지역" name="district" required error={err('district')}>
            <ChipGroup options={[...BUSAN_DISTRICTS, OUTSIDE_BUSAN]} value={p.district} onChange={(v) => set('district', v)} />
          </Field>
          <Field label="소속" name="affiliation"><ChipGroup options={AFFILIATIONS} allowClear value={p.affiliation} onChange={(v) => set('affiliation', v)} /></Field>
          <Field label="팀 규모" name="teamSize"><ChipGroup options={TEAM_SIZES} allowClear value={p.teamSize} onChange={(v) => set('teamSize', v)} /></Field>
        </>
      )}
      {section === 1 && (
        <>
          <TextArea label="아이디어 한 줄" name="idea" required rows={3} maxLength={IDEA_MAX} value={p.idea ?? ''} error={err('idea')} onChange={(v) => set('idea', v)} />
          <Field label="업종" name="industry" required error={err('industry')}><ChipGroup options={INDUSTRIES} value={p.industry} onChange={(v) => set('industry', v)} /></Field>
          <Field label="사업 형태" name="bizForm" required error={err('bizForm')}><ChipGroup options={BIZ_FORMS} value={p.bizForm} onChange={(v) => set('bizForm', v)} /></Field>
          <TextArea label="해결하려는 문제" name="problem" required rows={4} maxLength={PROBLEM_MAX} value={p.problem ?? ''} error={err('problem')} onChange={(v) => set('problem', v)} />
          <Field label="준비 상태" name="readiness" required error={err('readiness')}><ChipGroup options={READINESS} value={p.readiness} onChange={(v) => set('readiness', v)} /></Field>
          <Field label="수익 방식 (복수 선택)" name="revenue"><MultiChipGroup options={REVENUE_MODELS} value={p.revenue ?? []} onChange={(v) => set('revenue', v)} /></Field>
        </>
      )}
      {section === 2 && (
        <>
          <Field label="고객 유형" name="customerType" required error={err('customerType')}><ChipGroup options={CUSTOMER_TYPES} value={p.customerType} onChange={(v) => set('customerType', v)} /></Field>
          {p.customerType === 'B2C' && (
            <Field label="고객 연령대 (복수 선택)" name="customerAges" required error={err('customerAges')}><MultiChipGroup options={CUSTOMER_AGES} value={p.customerAges ?? []} onChange={(v) => set('customerAges', v)} /></Field>
          )}
          <Field label="고객 지역" name="customerRegion" required error={err('customerRegion')}><ChipGroup options={CUSTOMER_REGIONS} value={p.customerRegion} onChange={(v) => set('customerRegion', v)} /></Field>
          <TextArea label="고객 설명" name="customerDesc" required rows={3} maxLength={CUSTOMER_DESC_MAX} value={p.customerDesc ?? ''} error={err('customerDesc')} onChange={(v) => set('customerDesc', v)} />
          <TextArea label="지금 쓰는 대안" name="alternative" rows={3} value={p.alternative ?? ''} onChange={(v) => set('alternative', v)} />
          <Field label="필요한 지원 (복수 선택)" name="needs" required error={err('needs')}><MultiChipGroup options={SUPPORT_NEEDS} value={p.needs ?? []} onChange={(v) => set('needs', v)} /></Field>
        </>
      )}
      <BottomBar>
        <button className="btn" onClick={() => (section > 0 ? setSection(section - 1) : onBack?.())} disabled={section === 0 && !onBack}>이전</button>
        <button className="btn primary" onClick={next}>{section < 2 ? '다음' : '멘토와 대화 시작'}</button>
      </BottomBar>
    </div>
  );
}

/* ---------- ② 챗 ---------- */
function Chat({ session, onSummary, onEdit }: { session: MentorSession; onSummary: () => void; onEdit: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>(session.messages);
  const [qIndex, setQIndex] = useState(session.questionIndex);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const send = useCallback(async (req: { message?: string; skip?: boolean }, pending?: ChatMessage) => {
    setBusy(true);
    setError('');
    if (pending) setMessages((m) => [...m, pending]);
    try {
      const r = await api.chat(req);
      setMessages(r.messages);
      setQIndex(r.questionIndex);
    } catch (e) {
      setError(errMessage(e));
      if (pending) setMessages((m) => m.filter((x) => x !== pending));
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    if (started.current || session.messages.length > 0) return;
    started.current = true;
    void send({});
  }, [send, session.messages.length]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  const done = qIndex >= MENTOR_QUESTION_COUNT;
  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    void send({ message: t }, { role: 'user', text: t, at: new Date().toISOString() });
  };
  const p = session.profile;

  return (
    <div className="stack">
      <div className="card">
        <button className="btn small ghost" onClick={() => setOpen(!open)}>{open ? '요약 접기' : '입력한 정보 보기'}</button>
        {open && (
          <div className="stack" style={{ marginTop: 8 }}>
            <div><span className="muted">아이디어</span><br />{p.idea}</div>
            <div><span className="muted">고객</span><br />{p.customerType} {p.customerDesc}</div>
            <div><span className="muted">업종</span><br />{p.industry}</div>
            <button className="btn small" onClick={onEdit}>수정</button>
          </div>
        )}
      </div>
      {!done && <strong>질문 {Math.min(qIndex + 1, MENTOR_QUESTION_COUNT)}/{MENTOR_QUESTION_COUNT}</strong>}
      <div className="chat" aria-live="polite">
        {messages.map((m, i) => <div key={i} className={`bubble ${m.role}${m.skipped ? ' skipped' : ''}`}>{m.skipped ? '(건너뜀)' : m.text}</div>)}
        {busy && <div className="bubble mentor muted">생각 중...</div>}
        <div ref={bottom} />
      </div>
      {error && <p className="error-text" role="alert">{error} <button className="btn small" onClick={() => send({})}>다시 시도</button></p>}
      <div className="stack">
        <textarea className="input" rows={3} value={text} disabled={busy} placeholder={done ? '더 궁금한 점을 물어보세요' : '답을 입력하세요'} onChange={(e) => setText(e.target.value)} />
        <div className="row">
          <button className="btn primary grow" disabled={busy || !text.trim()} onClick={submit}>보내기</button>
          {!done && <button className="btn" disabled={busy} onClick={() => send({ skip: true })}>건너뛰기</button>}
        </div>
      </div>
      <BottomBar>
        <button className="btn" onClick={onEdit}>폼 수정</button>
        <button className="btn primary" disabled={!done || busy} onClick={onSummary}>요약 보기</button>
      </BottomBar>
    </div>
  );
}

/* ---------- ③ 요약 ---------- */
function Summary({ initial, onNext }: { initial: IdeaSummary | null; onNext: () => void }) {
  const [summary, setSummary] = useState<IdeaSummary | null>(initial);
  const [editing, setEditing] = useState<keyof IdeaSummary | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const create = useCallback(() => {
    setLoading(true); setError('');
    api.createSummary().then((r) => setSummary(r.summary), (e) => setError(errMessage(e))).finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (!initial) create(); }, [initial, create]);

  async function saveEdit() {
    if (!summary || !editing) return;
    setBusy(true);
    try { const r = await api.saveSummary({ ...summary, [editing]: draft }); setSummary(r.summary); setEditing(null); } catch (e) { setError(errMessage(e)); } finally { setBusy(false); }
  }

  if (loading) return <CardSkeletons count={5} />;
  if (!summary) return <ErrorState message={error || '요약을 만들지 못했어요.'} onRetry={create} />;
  return (
    <div className="stack">
      <h2 style={{ margin: 0 }}>아이디어 1장 요약</h2>
      {(Object.keys(SUMMARY_LABELS) as (keyof IdeaSummary)[]).map((k) => (
        <div key={k} className="card">
          <div className="row between"><h3>{SUMMARY_LABELS[k]}</h3>{editing !== k && <button className="btn small" onClick={() => { setEditing(k); setDraft(summary[k]); }}>수정</button>}</div>
          {editing === k ? (
            <div className="stack">
              <textarea className="input" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <div className="row"><button className="btn small primary" disabled={busy} onClick={saveEdit}>저장</button><button className="btn small" onClick={() => setEditing(null)}>취소</button></div>
            </div>
          ) : <p style={{ margin: 0 }}>{summary[k] || '-'}</p>}
        </div>
      ))}
      {error && <p className="error-text">{error}</p>}
      <BottomBar><button className="btn primary" onClick={onNext}>이 요약으로 지원사업 찾기</button></BottomBar>
    </div>
  );
}

/* ---------- ④ 결과 ---------- */
function Result() {
  const { data, error, loading, reload, setData } = useAsync(() => api.result(), []);
  const [msg, setMsg] = useState('');
  if (loading) return <CardSkeletons count={3} />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;
  const r: MentorResultResponse = data;

  async function feedback(rec: Recommendation, relevant: boolean) {
    try {
      await api.feedback({ programId: rec.program.id, relevant });
      setData({ ...r, top: r.top.map((t) => (t.program.id === rec.program.id ? { ...t, feedback: relevant } : t)) });
    } catch (e) { setMsg(errMessage(e)); }
  }
  async function toggle(item: PlanItem) {
    try { const res = await api.updatePlan({ day: item.day, done: !item.done }); setData({ ...r, plan: res.plan }); } catch (e) { setMsg(errMessage(e)); }
  }
  async function survey(discovered: boolean) {
    try { await api.survey({ discovered }); setData({ ...r, survey: discovered }); } catch (e) { setMsg(errMessage(e)); }
  }

  return (
    <div className="stack">
      <h2 style={{ margin: 0 }}>지원사업 Top{r.top.length || 3}</h2>
      {r.top.length === 0 && <EmptyState message="지금 맞는 공고를 찾지 못했어요." action={<Link className="btn primary" to="/programs">공고 모음 보기</Link>} />}
      {r.top.map((rec) => (
        <ProgramCard key={rec.program.id} card={rec}>
          {rec.eligibility && <ul className="muted" style={{ paddingLeft: 18 }}>{rec.eligibility.checks.map((c) => <li key={c.key}>{c.label}: {c.detail}</li>)}</ul>}
          <details open><summary>추천 이유</summary><p>{rec.reason}</p></details>
          <div className="row" style={{ marginBottom: 8 }}>
            <button className={`chip${rec.feedback === true ? ' selected' : ''}`} onClick={() => feedback(rec, true)}>관련 있음</button>
            <button className={`chip${rec.feedback === false ? ' selected' : ''}`} onClick={() => feedback(rec, false)}>관련 없음</button>
            <Link className="btn small primary" to={`/apply/${encodeURIComponent(rec.program.id)}`}>지원서 만들기</Link>
          </div>
        </ProgramCard>
      ))}
      {r.top.length > 0 && r.top.length < 3 && <p className="muted">추천이 {r.top.length}개예요. 공고 모음에서 더 찾아보세요.</p>}

      <h2>찾아갈 기관</h2>
      <div className="grid cols-2">
        {r.agencies.map((a: Agency) => (
          <div key={a.id} className="card"><h3>{a.name}</h3><p className="muted">{a.address}</p><p>{a.role}</p><a href={a.url} target="_blank" rel="noreferrer">홈페이지</a></div>
        ))}
      </div>

      <h2>7일 실행 계획</h2>
      <div className="card stack">
        {r.plan.map((it) => (
          <label key={it.day} className="check"><input type="checkbox" checked={it.done} onChange={() => toggle(it)} /><span><strong>Day {it.day}</strong> {it.task}</span></label>
        ))}
      </div>

      <h2>설문</h2>
      <div className="card row">
        <span className="grow">몰랐던 지원사업을 찾았나요?</span>
        <button className={`chip${r.survey === true ? ' selected' : ''}`} onClick={() => survey(true)}>예</button>
        <button className={`chip${r.survey === false ? ' selected' : ''}`} onClick={() => survey(false)}>아니오</button>
      </div>
      {msg && <p className="error-text">{msg}</p>}
      <BottomBar><Link className="btn primary" to="/programs?verdict=eligible">조건 맞는 공고 전체 보기</Link></BottomBar>
    </div>
  );
}

/* ---------- 페이지 ---------- */
export function Mentor() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { data: session, error, loading, reload, setData } = useAsync(() => api.session(), []);
  const [step, setStep] = useState<number | null>(null);
  const [choice, setChoice] = useState(false);
  const [busy, setBusy] = useState(false);
  const typeParam = sp.get('type');

  useEffect(() => {
    if (!session || step !== null) return;
    const idx = STEPS.indexOf(session.step);
    setStep(0);
    setChoice(!!session.updatedAt && (idx > 0 || !!session.profile.idea));
  }, [session, step]);

  if (loading) return <div className="container"><CardSkeletons count={2} /></div>;
  if (error || !session) return <div className="container"><ErrorState error={error} onRetry={reload} /></div>;
  if (step === null) return null;

  const reached = Math.max(STEPS.indexOf(session.step), step);
  const profile: ConsultProfile = { ...session.profile, typeCode: session.profile.typeCode ?? (typeParam ?? undefined) };

  if (choice) {
    return (
      <div className="container stack">
        <h1>이전 상담이 있어요</h1>
        <div className="card"><strong>{session.profile.idea ?? '사업 아이디어'}</strong><p className="muted" style={{ margin: 0 }}>마지막 수정 {session.updatedAt?.slice(0, 10)}</p></div>
        <button className="btn primary block" onClick={() => { setStep(STEPS.indexOf(session.step)); setChoice(false); }}>이어서 하기</button>
        <button className="btn block" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await api.newSession(); setData(await api.session()); setStep(0); setChoice(false); } catch { reload(); } finally { setBusy(false); }
        }}>새 상담 시작</button>
      </div>
    );
  }

  const go = (i: number) => { setStep(i); window.scrollTo(0, 0); };
  const refresh = async () => { try { setData(await api.session()); } catch { /* 현재 상태 유지 */ } };

  return (
    <div className="container stack">
      <StepIndicator steps={STEP_LABELS} current={step} maxReached={reached} onGo={go} />
      {step === 0 && <ProfileForm initial={profile} onBack={() => nav(-1)} onDone={async () => { await refresh(); go(1); }} />}
      {step === 1 && <Chat session={session} onEdit={() => go(0)} onSummary={async () => { await refresh(); go(2); }} />}
      {step === 2 && <Summary initial={session.summary} onNext={() => go(3)} />}
      {step === 3 && <Result />}
    </div>
  );
}
