import type { ApiError } from '@velio/contracts';

export interface TokenStore {
  getAccessToken(): Promise<string | null> | string | null;
  getRefreshToken(): Promise<string | null> | string | null;
  setTokens(t: { accessToken: string; refreshToken: string } | null): Promise<void> | void;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface HttpClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  fetchImpl?: typeof fetch;
  onUnauthorized?: () => void;
  appHeader?: 'customer' | 'provider' | 'web';
}

/**
 * Cliente mínimo com refresh automático e erro tipado. Sem dependências além de fetch.
 */
export class HttpClient {
  private refreshing: Promise<boolean> | null = null;
  constructor(private readonly o: HttpClientOptions) {}

  async request<T>(method: string, path: string, body?: unknown, opts: { retry?: boolean; query?: Record<string, string | number | boolean | undefined> } = {}): Promise<T> {
    const f = this.o.fetchImpl ?? fetch;
    const url = new URL(path, this.o.baseUrl);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const access = await this.o.tokens.getAccessToken();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (access) headers.Authorization = `Bearer ${access}`;
    if (this.o.appHeader) headers['X-Velio-App'] = this.o.appHeader;
    const res = await f(url.toString(), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.status === 401 && opts.retry !== false) {
      const ok = await this.refresh();
      if (ok) return this.request<T>(method, path, body, { ...opts, retry: false });
      this.o.onUnauthorized?.();
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const json = text ? (JSON.parse(text) as unknown) : null;
    if (!res.ok) {
      const err = (json as ApiError | null)?.error;
      throw new ApiRequestError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? res.statusText, err?.details);
    }
    return json as T;
  }

  private refresh(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = (async () => {
        try {
          const rt = await this.o.tokens.getRefreshToken();
          if (!rt) return false;
          const f = this.o.fetchImpl ?? fetch;
          const res = await f(new URL('/v1/auth/refresh', this.o.baseUrl).toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: rt }),
          });
          if (!res.ok) {
            await this.o.tokens.setTokens(null);
            return false;
          }
          const data = (await res.json()) as { accessToken: string; refreshToken: string };
          await this.o.tokens.setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
          return true;
        } catch {
          return false;
        } finally {
          this.refreshing = null;
        }
      })();
    }
    return this.refreshing;
  }

  get<T>(path: string, query?: Record<string, string | number | boolean | undefined>) {
    return this.request<T>('GET', path, undefined, { query });
  }
  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body ?? {});
  }
  patch<T>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, body ?? {});
  }
  put<T>(path: string, body?: unknown) {
    return this.request<T>('PUT', path, body ?? {});
  }
  delete<T>(path: string) {
    return this.request<T>('DELETE', path);
  }
}

export class MemoryTokenStore implements TokenStore {
  private t: { accessToken: string; refreshToken: string } | null = null;
  getAccessToken() {
    return this.t?.accessToken ?? null;
  }
  getRefreshToken() {
    return this.t?.refreshToken ?? null;
  }
  setTokens(t: { accessToken: string; refreshToken: string } | null) {
    this.t = t;
  }
}
