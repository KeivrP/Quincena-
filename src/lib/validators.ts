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

/** "v-12.345.678" → "V12345678" */
export function normalizeCedula(input: string): string {
  const raw = input.toUpperCase().replace(/[\s.\-]/g, '');
  const m = raw.match(/^([VEJ])?(\d+)$/);
  if (!m) return raw;
  return `${m[1] ?? 'V'}${m[2]}`;
}

export function isValidCedula(input: string): boolean {
  return /^[VEJ]\d{6,9}$/.test(normalizeCedula(input));
}

export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

export function passwordIssues(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < 8) issues.push('Al menos 8 caracteres');
  if (!/[A-Z]/.test(pw)) issues.push('Una mayúscula');
  if (!/[a-z]/.test(pw)) issues.push('Una minúscula');
  if (!/\d/.test(pw)) issues.push('Un número');
  return issues;
}

/** Fecha civil "2026-11-15" → "15/11/2026" sin convertir zona horaria. */
export function formatCivilDate(date: string | null | undefined): string {
  if (!date) return '—';
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : date;
}
