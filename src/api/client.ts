import { API_BASE_URL, DEFAULT_TIMEOUT_MS, REFRESH_MARGIN_MS, USE_MOCK } from './config';
import { ApiError, networkError } from './errors';
import { mockRequest } from './mock';
import { clearSession, loadSession, saveSession, type StoredSession } from './tokens';
import type { Problem, TokenPair } from './types';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  idempotencyKey?: string;
  timeoutMs?: number;
}

type Listener = () => void;
const sessionExpiredListeners = new Set<Listener>();

/** La app se suscribe para volver a Login cuando la sesión ya no se puede recuperar. */
export function onSessionExpired(fn: Listener): () => void {
  sessionExpiredListeners.add(fn);
  return () => sessionExpiredListeners.delete(fn);
}

async function rawFetch(path: string, opts: RequestOptions, accessToken?: string): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json, application/problem+json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  if (USE_MOCK) return mockRequest(opts.method ?? 'GET', path, opts.body, headers);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    throw networkError((e as Error)?.name === 'AbortError');
  } finally {
    clearTimeout(timer);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }
  if (!res.ok) {
    // Todo error llega como application/problem+json; si no, armamos uno mínimo.
    const problem: Problem =
      data && typeof data === 'object' ? (data as Problem) : { title: `Error ${res.status}`, status: res.status };
    throw new ApiError(res.status, problem);
  }
  return data as T;
}

// ---------- Refresh single-flight ----------
// Si varias llamadas necesitan refrescar a la vez, todas esperan la MISMA promesa.
// Disparar dos refresh con el mismo refresh_token hace que el servidor revoque la sesión.
let refreshInFlight: Promise<StoredSession> | null = null;

function refreshSession(current: StoredSession): Promise<StoredSession> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const res = await rawFetch('/auth/refresh', {
        method: 'POST',
        body: { refresh_token: current.refreshToken },
      });
      const pair = await parse<TokenPair>(res);
      return saveSession(pair);
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function expireSession(): Promise<never> {
  await clearSession();
  sessionExpiredListeners.forEach((fn) => fn());
  throw new ApiError(401, {
    title: 'Sesión expirada',
    status: 401,
    extra: { reason: 'session_revoked' },
  });
}

async function validAccessToken(): Promise<string> {
  const s = await loadSession();
  if (!s) return expireSession();
  if (s.accessExpiresAt - Date.now() > REFRESH_MARGIN_MS) return s.accessToken;
  try {
    return (await refreshSession(s)).accessToken;
  } catch (e) {
    if (e instanceof ApiError && e.retryable) throw e; // sin red: no cerramos sesión
    return expireSession();
  }
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const auth = opts.auth ?? true;
  if (!auth) return parse<T>(await rawFetch(path, opts));

  const token = await validAccessToken();
  const res = await rawFetch(path, opts, token);
  if (res.status !== 401) return parse<T>(res);

  // 401 con token "vigente": intentamos un refresh (compartido) y reintentamos una sola vez.
  const s = await loadSession();
  if (!s) return expireSession();
  let fresh: StoredSession;
  try {
    fresh = s.accessToken === token ? await refreshSession(s) : s;
  } catch (e) {
    if (e instanceof ApiError && e.retryable) throw e;
    return expireSession();
  }
  const retry = await rawFetch(path, opts, fresh.accessToken);
  if (retry.status === 401) return expireSession();
  return parse<T>(retry);
}
