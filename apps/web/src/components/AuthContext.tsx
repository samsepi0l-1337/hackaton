import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@gil/shared';
import { api, AUTH_GATE_EVENT } from '../api/client';

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

  useEffect(() => {
    api.me().then((r) => setUserState(r.user)).catch(() => setUserState(null)).finally(() => setLoading(false));
  }, []);

  // 창업 준비 호출이 401/403 을 받으면 화면 상태를 서버와 맞춘다 (인증 안내·비밀번호 변경 안내로 이동).
  useEffect(() => {
    const onGate = (e: Event) => {
      const code = (e as CustomEvent<string>).detail;
      setUserState((u) => {
        if (code === 'unauthorized') return null;
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
    setUserState(null);
  }, []);

  return <Ctx.Provider value={{ user, loading, setUser, logout }}>{children}</Ctx.Provider>;
}
