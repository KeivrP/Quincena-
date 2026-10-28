import Big from 'big.js';
import type { CreditDetail, Installment, PaymentReport, Profile } from './types';

// Servidor simulado en memoria para ver la app sin credenciales (EXPO_PUBLIC_USE_MOCK=1).
// Reproduce los valores mágicos del banco simulado del backend:
//   monto terminado en .14 → rechazo del banco · .13 → en revisión · referencia SIMFAIL… → no concilia.

const RATE = '38.50';
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const state = {
  password: 'Temporal123',
  mustChange: true,
  contractSigned: false,
  payout: null as Profile['payout_account'],
  limit: '600.00',
  credits: [] as CreditDetail[],
  payments: [] as PaymentReport[],
  seenKeys: new Map<string, unknown>(),
};

function json(status: number, body: unknown, problem = false): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': problem ? 'application/problem+json' : 'application/json' },
  });
}

const problem = (status: number, title: string, detail: string, reason?: string) =>
  json(status, { type: 'about:blank', title, status, detail, extra: reason ? { reason } : {} }, true);

function fakeJwt(): string {
  const payload = globalThis.btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 15 * 60 }));
  return `x.${payload}.y`;
}

const used = () => state.credits.reduce((acc, c) => acc.plus(c.status === 'active' ? c.outstanding : '0'), new Big(0));

function addMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function quote(amount: string, installments: number) {
  const a = new Big(amount);
  const total = a.times(1.08).round(2);
  const inst = total.div(installments).round(2);
  const available = new Big(state.limit).minus(used());
  const over = a.gt(available);
  return {
    amount: a.toFixed(2),
    installments,
    installment_amount: inst.toFixed(2),
    total: total.toFixed(2),
    amount_bs: a.times(RATE).toFixed(2),
    exchange_rate: RATE,
    first_due_date: addMonths(1),
    installment_options: [1, 2, 3, 4, 6],
    would_be_rejected: over,
    rejection_reason: over ? `El monto supera tu cupo disponible ($${available.toFixed(2)}).` : null,
  };
}

function profile(): Profile {
  const u = used();
  return {
    full_name: 'María Fernanda Pérez',
    email: 'maria.perez@demo.com',
    cedula: 'V18765432',
    company_name: 'Distribuidora Demo QA',
    must_change_password: state.mustChange,
    credit_limit: state.limit,
    credit_used: u.toFixed(2),
    credit_available: new Big(state.limit).minus(u).toFixed(2),
    contract_status: state.contractSigned ? 'signed' : 'pending',
    payout_status: state.payout ? 'registered' : 'pending',
    payout_account: state.payout,
    company_payment_account: {
      bank_code: '0171',
      bank_name: 'Banco Activo',
      phone: '04141234567',
      rif: 'J-40123456-7',
    },
    active_credits: state.credits.filter((c) => c.status === 'active'),
  };
}

const SAMPLE_PDF = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

export async function mockRequest(
  method: string,
  path: string,
  body: any,
  headers: Record<string, string>,
): Promise<Response> {
  await delay(path === '/app/credits' && method === 'POST' ? 1800 : 350);
  const idem = headers['Idempotency-Key'];
  if (idem && state.seenKeys.has(idem)) return json(200, state.seenKeys.get(idem));
  const remember = (payload: unknown) => {
    if (idem) state.seenKeys.set(idem, payload);
    return json(200, payload);
  };

  const route = `${method} ${path}`;
  switch (true) {
    case route === 'POST /auth/login': {
      if (body.password !== state.password && body.password !== 'Demo1234')
        return problem(401, 'No autorizado', 'Credenciales inválidas', 'invalid_credentials');
      return json(200, {
        access_token: fakeJwt(),
        refresh_token: 'r',
        expires_in: 900,
        must_change_password: state.mustChange,
      });
    }
    case route === 'POST /auth/refresh':
      return json(200, { access_token: fakeJwt(), refresh_token: 'r2', expires_in: 900 });
    case route === 'POST /auth/logout':
      return json(204, undefined);
    case route === 'POST /auth/change-password':
      state.password = body.new_password;
      state.mustChange = false;
      return json(204, undefined);
    case route === 'POST /auth/password-reset/request':
    case route === 'POST /auth/password-reset/confirm':
      if (body.code && body.code !== '123456')
        return problem(400, 'Código inválido', 'El código no es válido o venció.');
      if (body.new_password) state.password = body.new_password;
      return json(204, undefined);
    case route === 'GET /app/profile':
      return json(200, profile());
    case route === 'GET /app/contract':
      return json(200, { status: state.contractSigned ? 'signed' : 'pending', pdf_url: SAMPLE_PDF });
    case route === 'POST /app/contract/sign':
      state.contractSigned = true;
      return remember({ status: 'signed', pdf_url: SAMPLE_PDF, signed_at: new Date().toISOString() });
    case route === 'GET /app/banks':
      return json(200, [
        { code: '0102', name: 'Banco de Venezuela' },
        { code: '0105', name: 'Banco Mercantil' },
        { code: '0108', name: 'BBVA Provincial' },
        { code: '0134', name: 'Banesco' },
        { code: '0171', name: 'Banco Activo' },
        { code: '0191', name: 'BNC' },
      ]);
    case route === 'PUT /app/payout-account':
      state.payout = body;
      return json(200, body);
    case route === 'POST /app/credits/quote':
      return json(200, quote(body.amount, body.installments));
    case route === 'POST /app/credits': {
      const q = quote(body.amount, body.installments);
      if (q.would_be_rejected) return problem(422, 'Cupo insuficiente', q.rejection_reason!, 'limit_exceeded');
      if (q.amount.endsWith('.14'))
        return remember({
          status: 'rejected',
          message: 'El banco rechazó la transferencia. No se descontó nada de tu cupo.',
        });
      const id = `CR-${1000 + state.credits.length + 1}`;
      const schedule: Installment[] = Array.from({ length: q.installments }, (_, i) => ({
        number: i + 1,
        due_date: addMonths(i + 1),
        amount: q.installment_amount,
        paid_amount: '0.00',
        status: 'pending',
      }));
      const inReview = q.amount.endsWith('.13');
      state.credits.unshift({
        id,
        amount: q.amount,
        amount_bs: q.amount_bs,
        exchange_rate: RATE,
        outstanding: q.total,
        status: inReview ? 'in_review' : 'active',
        installments: q.installments,
        installment_amount: q.installment_amount,
        next_due_date: schedule[0].due_date,
        created_at: new Date().toISOString(),
        schedule,
        receipt_available: !inReview,
      });
      return remember({ id, status: inReview ? 'in_review' : 'disbursed', amount: q.amount, amount_bs: q.amount_bs });
    }
    case route === 'GET /app/credits':
      return json(200, state.credits);
    case /^GET \/app\/credits\/[^/]+\/receipt$/.test(route):
      return json(200, { pdf_url: SAMPLE_PDF });
    case /^GET \/app\/credits\/[^/]+$/.test(route): {
      const c = state.credits.find((x) => x.id === decodeURIComponent(path.split('/').pop()!));
      return c ? json(200, c) : problem(404, 'No encontrado', 'El crédito no existe.');
    }
    case route === 'POST /app/payments': {
      const fail = String(body.reference).toUpperCase().startsWith('SIMFAIL');
      const p: PaymentReport = {
        id: `AB-${state.payments.length + 1}`,
        status: fail ? 'rejected' : 'validated',
        amount: body.amount,
        reference: body.reference,
        message: fail ? 'No encontramos ese pago en el banco. Verifica la referencia.' : 'Abono validado con el banco.',
      };
      if (!fail) {
        const c = state.credits.find((x) => x.id === body.credit_id);
        if (c) {
          const left = new Big(c.outstanding).minus(body.amount);
          c.outstanding = (left.lt(0) ? new Big(0) : left).toFixed(2);
          const next = c.schedule.find((s) => s.status !== 'paid');
          if (next) next.status = 'paid';
          if (new Big(c.outstanding).eq(0)) c.status = 'paid';
          c.next_due_date = c.schedule.find((s) => s.status !== 'paid')?.due_date ?? null;
        }
      }
      state.payments.unshift(p);
      return remember(p);
    }
    case route === 'GET /app/payments':
      return json(200, state.payments);
    default:
      return problem(404, 'No encontrado', `Ruta simulada inexistente: ${route}`);
  }
}
