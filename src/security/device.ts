import * as Device from 'expo-device';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

// Defensas del lado del teléfono (pentest de Credicard, #4/#5): detectar root/jailbreak y
// pedir la biometría o el PIN del equipo antes de mover dinero. Son señales del cliente,
// evadibles por alguien con control total del equipo; la verdad la tiene el servidor (topes,
// reautenticación al cambiar la cuenta de cobro, bitácora). Aquí se sube el costo del ataque.

const isNative = Platform.OS === 'android' || Platform.OS === 'ios';

let rootedCheck: Promise<boolean> | null = null;

/**
 * Root (Android) o jailbreak (iOS). Heurística de Expo: se cachea por proceso. En desarrollo
 * devuelve false para poder probar en emuladores y equipos de QA.
 */
export function isDeviceCompromised(): Promise<boolean> {
  if (!isNative || __DEV__) return Promise.resolve(false);
  rootedCheck ??= Device.isRootedExperimentalAsync().catch(() => false);
  return rootedCheck;
}

/** ¿El equipo tiene biometría o al menos PIN/patrón configurado? */
export async function canUseDeviceLock(): Promise<boolean> {
  if (!isNative) return false;
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

/** Pide la huella/rostro o el PIN del equipo. `true` si lo confirmó. */
export async function authenticateWithDevice(promptMessage: string): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancelar',
      // Si no hay biometría, cae al PIN/patrón del equipo: nunca deja al trabajador afuera.
      disableDeviceFallback: false,
    });
    return r.success;
  } catch {
    return false;
  }
}

export type SensitiveCheck = { ok: true } | { ok: false; message: string };

export const ROOTED_MESSAGE =
  'Por seguridad, no se pueden hacer operaciones con dinero en un teléfono con root o jailbreak. ' +
  'Usa un teléfono sin modificar.';

/**
 * Antes de una operación con dinero o que cambia a dónde va el dinero: el equipo no puede estar
 * rooteado y el dueño confirma con biometría/PIN (si el equipo tiene uno configurado; si no,
 * el servidor sigue pidiendo lo suyo).
 */
export async function confirmSensitiveAction(reason: string): Promise<SensitiveCheck> {
  if (await isDeviceCompromised()) return { ok: false, message: ROOTED_MESSAGE };
  if (!(await canUseDeviceLock())) return { ok: true };
  return (await authenticateWithDevice(reason))
    ? { ok: true }
    : { ok: false, message: 'No pudimos confirmar que eres tú. Inténtalo de nuevo.' };
}
