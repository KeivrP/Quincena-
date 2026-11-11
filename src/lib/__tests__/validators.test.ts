import {
  formatCivilDate,
  isValidCedula,
  isValidEmail,
  isValidPhone,
  normalizeCedula,
  normalizePhone,
  passwordIssues,
} from '../validators';

describe('teléfono', () => {
  it('normaliza el prefijo internacional 58', () => {
    expect(normalizePhone('+58 414-123-4567')).toBe('04141234567');
    expect(normalizePhone('0414 123 4567')).toBe('04141234567');
  });
  it.each(['04121234567', '04141234567', '04161234567', '04241234567', '04261234567', '+584141234567'])(
    'acepta %s',
    (p) => expect(isValidPhone(p)).toBe(true),
  );
  it.each(['02121234567', '0414123456', '041412345678', ''])('rechaza %p', (p) => expect(isValidPhone(p)).toBe(false));
});

describe('cédula / RIF', () => {
  it('normaliza letra, puntos y guiones', () => {
    expect(normalizeCedula('v-12.345.678')).toBe('V12345678');
    expect(normalizeCedula('12345678')).toBe('V12345678');
    expect(normalizeCedula('J-40123456-7')).toBe('J401234567');
  });
  it('valida largo y letra', () => {
    expect(isValidCedula('V1234567')).toBe(true);
    expect(isValidCedula('E 81.234.567')).toBe(true);
    expect(isValidCedula('V12345')).toBe(false);
    expect(isValidCedula('X12345678')).toBe(false);
  });
});

describe('correo', () => {
  it('acepta correos con formato básico', () => expect(isValidEmail('  ana@empresa.com ')).toBe(true));
  it.each(['ana', 'ana@', 'ana@empresa', 'a b@c.com'])('rechaza %p', (e) => expect(isValidEmail(e)).toBe(false));
});

describe('passwordIssues', () => {
  it('no reporta nada para una clave válida', () => expect(passwordIssues('Temporal123')).toEqual([]));
  it('lista cada requisito faltante', () => {
    expect(passwordIssues('abc')).toEqual(['Al menos 8 caracteres', 'Una mayúscula', 'Un número']);
    expect(passwordIssues('ABCDEFGH1')).toEqual(['Una minúscula']);
  });
});

describe('formatCivilDate', () => {
  it('no corre la fecha por zona horaria', () => {
    expect(formatCivilDate('2026-11-15')).toBe('15/11/2026');
    expect(formatCivilDate('2026-01-01T03:00:00Z')).toBe('01/01/2026');
  });
  it('devuelve un guion si no hay fecha', () => {
    expect(formatCivilDate(null)).toBe('—');
    expect(formatCivilDate('')).toBe('—');
  });
});
