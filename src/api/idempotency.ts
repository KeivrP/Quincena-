import * as Crypto from 'expo-crypto';
import { secureStorage } from '../lib/storage';
import { ApiError } from './errors';

// Una Idempotency-Key (UUID v4) por INTENTO LÓGICO, persistida para que sobreviva a que la app
// se cierre a mitad de un envío. Si el usuario reintenta la misma acción con los mismos datos,
// se reusa la misma key; si cambia los datos, es otro intento y se genera una nueva.

interface Pending {
  key: string;
  payload: string;
}

const storageKey = (intent: string) => `xc.idem.${intent}`;

export async function withIdempotency<T>(
  intent: string,
  payload: unknown,
  run: (key: string) => Promise<T>,
): Promise<T> {
  const serialized = JSON.stringify(payload);
  const raw = await secureStorage.get(storageKey(intent));
  const pending: Pending | null = raw ? JSON.parse(raw) : null;
  const key = pending && pending.payload === serialized ? pending.key : Crypto.randomUUID();
  await secureStorage.set(storageKey(intent), JSON.stringify({ key, payload: serialized }));

  try {
    const result = await run(key);
    await secureStorage.remove(storageKey(intent));
    return result;
  } catch (e) {
    // Guía §3.4: sin respuesta (red/timeout) o `in_progress` → la MISMA key en el reintento.
    // Respuesta de error con cuerpo (4xx, 502, 503…) → el intento terminó: el siguiente va con
    // clave nueva (un 5xx deja la clave bloqueada ~30 s en el servidor, así que también conviene).
    if (!(e instanceof ApiError) || !e.keepsIdempotencyKey) await secureStorage.remove(storageKey(intent));
    throw e;
  }
}
