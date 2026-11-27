import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@gil/shared';
import { api, AUTH_GATE_EVENT } from '../api/client';
import { clearSnapshot } from '../mentor/storage';

interface AuthValue {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthValue>({ user: null, loading: true, setUser: () => {}, logout: async () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const initialRequest = useRef<ReturnType<typeof api.me> | null>(null);

  useEffect(() => {
    const request = initialRequest.current ?? api.me();
    initialRequest.current = request;
    let active = true;
    request.then((r) => { if (active) setUserState(r.user); }).catch(() => { if (active) setUserState(null); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // 창업 준비 호출이 401/403 을 받으면 화면 상태를 서버와 맞춘다 (인증 안내·비밀번호 변경 안내로 이동).
  useEffect(() => {
    const onGate = (e: Event) => {
      const code = (e as CustomEvent<string>).detail;
      setUserState((u) => {
        if (code === 'unauthorized') { if (u) clearSnapshot(); return null; }
        if (!u) return u;
        if (code === 'email_unverified') return { ...u, emailVerified: false };
        if (code === 'password_change_required') return { ...u, mustChangePassword: true };
        return u;
      });
    };
    window.addEventListener(AUTH_GATE_EVENT, onGate);
    return () => window.removeEventListener(AUTH_GATE_EVENT, onGate);
  }, []);

  const setUser = useCallback((u: User | null) => setUserState(u), []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    // 같은 브라우저를 쓰는 다음 사람에게 이전 창업 준비 기록이 보이지 않게 한다.
    clearSnapshot();
    setUserState(null);
  }, []);

  const value = useMemo(() => ({ user, loading, setUser, logout }), [user, loading, setUser, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
