import {
  formatPercent,
  installmentAlert,
  installmentBreakdown,
  loanOutstanding,
  METHOD_LABEL,
  methodLabel,
  nextDue,
  scheduleShape,
  shapeHint,
} from '../schedule';

const inst = (total: string, extra: Partial<Record<string, string>> = {}) => ({
  total_amount_usd: total,
  principal_component_usd: '0.00',
  interest_or_fee_component_usd: '0.00',
  ...extra,
});

describe('scheduleShape', () => {
  it('cuota pareja', () => {
    expect(scheduleShape([inst('72.00'), inst('72.00'), inst('72.00')])).toEqual({ kind: 'even', amount: '72.00' });
  });

  it('tolera el centavo de ajuste en la última cuota (francés)', () => {
    expect(scheduleShape([inst('69.35'), inst('69.35'), inst('69.36')]).kind).toBe('even');
  });

  it('pero no dos centavos', () => {
    expect(scheduleShape([inst('69.35'), inst('69.35'), inst('69.37')]).kind).not.toBe('even');
  });

  it('francés con comisiones: la primera más alta y el resto parejo', () => {
    expect(scheduleShape([inst('81.35'), inst('69.35'), inst('69.34')])).toEqual({
      kind: 'first_higher',
      first: '81.35',
      rest: '69.35',
    });
  });

  it('alemán: decreciente (el ejemplo de la guía del backend)', () => {
    expect(scheduleShape([inst('52.01'), inst('38.90'), inst('38.34')])).toEqual({
      kind: 'declining',
      first: '52.01',
      last: '38.34',
    });
  });

  it('cronograma sin patrón', () => {
    expect(scheduleShape([inst('10.00'), inst('30.00'), inst('20.00')]).kind).toBe('irregular');
  });

  it('una sola cuota o vacío son parejos', () => {
    expect(scheduleShape([inst('100.00')]).kind).toBe('even');
    expect(scheduleShape([]).kind).toBe('even');
  });
});

describe('shapeHint', () => {
  it('no agrega texto si la cuota es pareja', () => {
    expect(shapeHint({ kind: 'even', amount: '1' }, 3)).toBeNull();
  });
  it('explica la cuota 1 con comisiones', () => {
    expect(shapeHint({ kind: 'first_higher', first: '81.35', rest: '69.35' }, 3)).toBe(
      'La primera cuota incluye las comisiones; luego 2 cuotas de $69,35.',
    );
    expect(shapeHint({ kind: 'first_higher', first: '2', rest: '1' }, 2)).toContain('luego 1 cuota de');
  });
  it('explica la cuota decreciente', () => {
    expect(shapeHint({ kind: 'declining', first: '52.01', last: '38.34' }, 6)).toContain('bajan hasta $38,34');
  });
});

describe('installmentBreakdown', () => {
  it('separa interés y comisión cuando el servidor manda el desglose', () => {
    expect(
      installmentBreakdown(
        inst('52.01', {
          principal_component_usd: '33.34',
          interest_component_usd: '6.67',
          fee_component_usd: '12.00',
          interest_or_fee_component_usd: '18.67',
        }),
      ),
    ).toBe('Capital $33,34 · Interés $6,67 · Comisión $12,00');
  });

  it('omite los componentes en cero', () => {
    expect(
      installmentBreakdown(
        inst('38.90', {
          principal_component_usd: '33.34',
          interest_component_usd: '5.56',
          fee_component_usd: '0.00',
          interest_or_fee_component_usd: '5.56',
        }),
      ),
    ).toBe('Capital $33,34 · Interés $5,56');
  });

  it('cae al total combinado con un servidor viejo (sin desglose)', () => {
    expect(
      installmentBreakdown(inst('72.00', { principal_component_usd: '66.67', interest_or_fee_component_usd: '5.33' })),
    ).toBe('Capital $66,67 · Interés/comisión $5,33');
  });
});

describe('formatPercent / METHOD_LABEL', () => {
  it('formatea porcentajes del backend', () => {
    expect(formatPercent('5.000')).toBe('5 %');
    expect(formatPercent('1.250')).toBe('1,25 %');
  });
  it('tiene etiqueta para los 4 métodos, incluido flat_interest', () => {
    expect(Object.keys(METHOD_LABEL).sort()).toEqual(['flat_interest', 'flat_prorated', 'french', 'german']);
    expect(methodLabel('flat_interest')).toBe('Interés fijo prorrateado');
  });
  it('un método desconocido se muestra crudo', () => {
    expect(methodLabel('balloon')).toBe('balloon');
    expect(methodLabel(null)).toBeNull();
  });
});

describe('deuda, próximo vencimiento y gracia (guía §9.2 y §11.5)', () => {
  const cuota = (over: Record<string, unknown>) =>
    ({
      status: 'scheduled',
      outstanding_usd: '10.00',
      due_date: '2026-12-01',
      in_mora_grace_period: false,
      mora_grace_ends_on: null,
      mora_accrued_usd: '0.00',
      mora_paid_usd: '0.00',
      ...over,
    }) as never;

  it('la deuda suma outstanding_usd de las cuotas no pagadas', () => {
    expect(
      loanOutstanding([
        cuota({ status: 'paid', outstanding_usd: '0.00' }),
        cuota({}),
        cuota({ outstanding_usd: '5.50' }),
      ]),
    ).toBe('15.50');
  });
  it('el próximo vencimiento es la cuota abierta con menor fecha', () => {
    const next = nextDue([cuota({ due_date: '2026-12-15' }), cuota({ status: 'overdue', due_date: '2026-11-15' })]);
    expect((next as unknown as { due_date: string }).due_date).toBe('2026-11-15');
  });
  it('en gracia, en mora o solo vencida', () => {
    expect(
      installmentAlert(cuota({ status: 'overdue', in_mora_grace_period: true, mora_grace_ends_on: '2026-11-20' })),
    ).toEqual({
      kind: 'grace',
      until: '2026-11-20',
    });
    expect(installmentAlert(cuota({ status: 'overdue', mora_accrued_usd: '1.20', mora_paid_usd: '0.20' }))).toEqual({
      kind: 'mora',
      mora: '1.00',
    });
    expect(installmentAlert(cuota({ status: 'overdue' }))).toEqual({ kind: 'overdue' });
    expect(installmentAlert(cuota({}))).toBeNull();
  });
});
