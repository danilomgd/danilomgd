'use client';

import type { AuthTokens, UserPublic, UserRole } from '@velio/contracts';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, readCachedUser, resetRealtime, tokenStore, writeCachedUser } from './api';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export interface AuthState {
  status: AuthStatus;
  user: UserPublic | null;
  roles: UserRole[];
  isAdmin: boolean;
  isOperator: boolean;
  login: (email: string, password: string) => Promise<AuthTokens>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<UserPublic | null>(null);

  // Hidrata a sessão a partir do localStorage e revalida com /v1/me.
  useEffect(() => {
    let cancelled = false;
    const token = tokenStore.getAccessToken();
    if (!token) {
      setStatus('anonymous');
      return;
    }
    const cached = readCachedUser();
    if (cached) {
      setUser(cached);
      setStatus('authenticated');
    }
    api.auth
      .me()
      .then((me) => {
        if (cancelled) return;
        writeCachedUser(me);
        setUser(me);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        // Sem token válido → onUnauthorized já limpou. Sem rede: mantém o cache se houver;
        // sem cache não há como saber o papel, então volta ao login (que mostra o erro de conexão).
        if (!tokenStore.getAccessToken() || !cached) {
          setUser(null);
          setStatus('anonymous');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sincroniza logout entre abas e com onUnauthorized.
  useEffect(() => {
    const unsubscribe = tokenStore.subscribe(() => {
      if (!tokenStore.getAccessToken()) {
        setUser(null);
        setStatus('anonymous');
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await api.auth.passwordLogin({ email, password });
    tokenStore.setTokens({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    writeCachedUser(tokens.user);
    setUser(tokens.user);
    setStatus('authenticated');
    return tokens;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      /* sessão pode já ter expirado no servidor */
    }
    resetRealtime();
    tokenStore.setTokens(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthState>(() => {
    const roles = user?.roles ?? [];
    return {
      status,
      user,
      roles,
      isAdmin: roles.includes('admin'),
      isOperator: roles.includes('operator') || roles.includes('admin'),
      login,
      logout,
    };
  }, [status, user, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa de AuthProvider');
  return ctx;
}

/** Destino padrão após login, pelo papel. */
export function homeForRoles(roles: UserRole[]): string {
  if (roles.includes('operator')) return '/ops';
  if (roles.includes('admin')) return '/admin';
  return '/forbidden';
}
