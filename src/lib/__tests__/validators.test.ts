import {
  formatCivilDate,
  isValidCedula,
  isValidEmail,
  isValidPhone,
  normalizeCedula,
  normalizePhone,
  passwordIssues,
  todayInCaracas,
  formatInstantDate,
  formatInstantDateTime,
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

describe('guía definitiva §4.5 y §3.2', () => {
  it('la contraseña no puede tener espacios en los extremos ni pasar de 128', () => {
    expect(passwordIssues(' Temporal123')).toContain('Sin espacios al inicio ni al final');
    expect(passwordIssues('Temporal123 ')).toContain('Sin espacios al inicio ni al final');
    expect(passwordIssues(`A1${'a'.repeat(127)}`)).toContain('Máximo 128 caracteres');
  });
  it('acepta los prefijos V E J G P C y de 6 a 10 dígitos', () => {
    expect(isValidCedula('G-20000000-1')).toBe(true);
    expect(isValidCedula('P1234567')).toBe(true);
    expect(isValidCedula('C1234567890')).toBe(true);
    expect(isValidCedula('V12345678901')).toBe(false);
  });
  it('hoy en Caracas (UTC−4): a las 2 a. m. UTC todavía es el día anterior', () => {
    expect(todayInCaracas(new Date('2026-11-17T02:00:00Z'))).toBe('2026-11-16');
    expect(todayInCaracas(new Date('2026-11-17T05:00:00Z'))).toBe('2026-11-17');
  });
  it('los instantes *_at se muestran en hora de Caracas', () => {
    expect(formatInstantDate('2026-11-17T02:30:00Z')).toBe('16/11/2026');
    expect(formatInstantDateTime('2026-11-17T02:30:00Z')).toBe('16/11/2026 10:30 p. m.');
    expect(formatInstantDate(null)).toBe('—');
  });
});
