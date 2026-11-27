import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { APPLICATION_STATUS_LABEL, BUSAN_DISTRICTS, OCCUPATIONS, checkPassword, scoreTypeTest } from '@gil/shared';
import type { BasicProfile } from '@gil/shared';
import { api, ApiClientError } from '../api/client';
import { useAuth } from '../components/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PasswordChecklist } from '../components/PasswordChecklist';
import { RegionPicker } from '../components/RegionPicker';
import { joinRegionText, splitRegionText } from '../lib/profile';
import { Field, TextField } from '../components/TextField';
import { VerifyPanel } from '../components/VerifyPanel';
import { useAsync } from '../hooks/useAsync';
import { errMessage } from '../lib/format';
import { loadLocalTest } from '../lib/typeTestStorage';
import { QuotaLine } from '../mentor/Quota';
import '../styles/pages-account.css';

function PasswordSection({ notice }: { notice: boolean }) {
  const { setUser, user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const pw = checkPassword(next, confirm);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(''); setDone(false);
    if (!current || !pw.ok) return;
    setBusy(true);
    try {
      await api.changePassword({ currentPassword: current, newPassword: next, newPasswordConfirm: confirm });
      setDone(true); setCurrent(''); setNext(''); setConfirm('');
      if (user) setUser({ ...user, mustChangePassword: false });
    } catch (x) {
      setErr(x instanceof ApiClientError && x.code === 'unauthorized' ? '현재 비밀번호가 맞지 않아요' : errMessage(x));
    } finally { setBusy(false); }
  }

  return (
    <section id="password" className="card stack">
      <h2 style={{ margin: 0 }}>비밀번호 변경</h2>
      {(notice || user?.mustChangePassword) && <p role="status"><strong>복구 비밀번호로 로그인했어요. 새 비밀번호를 정해야 창업 준비를 쓸 수 있어요.</strong></p>}
      <form className="stack" onSubmit={submit} noValidate>
        <TextField label="현재 비밀번호" hint="복구 비밀번호로 로그인했다면 메일로 받은 복구 비밀번호를 넣어 주세요" type="password" autoComplete="current-password" value={current} onChange={setCurrent} />
        <TextField label="새 비밀번호" type="password" autoComplete="new-password" value={next} onChange={setNext} />
        <TextField label="새 비밀번호 확인" type="password" autoComplete="new-password" value={confirm} onChange={setConfirm} />
        <PasswordChecklist password={next} confirm={confirm} />
        {err && <p className="error-text" role="alert">{err}</p>}
        {done && <p role="status">비밀번호를 바꿨어요. 다른 기기의 로그인은 끝났어요.</p>}
        <div><button className="btn primary" disabled={busy || !current || !pw.ok}>{busy ? '바꾸는 중...' : '비밀번호 바꾸기'}</button></div>
      </form>
    </section>
  );
}

function ApplicationsSection() {
  const list = useAsync(() => api.applications(), []);
  const items = list.data?.items ?? [];
  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>내 지원서</h2>
      {list.loading ? <p className="muted">불러오는 중이에요.</p>
        : list.error ? <p className="muted">지원서를 불러오지 못했어요.</p>
        : items.length === 0 ? (
          <>
            <p className="muted" style={{ margin: 0 }}>아직 쓴 지원서가 없어요.</p>
            <div><Link className="btn" to="/programs">공고 보러 가기</Link></div>
          </>
        ) : (
          <ul className="plain-list">
            {items.map((a) => (
              <li key={a.id} className="app-row">
                <Link to={`/applications/${a.id}`}>{a.program.title}</Link>
                <span className="badge">{APPLICATION_STATUS_LABEL[a.status]}</span>
                <span className="muted">{a.updatedAt.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

const UNKNOWN = 'unknown';
const RESIDENCE_EXTRAS = [{ value: '그 밖의 지역', label: '그 밖의 지역' }, { value: UNKNOWN, label: '모름' }];

function ProfileSection() {
  const [loaded, setLoaded] = useState(false);
  const [age, setAge] = useState('');
  const [ageUnknown, setAgeUnknown] = useState(false);
  const [residence, setResidence] = useState('');
  const [biz, setBiz] = useState('');
  const [occ, setOcc] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  // null 은 저장 전(또는 모름). 모름과 선택 안 함은 서버에서 모두 null 이므로 화면에서는 '선택 안 함'으로 보인다.
  function fill(p: BasicProfile) {
    setAge(p.age === null ? '' : String(p.age)); setAgeUnknown(false);
    setResidence(p.residence ?? ''); setBiz(p.hasBusiness === null ? '' : String(p.hasBusiness)); setOcc(p.occupation ?? '');
  }
  useEffect(() => { api.myProfile().then((r) => fill(r.profile), () => {}).finally(() => setLoaded(true)); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(''); setSaved(false);
    const n = Number(age);
    if (!ageUnknown && age.trim() && !(Number.isInteger(n) && n >= 0 && n <= 120)) { setErr('나이는 0~120 사이 숫자로 적어 주세요'); return; }
    const profile: Partial<BasicProfile> = {
      age: ageUnknown || !age.trim() ? null : n,
      residence: residence && residence !== UNKNOWN ? residence : null,
      hasBusiness: biz === 'true' ? true : biz === 'false' ? false : null,
      occupation: occ && occ !== UNKNOWN ? occ : null,
    };
    setBusy(true);
    try { const r = await api.saveMyProfile(profile); fill(r.profile); setSaved(true); } catch (x) { setErr(errMessage(x)); } finally { setBusy(false); }
  }

  // 저장값 → 선택기: 부산 구·군은 '해운대구'처럼 지역 없이 저장돼 있다.
  const picked = (BUSAN_DISTRICTS as readonly string[]).includes(residence) ? { region: '부산', district: residence } : splitRegionText(residence);

  return (
    <section id="profile" className="card stack">
      <h2 style={{ margin: 0 }}>기본 정보 (선택)</h2>
      <p className="muted" style={{ margin: 0 }}>적지 않아도 돼요. 저장하면 결과 화면의 '내 조건 확인'에 기본값으로 채워져요. 지원 경로 조건과 비교하는 참고용이고, 최종 자격 판단이 아니에요.</p>
      <form className="stack" onSubmit={submit} noValidate>
        <Field label="만 나이">
          <input className="input" type="number" min={0} max={120} inputMode="numeric" value={age} disabled={ageUnknown || !loaded} onChange={(e) => setAge(e.target.value)} />
          <label className="check"><input type="checkbox" checked={ageUnknown} onChange={(e) => setAgeUnknown(e.target.checked)} />모름</label>
        </Field>
        <Field label="거주지">
          <RegionPicker id="residence" region={picked.region} district={picked.district} allLabel="선택 안 함" extras={RESIDENCE_EXTRAS}
            onChange={(r, d) => { if (loaded) setResidence(r ? (r === '부산' && d ? d : joinRegionText(r, d)) : ''); }} />
        </Field>
        <Field label="사업자등록">
          <select className="input" value={biz} disabled={!loaded} onChange={(e) => setBiz(e.target.value)}>
            <option value="">선택 안 함</option>
            <option value="true">있음</option>
            <option value="false">없음</option>
            <option value={UNKNOWN}>모름</option>
          </select>
        </Field>
        <Field label="현재 직군">
          <select className="input" value={occ} disabled={!loaded} onChange={(e) => setOcc(e.target.value)}>
            <option value="">선택 안 함</option>
            {OCCUPATIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            <option value={UNKNOWN}>모름</option>
          </select>
        </Field>
        {err && <p className="error-text" role="alert">{err}</p>}
        {saved && <p role="status">저장했어요.</p>}
        <div><button className="btn primary" disabled={busy || !loaded}>{busy ? '저장 중...' : '저장'}</button></div>
      </form>
    </section>
  );
}

export function Me() {
  const { user, logout, setUser } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const verified = !!user?.emailVerified && !user.mustChangePassword;
  const sess = useAsync(() => (verified ? api.exploreSession() : Promise.resolve(null)), [verified]);
  const local = loadLocalTest();
  const type = local ? scoreTypeTest(local.answers) : null;

  useEffect(() => {
    if (loc.hash === '#password') document.getElementById('password')?.scrollIntoView();
  }, [loc.hash]);

  async function remove() {
    setBusy(true);
    try { await api.deleteAccount(); setUser(null); nav('/', { replace: true }); } catch (e) { setErr(errMessage(e)); setBusy(false); }
  }

  if (!user) return null;
  return (
    <div className="container account-page me-page">
      <h1>내 정보</h1>
      <div className="me-col">
      <section className="card stack">
        <h2 style={{ margin: 0 }}>계정</h2>
        <p style={{ margin: 0 }}>{user.email} <span className="badge">{user.emailVerified ? '이메일 인증 완료' : '이메일 인증 전'}</span></p>
        {!user.emailVerified && <VerifyPanel email={user.email} onDone={() => {}} lead="인증하면 창업 준비를 쓸 수 있어요. 메일의 링크를 누르거나 코드를 입력해 주세요." />}
      </section>

      <ApplicationsSection />

      <ProfileSection />
      </div>

      <div className="me-col">
      <section className="card stack">
        <h2 style={{ margin: 0 }}>이번 주 상담</h2>
        {!verified
          ? <p className="muted">이메일 인증을 마치면 남은 횟수가 보여요. 계정 1개로 일주일에 3번 상담할 수 있어요.</p>
          : sess.loading ? <p className="muted">확인하는 중이에요.</p>
          : sess.data?.quota ? <QuotaLine quota={sess.data.quota} /> : <p className="muted">남은 횟수를 불러오지 못했어요.</p>}
        {verified && <div><Link className="btn primary" to="/mentor">창업 준비 이어서 하기</Link></div>}
      </section>

      <section className="card stack">
        <h2 style={{ margin: 0 }}>창업 유형 테스트</h2>
        {type
          ? <p style={{ margin: 0 }}>지난 결과: <strong>{type.code}</strong> · {type.name} <span className="muted">(재미·참고용)</span></p>
          : <p className="muted" style={{ margin: 0 }}>아직 결과가 없어요. 12문항, 약 1분이에요.</p>}
        <div><Link className="btn" to="/test">{type ? '다시 하기' : '테스트 하기'}</Link></div>
      </section>

      <PasswordSection notice={new URLSearchParams(loc.search).get('notice') === 'password'} />
      </div>

      {err && <p className="error-text me-wide" role="alert">{err}</p>}
      <section className="row me-wide">
        <button className="btn" onClick={async () => { await logout(); nav('/'); }}>로그아웃</button>
        <button className="btn danger" onClick={() => setConfirm(true)}>계정 삭제</button>
      </section>
      {confirm && (
        <ConfirmDialog title="계정을 삭제할까요?" confirmLabel="삭제" danger busy={busy} onConfirm={remove} onCancel={() => setConfirm(false)}>
          <p>계정과 서버에 저장된 상담·정보가 지워지고 되돌릴 수 없어요. 이 브라우저에 저장된 입력 초안, 대화, 요약, 유형 테스트 결과는 따로 지워야 해요.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
