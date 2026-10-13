import { HttpClient, type TokenStore, createApi } from '@velio/api-client';
import { API_URL, APP_ROLE } from './config';
import { sessionStorage } from './storage';

/** TokenStore sobre o armazenamento seguro de sessão. */
export const tokenStore: TokenStore = {
  async getAccessToken() {
    return (await sessionStorage.load())?.accessToken ?? null;
  },
  async getRefreshToken() {
    return (await sessionStorage.load())?.refreshToken ?? null;
  },
  async setTokens(t) {
    await sessionStorage.setTokens(t);
  },
};

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/** Chamado quando o refresh falha: a sessão provider escuta e volta ao login. */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

export const http = new HttpClient({
  baseUrl: API_URL,
  tokens: tokenStore,
  appHeader: APP_ROLE,
  onUnauthorized: () => {
    for (const l of unauthorizedListeners) l();
  },
});

/** Superfície tipada da API (rotas em `packages/api-client`). */
export const api = createApi(http);

export type Api = typeof api;
