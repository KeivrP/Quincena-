import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
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

/**
 * Por qué terminó la sesión: `session_revoked` (logout, reúso de refresh, reset, tope de 30 días),
 * `user_inactive` (RRHH desactivó la cuenta) o `not_employee` (403 sin reason: la cuenta no es de
 * trabajador). Login lo muestra (guía §4.7).
 */
export type SessionEndReason = 'session_revoked' | 'user_inactive' | 'not_employee';

type Listener<T> = (arg: T) => void;
const sessionExpiredListeners = new Set<Listener<SessionEndReason>>();
const passwordChangeListeners = new Set<Listener<void>>();
let lastEndReason: SessionEndReason | null = null;

/** La app se suscribe para volver a Login cuando la sesión ya no se puede recuperar. */
export function onSessionExpired(fn: Listener<SessionEndReason>): () => void {
  sessionExpiredListeners.add(fn);
  return () => sessionExpiredListeners.delete(fn);
}

/**
 * Red de seguridad de la guía §5.1: un `403 password_change_required` significa que el servidor
 * exige cambiar la contraseña temporal aunque el estado local diga lo contrario.
 */
export function onPasswordChangeRequired(fn: Listener<void>): () => void {
  passwordChangeListeners.add(fn);
  return () => passwordChangeListeners.delete(fn);
}

/** Motivo del último cierre de sesión forzado (se consume una vez, para el aviso de Login). */
export function takeSessionEndReason(): SessionEndReason | null {
  const r = lastEndReason;
  lastEndReason = null;
  return r;
}

/**
 * "RealMedio/1.2.0 (Android 14; SM-A145M)": la lista de dispositivos conectados (`GET /app/sessions`)
 * muestra el User-Agent, así que tiene que ser reconocible (guía §4.8). Nunca lleva datos personales.
 */
function userAgent(): string {
  try {
    const version = Constants.expoConfig?.version ?? '0';
    const os = `${Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS} ${
      Device.osVersion ?? ''
    }`.trim();
    const model = Device.modelName ?? 'dispositivo';
    return `RealMedio/${version} (${os}; ${model})`;
  } catch {
    return 'RealMedio';
  }
}
let cachedUserAgent: string | null = null;

async function rawFetch(path: string, opts: RequestOptions, accessToken?: string): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json, application/problem+json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  if (Platform.OS !== 'web') headers['User-Agent'] = cachedUserAgent ??= userAgent();

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

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const requestIdOf = (res: Response) => res.headers?.get?.('X-Request-Id') ?? undefined;

/**
 * Un cuerpo con `code` es un error AUNQUE el status sea 2xx (el 202 `disbursement_pending_review`
 * de `POST /app/loans`; guía §3.3). Todo error llega como problem+json; si no, se arma uno mínimo.
 */
async function parse<T>(res: Response): Promise<T> {
  const data = await readBody(res);
  const hasCode = !!data && typeof data === 'object' && typeof (data as Problem).code === 'string';
  if (!res.ok || hasCode) {
    const problem: Problem =
      data && typeof data === 'object' ? (data as Problem) : { title: `Error ${res.status}`, status: res.status };
    throw new ApiError(res.status, problem, requestIdOf(res));
  }
  return data as T;
}

// ---------- Refresh single-flight ----------
// Si varias llamadas necesitan refrescar a la vez, todas esperan la MISMA promesa.
// Reusar un refresh gastado después de 15 s hace que el servidor revoque la sesión.
let refreshInFlight: Promise<StoredSession> | null = null;

function refreshSession(current: StoredSession): Promise<StoredSession> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const res = await rawFetch('/auth/refresh', {
        method: 'POST',
        body: { refresh_token: current.refreshToken },
      });
      const pair = await parse<TokenPair>(res);
      return saveSession(pair); // persistir el par nuevo ANTES de seguir
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function expireSession(reason: SessionEndReason = 'session_revoked'): Promise<never> {
  await clearSession();
  lastEndReason = reason;
  sessionExpiredListeners.forEach((fn) => fn(reason));
  throw new ApiError(401, {
    title: 'Sesión expirada',
    status: 401,
    code: 'unauthorized',
    extra: { reason },
  });
}

/** Un refresh que falla: sin red se reintenta luego; con 429 se espera; cualquier otra cosa → Login. */
function refreshFailure(e: unknown): Promise<never> {
  if (e instanceof ApiError && (e.status === 0 || e.status === 429 || e.status >= 500)) throw e;
  const reason = e instanceof ApiError && e.reason === 'user_inactive' ? 'user_inactive' : 'session_revoked';
  return expireSession(reason);
}

async function validAccessToken(): Promise<string> {
  const s = await loadSession();
  if (!s) return expireSession();
  if (s.accessExpiresAt - Date.now() > REFRESH_MARGIN_MS) return s.accessToken;
  try {
    return (await refreshSession(s)).accessToken;
  } catch (e) {
    return refreshFailure(e);
  }
}

/** Reason de un 401/403 sin consumir el cuerpo original (se clona). */
async function peekReason(res: Response): Promise<string | undefined> {
  try {
    const clone = typeof res.clone === 'function' ? res.clone() : res;
    const body = (await readBody(clone)) as Problem | undefined;
    return body?.extra?.reason as string | undefined;
  } catch {
    return undefined;
  }
}

/** 403 en `/app/*` (guía §4.7): contraseña temporal → cambiarla; sin reason → no es trabajador. */
async function handleForbidden(path: string, res: Response): Promise<void> {
  if (res.status !== 403 || !path.startsWith('/app/')) return;
  const reason = await peekReason(res);
  if (reason === 'password_change_required') passwordChangeListeners.forEach((fn) => fn());
  else if (!reason) await expireSession('not_employee').catch(() => undefined);
}

async function authedFetch(path: string, opts: RequestOptions): Promise<Response> {
  const auth = opts.auth ?? true;
  if (!auth) return rawFetch(path, opts);

  const token = await validAccessToken();
  const res = await rawFetch(path, opts, token);
  if (res.status === 403) await handleForbidden(path, res);
  if (res.status !== 401) return res;

  // Guía §4.7: solo `token_expired` (y una vez `invalid_token`) se recuperan con refresh.
  const reason = await peekReason(res);
  if (reason === 'user_inactive') return expireSession('user_inactive');
  if (reason && reason !== 'token_expired' && reason !== 'invalid_token') return expireSession();

  const s = await loadSession();
  if (!s) return expireSession();
  let fresh: StoredSession;
  try {
    fresh = s.accessToken === token ? await refreshSession(s) : s;
  } catch (e) {
    return refreshFailure(e);
  }
  const retry = await rawFetch(path, opts, fresh.accessToken);
  if (retry.status === 401) {
    const again = await peekReason(retry);
    return expireSession(again === 'user_inactive' ? 'user_inactive' : 'session_revoked');
  }
  if (retry.status === 403) await handleForbidden(path, retry);
  return retry;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return parse<T>(await authedFetch(path, opts));
}
