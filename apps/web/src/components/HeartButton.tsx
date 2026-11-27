import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

/**
 * 관심 표시(하트). 누르기 전: 테두리만 있는 하트, 누른 뒤: 색이 찬 하트.
 * 로그인이 필요하다 (하트는 계정에 저장되고 '나에게 맞는 순'과 창업 준비 추천에 쓰인다).
 */
export function HeartButton({ id, title, liked, onChange }: { id: string; title: string; liked: boolean; onChange?: (liked: boolean) => void }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [on, setOn] = useState(liked);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  // 서버 값이 바뀌면 따라간다 (목록 다시 읽기).
  const [prev, setPrev] = useState(liked);
  if (prev !== liked) { setPrev(liked); setOn(liked); }
  // 실패 문구는 3초 뒤에 지운다.
  useEffect(() => { if (!err) return; const t = setTimeout(() => setErr(false), 3000); return () => clearTimeout(t); }, [err]);

  async function toggle() {
    if (!user) { nav(`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`); return; }
    const next = !on;
    setOn(next); setBusy(true); setErr(false);
    try { await api.like(id, next); onChange?.(next); }
    catch { setOn(!next); setErr(true); }
    finally { setBusy(false); }
  }
  const label = on ? `${title} 관심 표시 취소` : `${title} 관심 표시`;
  return (
    <>
    <button type="button" className={`heart${on ? ' on' : ''}`} aria-pressed={on} aria-label={label} title={user ? (on ? '관심 표시 취소' : '관심 표시') : '로그인하고 관심 표시'} disabled={busy} onClick={toggle}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 6.9 4.5c2 0 3.4 1.1 4.1 2.3h2c.7-1.2 2.1-2.3 4.1-2.3 3.5 0 5.5 3.5 4.2 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />
      </svg>
    </button>
    {err && <span className="error-text heart-error" role="status">저장하지 못했어요</span>}
    </>
  );
}
