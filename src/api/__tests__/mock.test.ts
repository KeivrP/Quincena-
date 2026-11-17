import Big from 'big.js';
import { scheduleShape } from '../../lib/schedule';
import type { Loan, LoanDetail, LoanQuote } from '../types';

let mockRequest: typeof import('../mock').mockRequest;

beforeEach(() => {
  jest.resetModules(); // estado del servidor simulado limpio en cada prueba
  jest.useFakeTimers({ now: new Date('2026-11-11T12:00:00Z') });
  ({ mockRequest } = require('../mock'));
});
afterEach(() => jest.useRealTimers());

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const p = mockRequest(method, path, body, headers);
  await jest.advanceTimersByTimeAsync(2000); // el mock simula latencia
  const r = await p;
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : undefined };
}

const quote = async (amount: string) =>
  (await call('POST', '/app/loans/quote', { principal_usd: amount })).body as LoanQuote;
// La cuenta arranca con contraseña temporal: hasta cambiarla, /app/* solo deja leer el perfil.
const activate = async () => {
  await call('POST', '/auth/change-password', { current_password: 'Temporal123', new_password: 'Temporal123' });
};
const sum = (xs: string[]) => xs.reduce((s, x) => s.plus(x), new Big(0)).toFixed(2);

describe('cotización: invariantes de los 3 métodos', () => {
  beforeEach(activate);
  it.each([
    ['200.00', 'flat_prorated'],
    ['200.21', 'french'],
    ['200.22', 'german'],
    ['33.33', 'flat_prorated'],
    ['599.21', 'french'],
    ['1.22', 'german'],
  ])('%s → %s cuadra al centavo', async (amount, method) => {
    const q = await quote(amount);
    expect(q.amortization_method).toBe(method);
    const xs = q.installments;
    expect(xs).toHaveLength(q.installments_count);

    // capital: suma exacta del monto pedido
    expect(sum(xs.map((i) => i.principal_component_usd))).toBe(q.principal_usd);
    // total a pagar = suma de cuotas = capital + intereses + comisiones
    expect(sum(xs.map((i) => i.total_amount_usd))).toBe(q.total_payable_usd);
    expect(new Big(q.principal_usd).plus(q.total_charge_usd).toFixed(2)).toBe(q.total_payable_usd);
    expect(new Big(q.total_interest_usd!).plus(q.total_fees_usd!).toFixed(2)).toBe(q.total_charge_usd);
    // totales de interés y comisión = suma de su componente por cuota
    expect(sum(xs.map((i) => i.interest_component_usd!))).toBe(q.total_interest_usd);
    expect(sum(xs.map((i) => i.fee_component_usd!))).toBe(q.total_fees_usd);
    expect(sum(q.fees!.map((f) => f.amount_usd))).toBe(q.total_fees_usd);

    for (const i of xs) {
      // interest_or_fee sigue siendo interés + comisión
      expect(new Big(i.interest_component_usd!).plus(i.fee_component_usd!).toFixed(2)).toBe(
        i.interest_or_fee_component_usd,
      );
      expect(new Big(i.principal_component_usd).plus(i.interest_or_fee_component_usd).toFixed(2)).toBe(
        i.total_amount_usd,
      );
      expect(new Big(i.total_amount_usd).times(q.usd_to_bs_rate).toFixed(2)).toBe(i.total_amount_bs);
      for (const v of [i.principal_component_usd, i.interest_component_usd!, i.fee_component_usd!])
        expect(new Big(v).gte(0)).toBe(true);
    }
    expect(xs.map((i) => i.sequence_number)).toEqual([1, 2, 3]);
  });

  it('flat_prorated: sin interés, comisión en todas las cuotas, cuota pareja', async () => {
    const q = await quote('200.00');
    expect(q.total_interest_usd).toBe('0.00');
    expect(q.total_fees_usd).toBe('16.00');
    for (const i of q.installments) expect(i.fee_component_usd).toBe(i.interest_or_fee_component_usd);
    expect(scheduleShape(q.installments)).toEqual({ kind: 'even', amount: '72.00' });
  });

  it('french: comisiones solo en la cuota 1 → la 1 es más alta y el resto parejo', async () => {
    const q = await quote('200.21');
    expect(q.installments[0].fee_component_usd).toBe(q.total_fees_usd);
    expect(q.installments.slice(1).every((i) => i.fee_component_usd === '0.00')).toBe(true);
    expect(q.fees!.map((f) => f.name)).toEqual(['Comisión bancaria', 'Comisión flat']);
    expect(q.fees![0]).toMatchObject({ percent: '5.000', amount_usd: '10.01' });
    expect(scheduleShape(q.installments).kind).toBe('first_higher');
  });

  it('german: capital fijo e interés sobre saldo → cuotas decrecientes', async () => {
    const q = await quote('200.22');
    const xs = q.installments;
    expect(new Set(xs.slice(0, -1).map((i) => i.principal_component_usd)).size).toBe(1);
    expect(new Big(xs[0].interest_component_usd!).gt(xs[1].interest_component_usd!)).toBe(true);
    expect(new Big(xs[1].interest_component_usd!).gt(xs[2].interest_component_usd!)).toBe(true);
    // sin la comisión de la cuota 1, el total igual baja cuota a cuota
    expect(new Big(xs[1].total_amount_usd).gt(xs[2].total_amount_usd)).toBe(true);
    expect(scheduleShape(xs).kind).toBe('declining');
  });

  it('el interés del francés es mayor que el del alemán para el mismo capital', async () => {
    const f = await quote('500.21');
    const g = await quote('500.22');
    expect(new Big(f.total_interest_usd!).gte(g.total_interest_usd!)).toBe(true);
  });
});

describe('cupo', () => {
  beforeEach(activate);
  it('por encima del cupo: rechazada SOLO por cupo → se ofrece extra-crédito', async () => {
    const q = await quote('700.00');
    expect(q.would_be_rejected).toBe(true);
    expect(q.exceeds_credit_limit).toBe(true);
    expect(q.rejection_reason).toMatch(/\$600\.00/);
    const r = await call('POST', '/app/loans', { principal_usd: '700.00' });
    expect(r.status).toBe(422);
    // Cupo excedido: business_rule_violation SIN reason, con los montos en extra (guía §7.5).
    expect(r.body.code).toBe('business_rule_violation');
    expect(r.body.extra.requested_usd).toBe('700.00');
  });

  it('el crédito otorgado consume cupo', async () => {
    await call('POST', '/app/loans', { principal_usd: '200.00' });
    const p = (await call('GET', '/app/profile')).body;
    expect(p.credit_used_usd).toBe('216.00'); // saldo pendiente: capital + comisión
    expect(p.credit_available_usd).toBe('384.00');
  });
});

describe('pedir crédito: desenlaces simulados', () => {
  beforeEach(activate);
  it('200: crea el préstamo con las condiciones de nacimiento (tanda 2026-11-08)', async () => {
    const r = await call('POST', '/app/loans', { principal_usd: '200.22' });
    expect(r.status).toBe(200);
    const id = r.body.loan.id;
    expect(r.body.loan.installments).toBeUndefined(); // la lista no trae el cronograma
    const d = (await call('GET', `/app/loans/${id}`)).body as LoanDetail;
    expect(d.amortization_method_snapshot).toBe('german');
    expect(d.charge_model_snapshot).toBe('declining_interest');
    expect(d.fees!.every((f) => f.applied_on_installment === 1)).toBe(true);
    const q = await quote('200.22');
    expect(d.total_interest_usd).toBe(q.total_interest_usd);
    expect(d.total_fees_usd).toBe(q.total_fees_usd);
    expect(d.installments.map((i) => i.fee_component_usd)).toEqual(q.installments.map((i) => i.fee_component_usd));
    expect(d.installments.every((i) => i.status === 'scheduled' && i.outstanding_usd === i.total_amount_usd)).toBe(
      true,
    );
  });

  it('flat_prorated no indica cuota de cobro', async () => {
    const { body } = await call('POST', '/app/loans', { principal_usd: '100.00' });
    const d = (await call('GET', `/app/loans/${body.loan.id}`)).body as LoanDetail;
    expect(d.amortization_method_snapshot).toBe('flat_prorated');
    expect(d.fees![0].applied_on_installment).toBeNull();
  });

  it('.14 → 502 rechazo del banco, sin préstamo', async () => {
    const r = await call('POST', '/app/loans', { principal_usd: '100.14' });
    expect(r).toMatchObject({ status: 502, body: { code: 'disbursement_failed' } });
    expect((await call('GET', '/app/loans')).body).toEqual([]);
  });

  it('.13 → 202 en revisión', async () => {
    const r = await call('POST', '/app/loans', { principal_usd: '100.13' });
    expect(r).toMatchObject({ status: 202, body: { code: 'disbursement_pending_review' } });
  });

  it('la misma Idempotency-Key devuelve la misma respuesta y no duplica', async () => {
    const h = { 'Idempotency-Key': 'k1' };
    const a = await call('POST', '/app/loans', { principal_usd: '100.00' }, h);
    const b = await call('POST', '/app/loans', { principal_usd: '100.00' }, h);
    expect(b.body.loan.id).toBe(a.body.loan.id);
    expect((await call('GET', '/app/loans')).body).toHaveLength(1);
  });

  it('préstamo inexistente → 404', async () => {
    expect((await call('GET', '/app/loans/nope')).status).toBe(404);
  });
});

describe('pagos', () => {
  beforeEach(activate);
  it('aplica interés/comisión antes que capital y cierra el préstamo al pagarlo todo', async () => {
    const { body } = await call('POST', '/app/loans', { principal_usd: '100.00' }); // 3 × 36.00
    const id = body.loan.id;
    let n = 0;
    // Cada referencia se usa una sola vez (guía §10.4).
    const pay = (amount: string, reference = `R${++n}`) =>
      call('POST', `/app/loans/${id}/payments`, { amount_usd: amount, reference, payer_bank_code: '0134' });

    const p1 = await pay('36.00');
    expect(p1.status).toBe(200);
    expect(p1.body.applied).toEqual({ principal_usd: '33.33', interest_or_fee_usd: '2.67', mora_usd: '0.00' });
    expect(p1.body.bank_reference).toMatch(/^0012/);
    let d = (await call('GET', `/app/loans/${id}`)).body as LoanDetail;
    expect(d.installments.map((i) => i.status)).toEqual(['paid', 'scheduled', 'scheduled']);

    // abono parcial: va primero a la comisión
    const p2 = await pay('1.00');
    expect(p2.body.applied).toEqual({ principal_usd: '0.00', interest_or_fee_usd: '1.00', mora_usd: '0.00' });

    await pay('71.00');
    d = (await call('GET', `/app/loans/${id}`)).body as LoanDetail;
    expect(d.status).toBe('paid_off');
    expect(d.installments.every((i) => i.outstanding_usd === '0.00')).toBe(true);
    expect((await call('GET', '/app/profile')).body.credit_available_usd).toBe('600.00');
  });

  it('referencia SIMFAIL → 422 y no aplica nada', async () => {
    const { body } = await call('POST', '/app/loans', { principal_usd: '100.00' });
    const r = await call('POST', `/app/loans/${body.loan.id}/payments`, {
      amount_usd: '36.00',
      reference: 'simfail-1',
    });
    expect(r).toMatchObject({ status: 422, body: { code: 'business_rule_violation' } });
    const d = (await call('GET', `/app/loans/${body.loan.id}`)).body as LoanDetail;
    expect(d.installments[0].status).toBe('scheduled');
  });

  it('una referencia ya usada → 409 reference_already_used', async () => {
    const { body } = await call('POST', '/app/loans', { principal_usd: '100.00' });
    const pay = () =>
      call('POST', `/app/loans/${body.loan.id}/payments`, {
        amount_usd: '1.00',
        reference: 'X9',
        payer_bank_code: '0134',
      });
    expect((await pay()).status).toBe(200);
    expect(await pay()).toMatchObject({ status: 409, body: { extra: { reason: 'reference_already_used' } } });
  });

  it('un abono mayor que la deuda → 422 con extra.outstanding_usd', async () => {
    const { body } = await call('POST', '/app/loans', { principal_usd: '100.00' });
    const r = await call('POST', `/app/loans/${body.loan.id}/payments`, {
      amount_usd: '999.00',
      reference: 'BIG',
      payer_bank_code: '0134',
    });
    expect(r).toMatchObject({ status: 422, body: { extra: { outstanding_usd: '108.00' } } });
  });
});

describe('guía definitiva: desembolso en revisión, gracia, sesiones y producto', () => {
  beforeEach(activate);

  it('202 en revisión trae extra.loan_id y bloquea otra solicitud con 409', async () => {
    const r = await call('POST', '/app/loans', { principal_usd: '50.13' });
    expect(r.status).toBe(202);
    expect(r.body.code).toBe('disbursement_pending_review');
    const loanId = r.body.extra.loan_id;
    const d = (await call('GET', `/app/loans/${loanId}`)).body as LoanDetail;
    expect(d.status).toBe('disbursement_failed');
    expect(d.receipt_download_url).toBeNull();
    const again = await call('POST', '/app/loans', { principal_usd: '20.00' });
    expect(again).toMatchObject({ status: 409, body: { extra: { reason: 'disbursement_pending_review' } } });
  });

  it('monto .31: crédito con gracia y la cuota 1 vencida dentro de la gracia', async () => {
    const { body } = await call('POST', '/app/loans', { principal_usd: '60.31' });
    const d = (await call('GET', `/app/loans/${body.loan.id}`)).body as LoanDetail;
    expect(d.grace_period_days_snapshot).toBe(3);
    expect(d.installments[0]).toMatchObject({ status: 'overdue', in_mora_grace_period: true });
    expect(d.installments[0].mora_grace_ends_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // La lista trae el snapshot de gracia, pero no las cuotas.
    const list = (await call('GET', '/app/loans')).body as Loan[];
    expect(list[0].grace_period_days_snapshot).toBe(3);
    expect((list[0] as unknown as { installments?: unknown }).installments).toBeUndefined();
  });

  it('dispositivos conectados y cerrar los demás', async () => {
    const list = (await call('GET', '/app/sessions')).body as { is_current: boolean }[];
    expect(list.filter((x) => x.is_current)).toHaveLength(1);
    expect(list.length).toBeGreaterThan(1);
    expect((await call('POST', '/app/sessions/revoke-others')).body).toEqual({ revoked_count: 1 });
    expect(((await call('GET', '/app/sessions')).body as unknown[]).length).toBe(1);
  });

  it('el perfil trae el producto asignado y credit-products devuelve 0 o 1', async () => {
    const pf = (await call('GET', '/app/profile')).body;
    expect(pf.credit_product).toMatchObject({ min_amount_usd: '20.00', max_amount_usd: '500.00' });
    const products = (await call('GET', '/app/credit-products')).body as unknown[];
    expect(products.length).toBeLessThanOrEqual(1);
  });
});

describe('extra-crédito', () => {
  beforeEach(activate);
  const ask = (amount: string) => call('POST', '/app/extra-credit-requests', { requested_amount_usd: amount });

  it('dentro del cupo → 422 within_credit_limit', async () => {
    const r = await ask('100.00');
    expect(r.status).toBe(422);
    expect(r.body.extra.reason).toBe('within_credit_limit');
  });

  it('sobre el cupo → pendiente; solo una pendiente a la vez', async () => {
    const r = await ask('900.00');
    expect(r).toMatchObject({ status: 201, body: { status: 'pending', requested_amount_usd: '900.00' } });
    const again = await ask('950.00');
    expect(again.status).toBe(409);
    expect(again.body.extra.reason).toBe('extra_credit_request_pending');
  });

  it('RRHH aprueba completa y se crea el préstamo', async () => {
    const { body } = await ask('900.00');
    jest.advanceTimersByTime(9000);
    const r = (await call('GET', `/app/extra-credit-requests/${body.id}`)).body;
    expect(r.status).toBe('approved');
    expect(r.approved_amount_usd).toBe('900.00');
    expect((await call('GET', `/app/loans/${r.loan_id}`)).status).toBe(200);
  });

  it('.12 → aprobada por la mitad · .14 → rechazada', async () => {
    const half = (await ask('900.12')).body;
    jest.advanceTimersByTime(9000);
    expect((await call('GET', `/app/extra-credit-requests/${half.id}`)).body.approved_amount_usd).toBe('450.06');

    const no = (await ask('2000.14')).body;
    jest.advanceTimersByTime(9000);
    const r = (await call('GET', `/app/extra-credit-requests/${no.id}`)).body;
    expect(r.status).toBe('rejected');
    expect(r.rejection_reason).toBeTruthy();
    expect(r.loan_id).toBeNull();
  });

  it('cancelar: solo si está pendiente', async () => {
    const { body } = await ask('900.00');
    const c = await call('POST', `/app/extra-credit-requests/${body.id}/cancel`);
    expect(c.body.status).toBe('cancelled');
    expect((await call('POST', `/app/extra-credit-requests/${body.id}/cancel`)).status).toBe(409);
    expect((await call('POST', '/app/extra-credit-requests/nope/cancel')).status).toBe(404);
  });

  it('filtra la lista por estado', async () => {
    const { body } = await ask('900.00');
    await call('POST', `/app/extra-credit-requests/${body.id}/cancel`);
    await ask('901.00');
    expect((await call('GET', '/app/extra-credit-requests?status=pending')).body).toHaveLength(1);
    expect((await call('GET', '/app/extra-credit-requests')).body).toHaveLength(2);
  });
});

describe('auth y onboarding', () => {
  it('login: clave incorrecta → 401; correcta → par de tokens', async () => {
    expect((await call('POST', '/auth/login', { email: 'a', password: 'mala' })).status).toBe(401);
    const ok = await call('POST', '/auth/login', { email: 'a', password: 'Temporal123' });
    expect(ok.body).toMatchObject({ refresh_token: 'r', token_type: 'bearer' });
  });

  it('cambiar la clave apaga must_change_password', async () => {
    expect((await call('GET', '/auth/me')).body.must_change_password).toBe(true);
    await call('POST', '/auth/change-password', { current_password: 'Temporal123', new_password: 'Nueva1234' });
    expect((await call('GET', '/auth/me')).body.must_change_password).toBe(false);
    expect((await call('POST', '/auth/login', { password: 'Nueva1234' })).status).toBe(200);
  });

  it('reset: código incorrecto → 422', async () => {
    const r = await call('POST', '/auth/password-reset/confirm', { code: '000000', new_password: 'x' });
    // 422 validation_error con el error en el campo `code` (guía §4.6).
    expect(r.body.code).toBe('validation_error');
    expect(r.body.extra.errors[0]).toMatchObject({ loc: ['body', 'code'], type: 'invalid_or_expired_code' });
  });

  it('firmar el contrato y registrar la cuenta de pago', async () => {
    await activate();
    const before = (await call('GET', '/app/credit-agreement')).body;
    expect(before.signed).toBe(false);
    expect(before.pdf_sha256).toBe(`sha256(${before.download_url})`);
    await call('POST', '/app/credit-agreement/accept', { accepted_pdf_sha256: before.pdf_sha256 });
    await call('PUT', '/app/payout-account', { bank_code: '0102', phone: '04141234567', national_id: 'V1' });
    const p = (await call('GET', '/app/profile')).body;
    expect(p).toMatchObject({ credit_agreement_signed: true, payout_registered: true });
  });

  it('ruta desconocida → 404', async () => {
    await activate();
    expect((await call('GET', '/app/nada')).status).toBe(404);
  });
});

describe('seguridad: igual que el backend', () => {
  it('con la contraseña temporal solo se puede leer el perfil', async () => {
    expect((await call('GET', '/app/profile')).status).toBe(200);
    for (const [m, p] of [
      ['GET', '/app/credit-agreement'],
      ['POST', '/app/loans/quote'],
      ['GET', '/app/loans'],
      ['PUT', '/app/payout-account'],
    ]) {
      const r = await call(m, p, {});
      expect(r.status).toBe(403);
      expect(r.body.extra.reason).toBe('password_change_required');
    }
    await activate();
    expect((await call('GET', '/app/loans')).status).toBe(200);
  });

  it('cambiar la cuenta de cobro pide la contraseña actual; el primer registro no', async () => {
    await activate();
    const first = { bank_code: '0102', phone: '04141234567', national_id: 'V1' };
    const next = { bank_code: '0134', phone: '04241112233', national_id: 'V1' };
    expect((await call('PUT', '/app/payout-account', first)).status).toBe(200);
    // mismos datos: no es un cambio
    expect((await call('PUT', '/app/payout-account', first)).status).toBe(200);

    let r = await call('PUT', '/app/payout-account', next);
    expect(r.status).toBe(422);
    expect(r.body.extra.errors[0]).toMatchObject({
      loc: ['body', 'current_password'],
      type: 'current_password_required',
    });

    r = await call('PUT', '/app/payout-account', { ...next, current_password: 'mala' });
    expect(r.body.extra.errors[0].type).toBe('invalid_current_password');
    expect((await call('GET', '/app/payout-account')).body.bank_code).toBe('0102');

    r = await call('PUT', '/app/payout-account', { ...next, current_password: 'Temporal123' });
    expect(r.status).toBe(200);
    expect(r.body.bank_code).toBe('0134');
  });
});
