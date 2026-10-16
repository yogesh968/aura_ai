import type { AuthResponse, Health } from '@aura/shared';
import { getApiBaseUrl } from './config';

/** The server answered with an error (4xx/5xx). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

/** The server could not be reached (offline, DNS, timeout). Safe to retry later. */
export class NetworkError extends Error {
  constructor(message = "You're offline or the server can't be reached.") {
    super(message);
  }
}

export function isNetworkError(e: unknown): e is NetworkError {
  return e instanceof NetworkError;
}

export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  if (e instanceof ApiError || e instanceof NetworkError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

// ---- Token plumbing (provided by the auth store to avoid import cycles) -------

interface TokenProvider {
  getAccessToken: () => string | null;
  /** Exchange the refresh token; resolves to the new access token, or null if the session is gone. */
  refresh: () => Promise<string | null>;
  onSessionExpired: () => void;
}

let tokens: TokenProvider | null = null;
export function registerTokenProvider(p: TokenProvider) {
  tokens = p;
}

let refreshing: Promise<string | null> | null = null;
function refreshOnce(): Promise<string | null> {
  if (!tokens) return Promise.resolve(null);
  refreshing ??= tokens.refresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

// ---- Requests -------------------------------------------------------------

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  auth?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Return the raw text body instead of JSON (e.g. CSV export). */
  raw?: boolean;
}

export function buildUrl(path: string, query?: RequestOptions['query']) {
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  return `${getApiBaseUrl()}${path}${qs ? `?${qs}` : ''}`;
}

async function send(path: string, opts: RequestOptions, accessToken: string | null): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onAbort);
  try {
    return await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    throw new NetworkError();
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: { error?: { code?: string; message?: string; details?: unknown } } = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON error */
  }
  const fallback = res.status >= 500 ? 'The server had a problem. Please try again.' : `Request failed (${res.status})`;
  return new ApiError(res.status, body.error?.code ?? 'http_error', body.error?.message ?? fallback, body.error?.details);
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const useAuth = opts.auth !== false;
  let res = await send(path, opts, useAuth ? (tokens?.getAccessToken() ?? null) : null);

  if (res.status === 401 && useAuth && tokens) {
    const fresh = await refreshOnce();
    if (!fresh) {
      tokens.onSessionExpired();
      throw await toApiError(res);
    }
    res = await send(path, opts, fresh);
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  if (opts.raw) return (await res.text()) as T;
  return (await res.json()) as T;
}

/**
 * Probe a candidate server without touching the configured base URL or
 * sending any credentials (used before switching servers).
 */
export async function checkServerHealth(baseUrl: string): Promise<Health> {
  const clean = baseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s]+$/i.test(clean)) throw new Error('Enter a URL starting with http:// or https://');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let res: Response;
  try {
    res = await fetch(`${clean}/health`, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch {
    throw new NetworkError("Couldn't reach that server.");
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new ApiError(res.status, 'http_error', `The server answered ${res.status}`);
  const body = (await res.json().catch(() => null)) as Health | null;
  if (body?.status !== 'ok') throw new ApiError(res.status, 'not_aura', "That address doesn't look like an AURA server.");
  return body;
}

/** Unauthenticated refresh call used by the auth store. */
export async function refreshSession(refreshToken: string): Promise<AuthResponse> {
  return api<AuthResponse>('/v1/auth/refresh', { method: 'POST', body: { refreshToken }, auth: false });
}

/** Current access token for streaming requests (refreshing first if needed). */
export async function getFreshAccessToken(forceRefresh = false): Promise<string | null> {
  if (forceRefresh) return refreshOnce();
  return tokens?.getAccessToken() ?? null;
}
