// Reglas de bloqueo por inactividad, separadas de la UI para poder probarlas.

/** En segundo plano más de esto → al volver se pide biometría/PIN. */
export const LOCK_AFTER_MS = 60_000;
/** Sin biometría ni PIN en el equipo no hay con qué desbloquear: pasado esto se cierra la sesión. */
export const SIGN_OUT_AFTER_MS = 5 * 60_000;

export type ResumeAction = 'none' | 'lock' | 'signOut';

/**
 * Qué hacer al volver a la app. `backgroundedAt` null = la app no estuvo en segundo plano
 * (arranque en frío con sesión guardada): se bloquea siempre que haya con qué.
 */
export function onResume(opts: {
  backgroundedAt: number | null;
  now: number;
  canLock: boolean;
}): ResumeAction {
  const away = opts.backgroundedAt == null ? Infinity : opts.now - opts.backgroundedAt;
  if (opts.canLock) return away >= LOCK_AFTER_MS ? 'lock' : 'none';
  // Arranque en frío sin bloqueo del equipo: el token está en el Keystore/Keychain, se deja pasar.
  if (opts.backgroundedAt == null) return 'none';
  return away >= SIGN_OUT_AFTER_MS ? 'signOut' : 'none';
}
