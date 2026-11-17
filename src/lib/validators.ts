// Validaciones solo para feedback inmediato; la fuente de verdad es el servidor.
export const MOBILE_PREFIXES = ['0412', '0414', '0416', '0424', '0426'];

export function normalizePhone(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('58')) digits = '0' + digits.slice(2);
  return digits;
}

export function isValidPhone(input: string): boolean {
  const p = normalizePhone(input);
  return p.length === 11 && MOBILE_PREFIXES.includes(p.slice(0, 4));
}

/** Prefijos de cédula/RIF que acepta el backend (guía §3.2). */
const ID_PREFIXES = 'VEJGPC';

/** "v-12.345.678" → "V12345678" */
export function normalizeCedula(input: string): string {
  const raw = input.toUpperCase().replace(/[\s.\-]/g, '');
  const m = raw.match(new RegExp(`^([${ID_PREFIXES}])?(\\d+)$`));
  if (!m) return raw;
  return `${m[1] ?? 'V'}${m[2]}`;
}

/** Prefijo V E J G P C y de 6 a 10 dígitos. */
export function isValidCedula(input: string): boolean {
  return new RegExp(`^[${ID_PREFIXES}]\\d{6,10}$`).test(normalizeCedula(input));
}

export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

export const PASSWORD_RULES = ['Al menos 8 caracteres', 'Una mayúscula', 'Una minúscula', 'Un número'] as const;

/**
 * Política única de contraseñas del servidor (guía §4.5): 8 a 128 caracteres, con minúscula,
 * mayúscula y número, sin espacios al inicio ni al final. La app nunca debe aceptar lo que el
 * servidor rechaza.
 */
export function passwordIssues(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < 8) issues.push('Al menos 8 caracteres');
  if (pw.length > 128) issues.push('Máximo 128 caracteres');
  if (!/[A-Z]/.test(pw)) issues.push('Una mayúscula');
  if (!/[a-z]/.test(pw)) issues.push('Una minúscula');
  if (!/\d/.test(pw)) issues.push('Un número');
  if (pw.length > 0 && pw !== pw.trim()) issues.push('Sin espacios al inicio ni al final');
  return issues;
}

/** Fecha civil "2026-11-15" → "15/11/2026" sin convertir zona horaria (guía §3.2). */
export function formatCivilDate(date: string | null | undefined): string {
  if (!date) return '—';
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : date;
}

/** Venezuela no tiene horario de verano: UTC−4 todo el año. */
const CARACAS_OFFSET_MS = 4 * 60 * 60 * 1000;

/** Fecha civil de hoy en Caracas ("2026-11-16"): la que se manda como `payment_date`. */
export function todayInCaracas(now: Date = new Date()): string {
  return new Date(now.getTime() - CARACAS_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Un instante `*_at` ("2026-11-16T02:30:00Z") como fecha de Caracas "15/11/2026". Los instantes sí
 * se convierten de zona; las fechas civiles no (guía §3.2).
 */
export function formatInstantDate(instant: string | null | undefined): string {
  if (!instant) return '—';
  const t = Date.parse(instant);
  if (Number.isNaN(t)) return formatCivilDate(instant);
  return formatCivilDate(new Date(t - CARACAS_OFFSET_MS).toISOString());
}

/** Igual que `formatInstantDate`, con la hora: "15/11/2026 10:30 p. m.". */
export function formatInstantDateTime(instant: string | null | undefined): string {
  if (!instant) return '—';
  const t = Date.parse(instant);
  if (Number.isNaN(t)) return formatCivilDate(instant);
  const local = new Date(t - CARACAS_OFFSET_MS);
  const h24 = local.getUTCHours();
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${formatCivilDate(local.toISOString())} ${h12}:${mm} ${h24 < 12 ? 'a. m.' : 'p. m.'}`;
}
