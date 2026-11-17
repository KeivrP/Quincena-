// La URL base sale de variables de entorno (EXPO_PUBLIC_*), nunca hardcodeada en pantallas.
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://developer.dis-global.com/creditos/api/v1'
).replace(/\/+$/, '');

export const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === '1';

export const DEFAULT_TIMEOUT_MS = 20_000;
// Solicitar un crédito desembolsa en línea y puede tardar: timeout ≥ 60 s.
export const DISBURSE_TIMEOUT_MS = 90_000;
// Reportar un abono espera la validación del banco: timeout ≥ 30 s (guía §10.6).
export const PAYMENT_TIMEOUT_MS = 45_000;
// El login se demora progresivamente tras fallos (hasta ~8 s; guía §3.5).
export const LOGIN_TIMEOUT_MS = 30_000;
// Refrescar el access token si le quedan menos de 30 s.
export const REFRESH_MARGIN_MS = 30_000;
