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
    // Error definitivo (4xx): el intento terminó, la próxima vez es uno nuevo.
    // Error de red / timeout / 5xx: conservamos la key para reintentar sin duplicar.
    if (!(e instanceof ApiError) || !e.retryable) await secureStorage.remove(storageKey(intent));
    throw e;
  }
}
