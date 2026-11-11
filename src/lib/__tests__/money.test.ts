import { formatAmount, formatBs, formatUsd, isValidAmount, normalizeAmountInput, ratio, toBig } from '../money';

describe('toBig', () => {
  it('convierte strings decimales sin pasar por float', () => {
    expect(toBig('0.1').plus('0.2').toFixed(2)).toBe('0.30');
  });
  it('trata null/undefined/basura como 0', () => {
    expect(toBig(null).toFixed(2)).toBe('0.00');
    expect(toBig(undefined).toFixed(2)).toBe('0.00');
    expect(toBig('abc').toFixed(2)).toBe('0.00');
  });
});

describe('normalizeAmountInput', () => {
  it.each([
    ['1250.5', '1250.50'],
    ['1.250,5', '1250.50'],
    ['1,250.5', '1250.50'],
    ['100', '100.00'],
    ['  50 ', '50.00'],
    ['0,99', '0.99'],
  ])('%s → %s', (input, out) => expect(normalizeAmountInput(input)).toBe(out));

  it.each(['', '.', 'abc', '12a', '-5'])('rechaza %p', (input) => expect(normalizeAmountInput(input)).toBe(''));
});

describe('isValidAmount', () => {
  it('acepta montos positivos con hasta 2 decimales', () => {
    expect(isValidAmount('100.00')).toBe(true);
    expect(isValidAmount('0.01')).toBe(true);
  });
  it('rechaza cero, vacío, negativos y más de 2 decimales', () => {
    expect(isValidAmount('0.00')).toBe(false);
    expect(isValidAmount('')).toBe(false);
    expect(isValidAmount('-1')).toBe(false);
    expect(isValidAmount('1.005')).toBe(false);
  });
});

describe('formato venezolano', () => {
  it('agrupa miles con punto y decimales con coma', () => {
    expect(formatAmount('1234567.5')).toBe('1.234.567,50');
    expect(formatAmount('0')).toBe('0,00');
    expect(formatAmount('-1500')).toBe('-1.500,00');
  });
  it('agrega el símbolo de moneda', () => {
    expect(formatUsd('52.01')).toBe('$52,01');
    expect(formatBs('2002.39')).toBe('Bs. 2.002,39');
    expect(formatUsd(undefined)).toBe('$0,00');
  });
});

describe('ratio', () => {
  it('calcula el porcentaje y lo acota a 0..100', () => {
    expect(ratio('150', '600')).toBe(25);
    expect(ratio('900', '600')).toBe(100);
    expect(ratio('-5', '600')).toBe(0);
  });
  it('devuelve 0 si el total es 0', () => expect(ratio('10', '0')).toBe(0));
});
