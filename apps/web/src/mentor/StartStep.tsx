import { useEffect, useRef, useState } from 'react';
import { ACTIVITY_UNDECIDED, BUSAN_DISTRICTS, IDEA_MAX_V2 } from '@gil/shared';
import type { ConsultQuota, ExploreOptionsResponse, ExploreSession, ReadinessStage, ReviewRegion, StartProfile } from '@gil/shared';
import { api, ApiClientError } from '../api/client';
import { BottomBar } from '../components/BottomBar';
import { ChipGroup, MultiChipGroup } from '../components/Chips';
import { Counter, Field } from '../components/TextField';
import { errMessage } from '../lib/format';
import { hasNoData } from '../lib/coverage';
import { Progress } from './Common';
import { patchStore } from './storage';
import { DeviceNotice, QUOTA_NOTE, QuotaLine } from './Quota';
import { localAiAvailable } from '../lib/localAi';

type Save = 'idle' | 'saving' | 'saved' | 'error';

export function StartStep({ opts, initial, quota, onStarted }: {
  opts: ExploreOptionsResponse; initial: StartProfile; quota: ConsultQuota | null;
  onStarted: (s: ExploreSession, start: StartProfile) => void;
}) {
  const [start, setStart] = useState<StartProfile>(initial);
  const [save, setSave] = useState<Save>('idle');
  const [err, setErr] = useState('');
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const first = useRef(true);
  const latest = useRef(start);
  latest.current = start;

  const clean = (s: StartProfile): StartProfile => ({
    ...s, idea: s.idea?.trim() || undefined, interestNote: s.interestNote?.trim() || undefined,
    interests: s.interests?.length ? s.interests : undefined,
  });

  useEffect(() => { patchStore({ start }); }, [JSON.stringify(start)]);
  const [ai, setAi] = useState(false);
  useEffect(() => { void localAiAvailable().then(setAi); }, []);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSave('saving');
    const t = window.setTimeout(() => {
      api.saveStart({ start: clean(latest.current) }).then(() => setSave('saved'), () => setSave('error'));
    }, 800);
    return () => window.clearTimeout(t);
  }, [JSON.stringify(start)]);

  const set = <K extends keyof StartProfile>(k: K, v: StartProfile[K]) => { setStart((s) => ({ ...s, [k]: v })); setFieldErr({}); };
  const hasIdeaStage = start.readiness === 'has_idea' || start.readiness === 'preparing';
  const rr = start.reviewRegion;

  async function begin() {
    const e: Record<string, string> = {};
    if (!start.readiness) e.readiness = '지금 상황을 하나 골라 주세요.';
    else if (!start.idea?.trim() && !start.interests?.length && !start.interestNote?.trim()) {
      e.idea = hasIdeaStage ? "생각한 일을 한 줄만 적거나 관심 분야를 골라 주세요. 잘 모르겠으면 '아직 모름'도 괜찮아요." : "관심 분야를 하나 이상 고르거나 직접 적어 주세요. '아직 모름'도 괜찮아요.";
    }
    setFieldErr(e);
    if (Object.keys(e).length) { window.setTimeout(() => document.querySelector('.has-error')?.scrollIntoView({ block: 'center' }), 0); return; }
    setBusy(true); setErr('');
    try {
      const s = await api.saveStart({ start: clean(start) });
      api.track('start');
      onStarted(s, start);
    } catch (x) {
      if (x instanceof ApiClientError && x.fields.length) setFieldErr(Object.fromEntries(x.fields.map((f) => [f.field, f.message])));
      setErr(errMessage(x));
    } finally { setBusy(false); }
  }

  return (
    <div className="stack">
      <Progress current={0} />
      <section className="card stack" aria-labelledby="pv">
        <h2 id="pv" style={{ margin: 0 }}>시작 전에 확인해 주세요</h2>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{opts.privacy}</p>
        <p className="muted">진행 상황은 이 기기에도 저장돼서 새로고침해도 이어져요. 다른 기기나 브라우저에서는 이어지지 않아요. 결과 화면의 '초기화'로 모두 지울 수 있어요.</p>
        <QuotaLine quota={quota} />
        <p className="muted">{QUOTA_NOTE}</p>
      </section>
      <DeviceNotice aiAvailable={ai} />

      <Field label="지금 상황은 어떤가요?" required error={fieldErr.readiness}>
        <ChipGroup options={opts.readiness.map((o) => o.value)} labels={Object.fromEntries(opts.readiness.map((o) => [o.value, o.label]))} value={start.readiness}
          onChange={(v) => set('readiness', v as ReadinessStage | undefined)} />
      </Field>

      {start.readiness && (
        <>
          {hasIdeaStage && (
            <Field label="어떤 일을 해보고 싶나요?" hint="제품·서비스·매장 등 편하게 설명해 주세요. 예시는 참고용이고 저장되지 않아요." error={fieldErr.idea}>
              <textarea className="input" rows={4} maxLength={IDEA_MAX_V2} value={start.idea ?? ''} placeholder="예: 조선소 근처 직장인을 위한 점심 도시락 구독" onChange={(e) => set('idea', e.target.value)} aria-label="하고 싶은 일" />
              <Counter n={(start.idea ?? '').length} max={IDEA_MAX_V2} />
            </Field>
          )}
          <Field label={hasIdeaStage ? '관심 분야 (선택, 여러 개 가능)' : '관심 있는 분야나 경험을 알려주세요 (여러 개 가능)'} error={hasIdeaStage ? undefined : fieldErr.idea}
            hint="AI와 다른 산업을 함께 골라도 돼요. 전문지식을 확인하는 시험이 아니에요.">
            <MultiChipGroup options={opts.interests} value={start.interests ?? []} onChange={(v) => set('interests', v)} />
          </Field>
          <Field label="직접 적기 (선택)">
            <input className="input" maxLength={IDEA_MAX_V2} value={start.interestNote ?? ''} onChange={(e) => set('interestNote', e.target.value)} aria-label="관심 분야 직접 적기" />
          </Field>

          <Field label="활동 지역 (선택)" hint="사업자등록 주소를 요구하지 않아요.">
            <select className="input" value={start.district ?? ''} onChange={(e) => set('district', e.target.value || undefined)} aria-label="활동 지역">
              <option value="">선택 안 함</option>
              {BUSAN_DISTRICTS.map((d) => <option key={d} value={d}>부산 {d}</option>)}
              <option value={ACTIVITY_UNDECIDED}>{ACTIVITY_UNDECIDED}</option>
            </select>
          </Field>
          <Field label="어디에서 창업을 검토하고 있나요? (선택)" hint="거주지나 신청 자격과는 별개예요.">
            <ChipGroup options={opts.regions as readonly ReviewRegion[]} allowClear value={rr} onChange={(v) => set('reviewRegion', v)} />
            {rr && rr !== '미정' && hasNoData(opts.coverage, rr) && <p className="muted" role="status">{rr}: 상세 지원 경로 준비 중이에요. 구상 정리는 그대로 할 수 있어요.</p>}
          </Field>
        </>
      )}

      <p className="muted" role="status" aria-live="polite">{save === 'saving' ? '저장 중...' : save === 'saved' ? '자동 저장됨' : save === 'error' ? '자동 저장에 실패했어요. 입력은 이 화면에 남아 있어요.' : ''}</p>
      {err && <p className="error-text" role="alert">{err}</p>}
      <BottomBar>
        <button className="btn primary" onClick={begin} disabled={busy}>{busy ? '준비 중...' : '구상 정리 시작'}</button>
      </BottomBar>
    </div>
  );
}
