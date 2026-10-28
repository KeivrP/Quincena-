import Big from 'big.js';
import type { Loan, LoanDetail, LoanInstallment, Profile } from './types';

// Servidor simulado en memoria para ver la app sin credenciales (EXPO_PUBLIC_USE_MOCK=1).
// Reproduce los valores mágicos del banco simulado del backend:
//   monto terminado en .14 → rechazo del banco (502) · .13 → en revisión (202) ·
//   referencia SIMFAIL… → el banco no concilia el abono (422).
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
  seenKeys: new Map<string, { status: number; body: unknown }>(),
};

function json(status: number, body: unknown, problem = false): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': problem ? 'application/problem+json' : 'application/json' },
  });
}

const problem = (status: number, title: string, detail: string, code: string) =>
  json(status, { type: `https://disglobal.dev/errors/${code}`, title, status, code, detail }, true);

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

function buildQuote(principal: string) {
  const a = new Big(principal || '0');
  const total = a.times(1.08).round(2);
  const perInstallment = total.div(INSTALLMENTS_COUNT).round(2);
  const available = new Big(state.limit).minus(used());
  const over = a.gt(available);
  const installments = Array.from({ length: INSTALLMENTS_COUNT }, (_, i) => ({
    sequence_number: i + 1,
    due_date: addDays((i + 1) * 15),
    period_key: `2026-Q${i + 1}`,
    principal_component_usd: a.div(INSTALLMENTS_COUNT).round(2).toFixed(2),
    interest_or_fee_component_usd: perInstallment.minus(a.div(INSTALLMENTS_COUNT).round(2)).toFixed(2),
    total_amount_usd: perInstallment.toFixed(2),
    total_amount_bs: perInstallment.times(RATE).toFixed(2),
  }));
  return {
    principal_usd: a.toFixed(2),
    installments_count: INSTALLMENTS_COUNT,
    total_payable_usd: total.toFixed(2),
    total_charge_usd: total.minus(a).toFixed(2),
    fx_rate_date: new Date().toISOString().slice(0, 10),
    usd_to_bs_rate: RATE,
    total_payable_bs: total.times(RATE).toFixed(2),
    installments,
    would_be_rejected: over,
    rejection_reason: over ? `El monto supera tu cupo disponible ($${available.toFixed(2)}).` : null,
    fx_rate_is_stale: false,
    fx_rate_age_days: 0,
    fx_rate_confirmation_required: false,
  };
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
    payment_destination: { bank_code: '0171', phone: '04141234567', national_id: 'J-40123456-7' },
  };
}

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
  switch (true) {
    case route === 'POST /auth/login': {
      if (body.password !== state.password && body.password !== 'Demo1234')
        return problem(401, 'No autorizado', 'Correo o contraseña incorrectos.', 'unauthorized');
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
      state.password = body.new_password;
      state.mustChange = false;
      return json(204, undefined);
    case route === 'POST /auth/password-reset/request':
      return json(202, { message: 'Si el correo está registrado, enviamos un código de 6 dígitos.' });
    case route === 'POST /auth/password-reset/confirm':
      if (body.code && body.code !== '123456')
        return problem(422, 'Código inválido', 'El código es inválido o expiró.', 'invalid_or_expired_code');
      if (body.new_password) state.password = body.new_password;
      return json(204, undefined);
    case route === 'GET /app/profile':
      return json(200, profile());
    case route === 'GET /app/credit-agreement':
      return json(200, {
        signed: state.agreementSigned,
        pdf_sha256: 'a'.repeat(64),
        download_url: SAMPLE_PDF,
        accepted_at: state.agreementSigned ? new Date().toISOString() : null,
      });
    case route === 'POST /app/credit-agreement/accept':
      state.agreementSigned = true;
      return remember(200, {
        signed: true,
        pdf_sha256: 'a'.repeat(64),
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
    case route === 'PUT /app/payout-account':
      state.payout = { bank_code: body.bank_code, phone: body.phone, national_id: body.national_id };
      return json(200, {
        registered: true,
        bank_code: state.payout.bank_code,
        phone: state.payout.phone,
        national_id: state.payout.national_id,
        registered_at: new Date().toISOString(),
      });
    case route === 'POST /app/loans/quote':
      return json(200, buildQuote(body.principal_usd));
    case route === 'POST /app/loans': {
      const q = buildQuote(body.principal_usd);
      if (q.would_be_rejected)
        return problem(422, 'Cupo insuficiente', q.rejection_reason!, 'credit_limit_exceeded');
      if (q.principal_usd.endsWith('.14'))
        return problem(
          502,
          'El banco no pudo procesar el desembolso',
          'El banco rechazó la transferencia. No se descontó nada de tu cupo.',
          'disbursement_failed',
        );
      if (q.principal_usd.endsWith('.13'))
        return remember(
          202,
          {
            type: 'https://disglobal.dev/errors/disbursement_pending_review',
            title: 'Desembolso en revisión',
            status: 202,
            code: 'disbursement_pending_review',
            detail:
              'No pudimos confirmar tu desembolso con el banco a tiempo. Tu solicitud quedó registrada y un administrador la revisará en breve.',
          },
          true,
        );
      const id = `${state.loans.length + 1}`.padStart(8, '0') + '-0000-0000-0000-000000000000';
      const now = new Date().toISOString();
      const installments: LoanInstallment[] = q.installments.map((i) => ({
        sequence_number: i.sequence_number,
        due_date: i.due_date,
        period_key: i.period_key,
        principal_component_usd: i.principal_component_usd,
        interest_or_fee_component_usd: i.interest_or_fee_component_usd,
        total_amount_usd: i.total_amount_usd,
        status: 'scheduled',
        paid_principal_usd: '0.00',
        paid_fee_interest_usd: '0.00',
        mora_accrued_usd: '0.00',
        mora_paid_usd: '0.00',
        outstanding_usd: i.total_amount_usd,
        overdue_since: null,
        paid_at: null,
      }));
      const loan: LoanDetail = {
        id,
        employee_id: '00000000-0000-0000-0000-000000000001',
        credit_product_id: '00000000-0000-0000-0000-000000000002',
        status: 'active',
        principal_usd: q.principal_usd,
        installments_count: q.installments_count,
        total_payable_usd: q.total_payable_usd,
        charge_model_snapshot: 'flat_fee',
        rate_percent_snapshot: '8.000',
        payment_frequency_snapshot: 'monthly',
        fx_rate_at_disbursement: RATE,
        fx_rate_date: q.fx_rate_date,
        requested_at: now,
        disbursed_at: now,
        paid_off_at: null,
        created_at: now,
        installments,
        receipt_download_url: SAMPLE_PDF,
      };
      state.loans.unshift(loan);
      return remember(200, {
        loan: toLoan(loan),
        receipt_download_url: SAMPLE_PDF,
        receipt_pdf_sha256: 'b'.repeat(64),
      });
    }
    case route === 'GET /app/loans':
      return json(
        200,
        state.loans.map(toLoan),
      );
    case /^GET \/app\/loans\/[^/]+$/.test(route): {
      const l = state.loans.find((x) => x.id === decodeURIComponent(path.split('/').pop()!));
      return l ? json(200, l) : problem(404, 'Recurso no encontrado', 'El préstamo no existe.', 'not_found');
    }
    case /^POST \/app\/loans\/[^/]+\/payments$/.test(route): {
      const loanId = decodeURIComponent(path.split('/')[3]);
      const fail = String(body.reference).toUpperCase().startsWith('SIMFAIL');
      if (fail)
        return problem(
          422,
          'El banco no pudo validar este pago',
          'El banco no pudo validar este pago con los datos reportados. Verifica la referencia, el monto y la fecha.',
          'payment_not_validated',
        );
      const loan = state.loans.find((x) => x.id === loanId);
      if (loan) {
        let remaining = new Big(body.amount_usd as string);
        for (const inst of loan.installments) {
          if (remaining.lte(0)) break;
          if (inst.status === 'paid') continue;
          const instOutstanding = new Big(inst.outstanding_usd);
          const apply = remaining.lt(instOutstanding) ? remaining : instOutstanding;
          inst.paid_principal_usd = new Big(inst.paid_principal_usd).plus(apply).toFixed(2);
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
        confirmed_at: new Date().toISOString(),
      });
    }
    default:
      return problem(404, 'No encontrado', `Ruta simulada inexistente: ${route}`, 'not_found');
  }
}
