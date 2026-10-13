'use client';

import { createApi, HttpClient, RealtimeClient, type TokenStore } from '@velio/api-client';
import type { UserPublic } from '@velio/contracts';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const TOKENS_KEY = 'velio.web.tokens';
const USER_KEY = 'velio.web.user';

type Tokens = { accessToken: string; refreshToken: string };

function safeRead<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* armazenamento indisponível (modo privado); sessão vive só em memória */
  }
}

/** Guarda tokens em localStorage e avisa assinantes quando a sessão muda. */
export class LocalTokenStore implements TokenStore {
  private cache: Tokens | null | undefined;
  private listeners = new Set<() => void>();

  private load(): Tokens | null {
    if (this.cache === undefined) this.cache = safeRead<Tokens>(TOKENS_KEY);
    return this.cache;
  }
  getAccessToken() {
    return this.load()?.accessToken ?? null;
  }
  getRefreshToken() {
    return this.load()?.refreshToken ?? null;
  }
  setTokens(t: Tokens | null) {
    this.cache = t;
    safeWrite(TOKENS_KEY, t);
    if (t === null) safeWrite(USER_KEY, null);
    for (const l of this.listeners) l();
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const tokenStore = new LocalTokenStore();

export function readCachedUser(): UserPublic | null {
  return safeRead<UserPublic>(USER_KEY);
}
export function writeCachedUser(u: UserPublic | null) {
  safeWrite(USER_KEY, u);
}

export const http = new HttpClient({
  baseUrl: API_URL,
  tokens: tokenStore,
  appHeader: 'web',
  onUnauthorized: () => {
    tokenStore.setTokens(null);
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.assign(`/login?next=${next}`);
    }
  },
});

export const api = createApi(http);

let realtime: RealtimeClient | null = null;
export function getRealtime(): RealtimeClient {
  if (!realtime) realtime = new RealtimeClient({ baseUrl: API_URL, getAccessToken: () => tokenStore.getAccessToken() });
  return realtime;
}
export function resetRealtime() {
  realtime?.disconnect();
  realtime = null;
}
