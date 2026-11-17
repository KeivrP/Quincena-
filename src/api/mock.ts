import Big from 'big.js';
import * as Crypto from 'expo-crypto';
import type { AmortizationMethod, ExtraCreditRequest, Loan, LoanDetail, LoanInstallment, Profile } from './types';

// Servidor simulado en memoria para ver la app sin credenciales (EXPO_PUBLIC_USE_MOCK=1).
// Reproduce los valores mágicos del banco simulado del backend:
//   monto terminado en .14 → rechazo del banco (502) · .13 → en revisión (202) ·
//   referencia SIMFAIL… → el banco no concilia el abono (422).
// Método de amortización del producto: .21 → french (cuota fija + comisiones en la 1) ·
//   .22 → german (cuota decreciente) · otro → flat_prorated (comisión prorrateada).
// Extra-crédito: la solicitud queda «pendiente» unos segundos y luego RRHH (simulado) la resuelve:
//   monto terminado en .14 → rechazada · .12 → aprobada por la mitad · otro → aprobada completa.
// Gracia de mora: monto terminado en .31 → crédito con 3 días de gracia y la cuota 1 ya vencida,
//   todavía dentro de la gracia (chip "En gracia hasta…").
// Abonos (guía §10): cada referencia por banco se usa una sola vez (409 reference_already_used);
//   un monto mayor a la deuda da 422 con extra.outstanding_usd.
// Formas calcadas de `src/disglobal/modules/*/schemas.py` del backend real.

const RATE = '38.50';
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const state = {
  password: 'Temporal123',
  mustChange: true,
  agreementSigned: false,
  payout: null as { bank_code: string; phone: string; national_id: string } | null,
  limit: '600.00',
  loans: [] as LoanDetail[],
  extraCredits: [] as ExtraCreditRequest[],
  seenKeys: new Map<string, { status: number; body: unknown }>(),
  usedReferences: new Set<string>(),
  otherSessions: 1,
};

const GRACE_DAYS = 3;

function json(status: number, body: unknown, problem = false): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': problem ? 'application/problem+json' : 'application/json' },
  });
}

const problem = (status: number, title: string, detail: string, code: string, extra?: Record<string, unknown>) =>
  json(
    status,
    { type: `https://disglobal.dev/errors/${code}`, title, status, code, detail, ...(extra ? { extra } : {}) },
    true,
  );

/** 422 validation_error con un error de campo, como los arma el backend. */
const fieldProblem = (field: string, type: string, msg: string) =>
  json(
    422,
    {
      type: 'https://disglobal.dev/errors/validation_error',
      title: 'Error de validación',
      status: 422,
      code: 'validation_error',
      detail: 'Uno o más campos no son válidos.',
      extra: { errors: [{ loc: ['body', field], msg, type }] },
    },
    true,
  );

function fakeJwt(): string {
  const payload = globalThis.btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 15 * 60 }));
  return `x.${payload}.y`;
}

const used = () =>
  state.loans.reduce(
    (acc, l) =>
      acc.plus(l.status === 'active' ? l.installments.reduce((a, i) => a.plus(i.outstanding_usd), new Big(0)) : 0),
    new Big(0),
  );

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const INSTALLMENTS_COUNT = 3;
const SAMPLE_PDF = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

// En modo demo la app calcula la huella sobre la URL, no sobre el PDF (onboarding/contract.tsx): el
// servidor simulado tiene que devolver esa misma huella o la firma falla con «El documento cambió».
const samplePdfSha256 = () => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, SAMPLE_PDF);

/** Monto terminado en .21 → producto "french" con comisiones · .22 → "german" · otro → "flat_prorated". */
function methodFor(principal: string): AmortizationMethod {
  if (principal.endsWith('.21')) return 'french';
  if (principal.endsWith('.22')) return 'german';
  return 'flat_prorated';
}

const RATE_PER_INSTALLMENT = new Big('0.02');
const PRODUCT_FEES = [
  { name: 'Comisión bancaria', percent: '5.000' },
  { name: 'Comisión flat', percent: '1.000' },
];

/** Capital + interés por cuota (sin comisiones). La última cuota absorbe el redondeo. */
function amortize(a: Big, method: AmortizationMethod): { principal: Big; interest: Big }[] {
  const n = INSTALLMENTS_COUNT;
  if (method === 'flat_prorated') {
    const p = a.div(n).round(2);
    return Array.from({ length: n }, (_, i) => ({
      principal: i === n - 1 ? a.minus(p.times(n - 1)) : p,
      interest: new Big(0),
    }));
  }
  const r = RATE_PER_INSTALLMENT;
  const g = r.plus(1).pow(n);
  const payment = a.times(r).times(g).div(g.minus(1)).round(2);
  const fixedPrincipal = a.div(n).round(2);
  let balance = a;
  return Array.from({ length: n }, (_, i) => {
    const interest = balance.times(r).round(2);
    const principal = i === n - 1 ? balance : method === 'french' ? payment.minus(interest) : fixedPrincipal;
    balance = balance.minus(principal);
    return { principal, interest };
  });
}

function buildQuote(principal: string) {
  const a = new Big(principal || '0');
  const method = methodFor(a.toFixed(2));
  const available = new Big(state.limit).minus(used());
  const over = a.gt(available);
  // flat_prorated: una sola comisión del 8 % repartida en todas las cuotas.
  // french/german: comisiones concentradas en la cuota 1.
  const fees =
    method === 'flat_prorated'
      ? [{ name: 'Comisión', percent: '8.000', amount_usd: a.times('0.08').round(2).toFixed(2) }]
      : PRODUCT_FEES.map((f) => ({ ...f, amount_usd: a.times(f.percent).div(100).round(2).toFixed(2) }));
  const totalFees = fees.reduce((s, f) => s.plus(f.amount_usd), new Big(0));
  const proratedFee = totalFees.div(INSTALLMENTS_COUNT).round(2);
  const rows = amortize(a, method);
  const installments = rows.map((row, i) => {
    const last = i === rows.length - 1;
    const fee =
      method === 'flat_prorated'
        ? last
          ? totalFees.minus(proratedFee.times(INSTALLMENTS_COUNT - 1))
          : proratedFee
        : i === 0
          ? totalFees
          : new Big(0);
    const charge = row.interest.plus(fee);
    const total = row.principal.plus(charge);
    return {
      sequence_number: i + 1,
      due_date: addDays((i + 1) * 15),
      period_key: `2026-Q${i + 1}`,
      principal_component_usd: row.principal.toFixed(2),
      interest_component_usd: row.interest.toFixed(2),
      fee_component_usd: fee.toFixed(2),
      interest_or_fee_component_usd: charge.toFixed(2),
      total_amount_usd: total.toFixed(2),
      total_amount_bs: total.times(RATE).toFixed(2),
    };
  });
  const totalInterest = rows.reduce((s, r) => s.plus(r.interest), new Big(0));
  const total = a.plus(totalInterest).plus(totalFees);
  return {
    principal_usd: a.toFixed(2),
    installments_count: INSTALLMENTS_COUNT,
    total_payable_usd: total.toFixed(2),
    total_charge_usd: total.minus(a).toFixed(2),
    amortization_method: method,
    total_interest_usd: totalInterest.toFixed(2),
    total_fees_usd: totalFees.toFixed(2),
    fees,
    fx_rate_date: new Date().toISOString().slice(0, 10),
    usd_to_bs_rate: RATE,
    total_payable_bs: total.times(RATE).toFixed(2),
    installments,
    would_be_rejected: over,
    exceeds_credit_limit: over,
    rejection_reason: over ? `El monto supera tu cupo disponible ($${available.toFixed(2)}).` : null,
    fx_rate_is_stale: false,
    fx_rate_age_days: 0,
    fx_rate_confirmation_required: false,
  };
}

type Quote = ReturnType<typeof buildQuote>;

function createLoan(q: Quote, opts: { inReview?: boolean } = {}): LoanDetail {
  const withGrace = q.principal_usd.endsWith('.31');
  const id = `${state.loans.length + 1}`.padStart(8, '0') + '-0000-0000-0000-000000000000';
  const now = new Date().toISOString();
  const installments: LoanInstallment[] = q.installments.map((i) => ({
    sequence_number: i.sequence_number,
    due_date: i.due_date,
    period_key: i.period_key,
    principal_component_usd: i.principal_component_usd,
    interest_or_fee_component_usd: i.interest_or_fee_component_usd,
    interest_component_usd: i.interest_component_usd,
    fee_component_usd: i.fee_component_usd,
    total_amount_usd: i.total_amount_usd,
    status: withGrace && i.sequence_number === 1 ? 'overdue' : 'scheduled',
    paid_principal_usd: '0.00',
    paid_fee_interest_usd: '0.00',
    mora_accrued_usd: '0.00',
    mora_paid_usd: '0.00',
    outstanding_usd: i.total_amount_usd,
    overdue_since: withGrace && i.sequence_number === 1 ? addDays(-1) : null,
    paid_at: null,
    mora_grace_ends_on: withGrace ? (i.sequence_number === 1 ? addDays(GRACE_DAYS - 1) : i.due_date) : null,
    in_mora_grace_period: withGrace && i.sequence_number === 1,
  }));
  if (withGrace) installments[0].due_date = addDays(-1);
  const loan: LoanDetail = {
    id,
    employee_id: '00000000-0000-0000-0000-000000000001',
    credit_product_id: '00000000-0000-0000-0000-000000000002',
    status: opts.inReview ? 'disbursement_failed' : 'active',
    principal_usd: q.principal_usd,
    installments_count: q.installments_count,
    total_payable_usd: q.total_payable_usd,
    charge_model_snapshot: q.amortization_method === 'flat_prorated' ? 'flat_fee' : 'declining_interest',
    amortization_method_snapshot: q.amortization_method,
    rate_period_months_snapshot: q.amortization_method === 'flat_prorated' ? null : 1,
    total_interest_usd: q.total_interest_usd,
    total_fees_usd: q.total_fees_usd,
    fees: q.fees.map((f) => ({ ...f, applied_on_installment: q.amortization_method === 'flat_prorated' ? null : 1 })),
    rate_percent_snapshot: q.amortization_method === 'flat_prorated' ? '8.000' : '2.000',
    payment_frequency_snapshot: 'monthly',
    fx_rate_at_disbursement: opts.inReview ? null : RATE,
    fx_rate_date: opts.inReview ? null : q.fx_rate_date,
    requested_at: now,
    disbursed_at: opts.inReview ? null : now,
    paid_off_at: null,
    created_at: now,
    grace_period_days_snapshot: withGrace ? GRACE_DAYS : 0,
    installments,
    receipt_download_url: opts.inReview ? null : SAMPLE_PDF,
  };
  state.loans.unshift(loan);
  return loan;
}

const RESOLVE_AFTER_MS = 8000;

/** RRHH simulado: resuelve las solicitudes pendientes que ya llevan un rato esperando. */
function resolveExtraCredits() {
  const now = Date.now();
  for (const r of state.extraCredits) {
    if (r.status !== 'pending' || now - Date.parse(r.created_at) < RESOLVE_AFTER_MS) continue;
    const resolvedAt = new Date().toISOString();
    r.resolved_at = resolvedAt;
    r.updated_at = resolvedAt;
    r.resolved_by = { id: 'rrhh', full_name: 'Roberto Recursos', email: 'rrhh@demo.com' };
    if (r.requested_amount_usd.endsWith('.14')) {
      r.status = 'rejected';
      r.rejection_reason = 'Tu nivel de endeudamiento actual no permite un monto adicional este mes.';
      continue;
    }
    const approved = r.requested_amount_usd.endsWith('.12')
      ? new Big(r.requested_amount_usd).div(2).round(2).toFixed(2)
      : r.requested_amount_usd;
    const loan = createLoan(buildQuote(approved));
    r.status = 'approved';
    r.approved_amount_usd = approved;
    r.loan_id = loan.id;
  }
}

function profile(): Profile {
  const u = used();
  return {
    full_name: 'María Fernanda Pérez',
    national_id: 'V18765432',
    email: 'maria.perez@demo.com',
    company_legal_name: 'Distribuidora Demo QA, C.A.',
    employment_status: 'active',
    payment_frequency: 'monthly',
    salary_per_period_usd: '400.00',
    installments_count: INSTALLMENTS_COUNT,
    credit_limit_usd: state.limit,
    credit_used_usd: u.toFixed(2),
    credit_available_usd: new Big(state.limit).minus(u).toFixed(2),
    credit_agreement_signed: state.agreementSigned,
    payout_registered: !!state.payout,
    payment_destination: { bank_code: '0171', phone: '584141234567', national_id: 'J401234567' },
    credit_product: PRODUCT,
  };
}

const PRODUCT = {
  id: '00000000-0000-0000-0000-000000000002',
  tenant_id: '00000000-0000-0000-0000-00000000000a',
  name: 'Crédito de nómina',
  funding_source: 'employer',
  charge_model: 'flat_fee',
  amortization_method: 'flat_prorated' as AmortizationMethod,
  rate_percent: '8.000',
  rate_period_months: null,
  allowed_installments: [INSTALLMENTS_COUNT],
  min_amount_usd: '20.00',
  max_amount_usd: '500.00',
  default_interest_percent: '24.000',
  fees: [],
  version: 1,
  is_active: true,
};

function toLoan(l: LoanDetail): Loan {
  const { installments: _installments, receipt_download_url: _r, ...loan } = l;
  return loan;
}

export async function mockRequest(
  method: string,
  path: string,
  body: any,
  headers: Record<string, string>,
): Promise<Response> {
  await delay(path === '/app/loans' && method === 'POST' ? 1800 : 350);
  const idem = headers['Idempotency-Key'];
  if (idem && state.seenKeys.has(idem)) {
    const cached = state.seenKeys.get(idem)!;
    return json(cached.status, cached.body, cached.status >= 400);
  }
  const remember = (status: number, payload: unknown, isProblem = false) => {
    if (idem) state.seenKeys.set(idem, { status, body: payload });
    return json(status, payload, isProblem);
  };

  const route = `${method} ${path}`;
  // Igual que el backend: con la contraseña temporal solo se puede leer el perfil.
  if (path.startsWith('/app/') && state.mustChange && route !== 'GET /app/profile')
    return json(
      403,
      {
        type: 'https://disglobal.dev/errors/permission_denied',
        title: 'Permiso denegado',
        status: 403,
        code: 'permission_denied',
        detail: 'Antes de continuar tienes que cambiar tu contraseña temporal.',
        extra: { reason: 'password_change_required' },
      },
      true,
    );
  switch (true) {
    case route === 'POST /auth/login': {
      if (body.password !== state.password && body.password !== 'Demo1234')
        return problem(401, 'No autenticado', 'Correo o contraseña inválidos.', 'unauthorized', {
          reason: 'invalid_credentials',
        });
      return json(200, { access_token: fakeJwt(), refresh_token: 'r', token_type: 'bearer' });
    }
    case route === 'GET /auth/me':
      return json(200, {
        id: '00000000-0000-0000-0000-000000000001',
        tenant_id: '00000000-0000-0000-0000-00000000000a',
        email: 'maria.perez@demo.com',
        full_name: 'María Fernanda Pérez',
        role: 'employee',
        mfa_enabled: false,
        must_change_password: state.mustChange,
      });
    case route === 'POST /auth/refresh':
      return json(200, { access_token: fakeJwt(), refresh_token: 'r2', token_type: 'bearer' });
    case route === 'POST /auth/logout':
      return json(204, undefined);
    case route === 'POST /auth/change-password':
      if (body.current_password !== state.password && body.current_password !== 'Demo1234')
        return fieldProblem('current_password', 'invalid_current_password', 'La contraseña actual no es correcta.');
      state.password = body.new_password;
      state.mustChange = false;
      return json(204, undefined);
    case route === 'POST /auth/password-reset/request':
      return json(202, { message: 'Si el correo está registrado, enviamos un código de 6 dígitos.' });
    case route === 'POST /auth/password-reset/confirm':
      if (body.code && body.code !== '123456')
        return fieldProblem('code', 'invalid_or_expired_code', 'El código es inválido o expiró.');
      if (body.new_password) state.password = body.new_password;
      return json(204, undefined);
    case route === 'GET /app/profile':
      return json(200, profile());
    case route === 'GET /app/credit-products':
      return json(200, [PRODUCT]);
    case route === 'GET /app/sessions': {
      const now = Date.now();
      return json(200, [
        {
          family_id: 'f'.repeat(32),
          ip: '190.202.10.4',
          user_agent: headers['User-Agent'] ?? 'RealMedio/1.0.0 (Android 14; Demo)',
          last_seen_at: new Date(now).toISOString(),
          is_current: true,
        },
        ...Array.from({ length: state.otherSessions }, (_, k) => ({
          family_id: `${k}`.padStart(32, 'a'),
          ip: '186.24.7.91',
          user_agent: 'RealMedio/1.0.0 (Android 13; Moto G)',
          last_seen_at: new Date(now - 6 * 24 * 3600 * 1000).toISOString(),
          is_current: false,
        })),
      ]);
    }
    case route === 'POST /app/sessions/revoke-others': {
      const revoked = state.otherSessions;
      state.otherSessions = 0;
      return json(200, { revoked_count: revoked });
    }
    case route === 'GET /app/credit-agreement':
      return json(200, {
        signed: state.agreementSigned,
        pdf_sha256: await samplePdfSha256(),
        download_url: SAMPLE_PDF,
        accepted_at: state.agreementSigned ? new Date().toISOString() : null,
      });
    case route === 'POST /app/credit-agreement/accept':
      state.agreementSigned = true;
      return remember(200, {
        signed: true,
        pdf_sha256: await samplePdfSha256(),
        download_url: SAMPLE_PDF,
        accepted_at: new Date().toISOString(),
      });
    case route === 'GET /app/banks':
      return json(200, [
        { code: '0102', name: 'Banco de Venezuela' },
        { code: '0105', name: 'Banco Mercantil' },
        { code: '0108', name: 'BBVA Provincial' },
        { code: '0134', name: 'Banesco' },
        { code: '0171', name: 'Banco Activo' },
        { code: '0191', name: 'BNC' },
      ]);
    case route === 'GET /app/payout-account':
      return json(200, {
        registered: !!state.payout,
        bank_code: state.payout?.bank_code ?? null,
        phone: state.payout?.phone ?? null,
        national_id: state.payout?.national_id ?? null,
        registered_at: state.payout ? new Date().toISOString() : null,
      });
    case route === 'PUT /app/payout-account': {
      const p = state.payout;
      const changed =
        !!p && (p.bank_code !== body.bank_code || p.phone !== body.phone || p.national_id !== body.national_id);
      // Cambiar una cuenta ya registrada pide la contraseña actual (como el backend).
      if (changed && body.current_password !== state.password) {
        const missing = !body.current_password;
        return json(
          422,
          {
            type: 'https://disglobal.dev/errors/validation_error',
            title: 'Error de validación',
            status: 422,
            code: 'validation_error',
            detail: 'Uno o más campos no son válidos.',
            extra: {
              errors: [
                {
                  loc: ['body', 'current_password'],
                  msg: missing
                    ? 'Para cambiar tus datos de cobro confirma tu contraseña actual.'
                    : 'La contraseña actual no es correcta.',
                  type: missing ? 'current_password_required' : 'invalid_current_password',
                },
              ],
            },
          },
          true,
        );
      }
      state.payout = { bank_code: body.bank_code, phone: body.phone, national_id: body.national_id };
      return json(200, {
        registered: true,
        bank_code: state.payout.bank_code,
        phone: state.payout.phone,
        national_id: state.payout.national_id,
        registered_at: new Date().toISOString(),
      });
    }
    case route === 'POST /app/loans/quote':
      return json(200, buildQuote(body.principal_usd));
    case route === 'POST /app/loans': {
      const q = buildQuote(body.principal_usd);
      if (state.loans.some((l) => l.status === 'disbursement_failed'))
        return problem(
          409,
          'Conflicto',
          'Tienes un desembolso en revisión; espera a que se resuelva antes de pedir otro.',
          'conflict',
          { reason: 'disbursement_pending_review' },
        );
      if (q.would_be_rejected)
        return problem(422, 'Regla de negocio violada', q.rejection_reason!, 'business_rule_violation', {
          credit_limit_usd: state.limit,
          existing_principal_usd: used().toFixed(2),
          requested_usd: q.principal_usd,
        });
      if (q.principal_usd.endsWith('.14'))
        return problem(
          502,
          'El banco no pudo procesar el desembolso',
          'El banco rechazó la transferencia. No se descontó nada de tu cupo.',
          'disbursement_failed',
        );
      if (q.principal_usd.endsWith('.13')) {
        const pending = createLoan(q, { inReview: true });
        return remember(
          202,
          {
            type: 'https://disglobal.dev/errors/disbursement_pending_review',
            title: 'Desembolso en revisión',
            status: 202,
            code: 'disbursement_pending_review',
            detail:
              'No pudimos confirmar tu desembolso con el banco a tiempo. Tu solicitud quedó registrada y un administrador la revisará en breve; no vuelvas a solicitar el mismo monto hasta que se resuelva.',
            extra: { loan_id: pending.id },
          },
          true,
        );
      }
      const loan = createLoan(q);
      return remember(200, {
        loan: toLoan(loan),
        receipt_download_url: SAMPLE_PDF,
        receipt_pdf_sha256: 'b'.repeat(64),
      });
    }
    case route === 'GET /app/loans':
      return json(200, state.loans.map(toLoan));
    case /^GET \/app\/loans\/[^/]+$/.test(route): {
      const l = state.loans.find((x) => x.id === decodeURIComponent(path.split('/').pop()!));
      return l ? json(200, l) : problem(404, 'Recurso no encontrado', 'El préstamo no existe.', 'not_found');
    }
    case /^POST \/app\/loans\/[^/]+\/payments$/.test(route): {
      const loanId = decodeURIComponent(path.split('/')[3]);
      const refKey = `${body.payer_bank_code}:${body.reference}`;
      if (state.usedReferences.has(refKey))
        return problem(
          409,
          'Conflicto',
          'Esta referencia de pago ya fue utilizada para aplicar un abono.',
          'conflict',
          { reason: 'reference_already_used' },
        );
      const fail = String(body.reference).toUpperCase().startsWith('SIMFAIL');
      if (fail)
        return problem(
          422,
          'Regla de negocio violada',
          'El banco no pudo validar este pago con los datos reportados. Verifica la referencia, el monto y la fecha e intenta de nuevo.',
          'business_rule_violation',
        );
      const loan = state.loans.find((x) => x.id === loanId);
      if (!loan) return problem(404, 'Recurso no encontrado', 'Préstamo no encontrado.', 'not_found');
      if (loan.status !== 'active')
        return problem(409, 'Conflicto', 'Solo se puede abonar a un préstamo activo.', 'conflict');
      const owed = loan.installments.reduce((a, i) => a.plus(i.status === 'paid' ? 0 : i.outstanding_usd), new Big(0));
      if (new Big(body.amount_usd as string).gt(owed))
        return problem(
          422,
          'Regla de negocio violada',
          'El monto del abono supera la deuda total del préstamo.',
          'business_rule_violation',
          {
            outstanding_usd: owed.toFixed(2),
            amount_usd: new Big(body.amount_usd as string).toFixed(2),
          },
        );
      state.usedReferences.add(refKey);
      let toPrincipal = new Big(0);
      let toInterest = new Big(0);
      if (loan) {
        let remaining = new Big(body.amount_usd as string);
        for (const inst of loan.installments) {
          if (remaining.lte(0)) break;
          if (inst.status === 'paid') continue;
          const instOutstanding = new Big(inst.outstanding_usd);
          const apply = remaining.lt(instOutstanding) ? remaining : instOutstanding;
          // Orden del backend: mora → interés/comisión → capital (aquí no hay mora).
          const interestDue = new Big(inst.interest_or_fee_component_usd).minus(inst.paid_fee_interest_usd);
          const interest = apply.lt(interestDue) ? apply : interestDue;
          const principal = apply.minus(interest);
          inst.paid_fee_interest_usd = new Big(inst.paid_fee_interest_usd).plus(interest).toFixed(2);
          inst.paid_principal_usd = new Big(inst.paid_principal_usd).plus(principal).toFixed(2);
          toInterest = toInterest.plus(interest);
          toPrincipal = toPrincipal.plus(principal);
          inst.outstanding_usd = new Big(inst.outstanding_usd).minus(apply).toFixed(2);
          remaining = remaining.minus(apply);
          if (new Big(inst.outstanding_usd).eq(0)) {
            inst.status = 'paid';
            inst.paid_at = new Date().toISOString();
          }
        }
        if (loan.installments.every((i) => i.status === 'paid')) {
          loan.status = 'paid_off';
          loan.paid_off_at = new Date().toISOString();
        }
      }
      return remember(200, {
        id: `${Date.now()}`,
        loan_id: loanId,
        amount_usd: body.amount_usd,
        provider_reference: body.reference,
        // El banco devuelve su referencia canónica (puede diferir de la declarada; guía §10.2).
        bank_reference: `0012${String(body.reference).padStart(8, '0')}`,
        confirmed_at: new Date().toISOString(),
        applied: {
          principal_usd: toPrincipal.toFixed(2),
          interest_or_fee_usd: toInterest.toFixed(2),
          mora_usd: '0.00',
        },
      });
    }
    case route === 'POST /app/extra-credit-requests': {
      resolveExtraCredits();
      const amount = new Big(body.requested_amount_usd || '0');
      const available = new Big(state.limit).minus(used());
      if (amount.lte(available))
        return json(
          422,
          {
            type: 'https://disglobal.dev/errors/business_rule_violation',
            title: 'Regla de negocio',
            status: 422,
            code: 'business_rule_violation',
            detail: 'Este monto está dentro de tu cupo disponible; solicítalo como un crédito normal.',
            extra: {
              reason: 'within_credit_limit',
              credit_limit_usd: state.limit,
              existing_principal_usd: used().toFixed(2),
              requested_usd: amount.toFixed(2),
            },
          },
          true,
        );
      if (state.extraCredits.some((r) => r.status === 'pending'))
        return json(
          409,
          {
            type: 'https://disglobal.dev/errors/conflict',
            title: 'Conflicto',
            status: 409,
            code: 'conflict',
            detail: 'Ya tienes una solicitud de extra-crédito pendiente.',
            extra: { reason: 'extra_credit_request_pending' },
          },
          true,
        );
      const now = new Date().toISOString();
      const r: ExtraCreditRequest = {
        id: `ec-${state.extraCredits.length + 1}`,
        employee_id: '00000000-0000-0000-0000-000000000001',
        employee_full_name: 'María Fernanda Pérez',
        employee_national_id: 'V18765432',
        requested_amount_usd: amount.toFixed(2),
        snapshot_credit_limit_usd: state.limit,
        snapshot_outstanding_principal_usd: used().toFixed(2),
        employee_note: body.note ?? null,
        status: 'pending',
        approved_amount_usd: null,
        rejection_reason: null,
        loan_id: null,
        requested_by_user_id: '00000000-0000-0000-0000-000000000001',
        resolved_at: null,
        resolved_by: null,
        created_at: now,
        updated_at: now,
      };
      state.extraCredits.unshift(r);
      return remember(201, r);
    }
    case /^POST \/app\/extra-credit-requests\/[^/]+\/cancel$/.test(route): {
      resolveExtraCredits();
      const r = state.extraCredits.find((x) => x.id === decodeURIComponent(path.split('/')[3]));
      if (!r) return problem(404, 'Recurso no encontrado', 'La solicitud no existe.', 'not_found');
      if (r.status !== 'pending')
        return problem(409, 'Conflicto', 'Solo se puede cancelar una solicitud pendiente.', 'conflict');
      r.status = 'cancelled';
      r.resolved_at = r.updated_at = new Date().toISOString();
      return remember(200, r);
    }
    case route.startsWith('GET /app/extra-credit-requests'): {
      resolveExtraCredits();
      const [p, qs] = path.split('?');
      const id = p.split('/')[3];
      if (id) {
        const r = state.extraCredits.find((x) => x.id === decodeURIComponent(id));
        return r ? json(200, r) : problem(404, 'Recurso no encontrado', 'La solicitud no existe.', 'not_found');
      }
      const status = new URLSearchParams(qs ?? '').get('status');
      return json(
        200,
        state.extraCredits.filter((r) => !status || r.status === status),
      );
    }
    default:
      return problem(404, 'No encontrado', `Ruta simulada inexistente: ${route}`, 'not_found');
  }
}
