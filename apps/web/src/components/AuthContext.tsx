import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@gil/shared';
import { api } from '../api/client';
import { loadLocalTest, clearLocalTest } from '../lib/typeTestStorage';

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

  // 로그인 전에 한 테스트 결과는 로그인 뒤 계정에 저장한다 (F19).
  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    const local = u ? loadLocalTest() : null;
    if (local) api.typeTest({ answers: local.answers }).then(clearLocalTest).catch(() => {});
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUserState(null);
  }, []);

  return <Ctx.Provider value={{ user, loading, setUser, logout }}>{children}</Ctx.Provider>;
}
