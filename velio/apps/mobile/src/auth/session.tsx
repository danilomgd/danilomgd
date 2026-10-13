import type { AuthTokens, UserPublic } from '@velio/contracts';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { flushAnalytics } from '@/lib/analytics';
import { api, onUnauthorized } from '@/lib/api';
import { queryClient } from '@/lib/query';
import { disconnectRealtime } from '@/lib/realtime';
import { type StoredSession, sessionStorage } from '@/lib/storage';

export interface SessionState {
  /** `loading` enquanto lê o armazenamento seguro na abertura. */
  status: 'loading' | 'anonymous' | 'authenticated';
  user: UserPublic | null;
  needsOnboarding: boolean;
  /** Mensagem para a tela de login (ex.: sessão expirada). */
  notice: string | null;
  signIn: (tokens: AuthTokens) => Promise<void>;
  completeOnboarding: (user: UserPublic) => Promise<void>;
  setUser: (user: UserPublic) => Promise<void>;
  signOut: (notice?: string) => Promise<void>;
  clearNotice: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    sessionStorage.load().then(setSession);
  }, []);

  const signOut = useCallback(async (msg?: string) => {
    await flushAnalytics().catch(() => {});
    try {
      await api.auth.logout();
    } catch {
      // sessão pode já estar inválida
    }
    disconnectRealtime();
    await sessionStorage.save(null);
    queryClient.clear();
    setSession(null);
    if (msg) setNotice(msg);
  }, []);

  useEffect(() => onUnauthorized(() => void signOut('Sua sessão expirou. Entre de novo.')), [signOut]);

  const signIn = useCallback(async (tokens: AuthTokens) => {
    const s: StoredSession = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      needsOnboarding: tokens.needsOnboarding,
      user: tokens.user,
    };
    await sessionStorage.save(s);
    setSession(s);
    setNotice(null);
  }, []);

  const setUser = useCallback(async (user: UserPublic) => {
    const current = await sessionStorage.load();
    if (!current) return;
    const next = { ...current, user };
    await sessionStorage.save(next);
    setSession(next);
  }, []);

  const completeOnboarding = useCallback(async (user: UserPublic) => {
    const current = await sessionStorage.load();
    if (!current) return;
    const next = { ...current, user, needsOnboarding: false };
    await sessionStorage.save(next);
    setSession(next);
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      status: session === undefined ? 'loading' : session ? 'authenticated' : 'anonymous',
      user: session?.user ?? null,
      needsOnboarding: session?.needsOnboarding ?? false,
      notice,
      signIn,
      completeOnboarding,
      setUser,
      signOut,
      clearNotice: () => setNotice(null),
    }),
    [session, notice, signIn, completeOnboarding, setUser, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession fora de SessionProvider');
  return ctx;
}
