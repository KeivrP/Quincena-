import { secureStorage } from '../lib/storage';
import type { TokenPair } from './types';

const KEY = 'xc.session';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number; // epoch ms
}

let cache: StoredSession | null | undefined;

function decodeJwtExp(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(globalThis.atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function sessionFromPair(pair: TokenPair): StoredSession {
  const fromJwt = decodeJwtExp(pair.access_token);
  const fromTtl = Date.now() + 15 * 60 * 1000;
  if (!pair.refresh_token) {
    // Solo pasa con `X-Client: portal` (refresh en cookie HttpOnly); este cliente
    // móvil nunca manda ese header, así que el servidor siempre lo incluye aquí.
    throw new Error('El servidor no devolvió refresh_token.');
  }
  return {
    accessToken: pair.access_token,
    refreshToken: pair.refresh_token,
    accessExpiresAt: fromJwt ?? fromTtl,
  };
}

export async function loadSession(): Promise<StoredSession | null> {
  if (cache !== undefined) return cache;
  const raw = await secureStorage.get(KEY);
  cache = raw ? (JSON.parse(raw) as StoredSession) : null;
  return cache;
}

/** Guarda SIEMPRE el par nuevo: el refresh token es de un solo uso. */
export async function saveSession(pair: TokenPair): Promise<StoredSession> {
  const s = sessionFromPair(pair);
  cache = s;
  await secureStorage.set(KEY, JSON.stringify(s));
  return s;
}

export async function clearSession(): Promise<void> {
  cache = null;
  await secureStorage.remove(KEY);
}
