import Big from 'big.js';

// El dinero viaja como string decimal ("125.50"). Nunca se convierte a number.
export type Money = string;

export function toBig(value: Money | null | undefined): Big {
  try {
    return new Big(value ?? '0');
  } catch {
    return new Big(0);
  }
}

export function isValidAmount(input: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(input) && toBig(input).gt(0);
}

/** Normaliza lo que escribe el usuario ("1.250,5" o "1250.5") a "1250.50". */
export function normalizeAmountInput(input: string): string {
  const cleaned = input.replace(/\s/g, '');
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const decimalSep = lastComma > lastDot ? ',' : '.';
  const thousandsSep = decimalSep === ',' ? '.' : ',';
  const plain = cleaned.split(thousandsSep).join('').replace(decimalSep, '.');
  if (!/^\d*(\.\d*)?$/.test(plain) || plain === '' || plain === '.') return '';
  return toBig(plain).toFixed(2);
}

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** "1250.5" → "1.250,50" (formato venezolano) sin pasar por float. */
export function formatAmount(value: Money | null | undefined): string {
  const fixed = toBig(value).toFixed(2);
  const negative = fixed.startsWith('-');
  const [intPart, dec] = fixed.replace('-', '').split('.');
  return `${negative ? '-' : ''}${group(intPart)},${dec}`;
}

export const formatUsd = (v: Money | null | undefined) => `$${formatAmount(v)}`;
export const formatBs = (v: Money | null | undefined) => `Bs. ${formatAmount(v)}`;

/** Porcentaje usado, 0..100, para barras de progreso (solo visual). */
export function ratio(part: Money | null | undefined, total: Money | null | undefined): number {
  const t = toBig(total);
  if (t.lte(0)) return 0;
  const r = Number(toBig(part).div(t).times(100).toFixed(0));
  return Math.max(0, Math.min(100, r));
}
