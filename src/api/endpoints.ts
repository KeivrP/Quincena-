import { request } from './client';
import { DISBURSE_TIMEOUT_MS, LOGIN_TIMEOUT_MS, PAYMENT_TIMEOUT_MS } from './config';
import { ApiError } from './errors';
import { withIdempotency } from './idempotency';
import type {
  Bank,
  CreditAgreement,
  CreditProduct,
  CurrentUser,
  DeviceSession,
  DirectPaymentRequest,
  ExtraCreditRequest,
  ExtraCreditStatus,
  LoanApplicationResult,
  Loan,
  LoanDetail,
  LoanQuote,
  LoanRequestOutcome,
  PaymentTransaction,
  PayoutAccount,
  Profile,
  TokenPair,
} from './types';

// Rutas y formas de la "Guía definitiva de la API — App móvil del trabajador" (2026-11-16),
// verificada contra el backend en main. Si el servidor cambia algo, se corrige SOLO aquí.

export const authApi = {
  login: (email: string, password: string) =>
    request<TokenPair>('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email, password },
      timeoutMs: LOGIN_TIMEOUT_MS,
    }),

  /** El login NO trae `must_change_password` ni el rol: hay que pedirlos aquí (guía §4.4). */
  me: () => request<CurrentUser>('/auth/me'),

  logout: (refreshToken: string) =>
    request<void>('/auth/logout', { method: 'POST', body: { refresh_token: refreshToken } }),

  /** 204. Contraseña actual incorrecta = 422 `invalid_current_password` (NO un 401). */
  changePassword: (current_password: string, new_password: string) =>
    request<void>('/auth/change-password', { method: 'POST', body: { current_password, new_password } }),

  /** 202 siempre, exista o no la cuenta. Llega un código de 6 dígitos por correo. */
  requestPasswordReset: (email: string) =>
    request<{ message: string }>('/auth/password-reset/request', { method: 'POST', auth: false, body: { email } }),

  /** 204. Cierra TODAS las sesiones del usuario; hay que iniciar sesión con la clave nueva. */
  confirmPasswordReset: (email: string, code: string, new_password: string) =>
    request<void>('/auth/password-reset/confirm', {
      method: 'POST',
      auth: false,
      body: { email, code, new_password },
    }),
};

export const appApi = {
  /** Única ruta `/app/*` disponible con la contraseña temporal. */
  profile: () => request<Profile>('/app/profile'),

  /** Dispositivos con sesión abierta, del más reciente al más antiguo (guía §4.8). */
  sessions: () => request<DeviceSession[]>('/app/sessions'),

  /** Cierra todas las sesiones salvo la actual. No hay cierre de una sesión individual. */
  revokeOtherSessions: () => request<{ revoked_count: number }>('/app/sessions/revoke-others', { method: 'POST' }),

  creditAgreement: () => request<CreditAgreement>('/app/credit-agreement'),

  signCreditAgreement: (accepted_pdf_sha256: string) =>
    withIdempotency('credit-agreement-accept', { accepted_pdf_sha256 }, (key) =>
      request<CreditAgreement>('/app/credit-agreement/accept', {
        method: 'POST',
        body: { accepted_pdf_sha256 },
        idempotencyKey: key,
      }),
    ),

  banks: () => request<Bank[]>('/app/banks'),

  payoutAccount: () => request<PayoutAccount>('/app/payout-account'),

  /**
   * Cambiar una cuenta YA registrada exige `current_password` (422 `current_password_required` /
   * `invalid_current_password`); el primer registro y reenviar los mismos datos, no. Un cambio real
   * activa 24 h de espera para recibir desembolsos (`payout_account_recently_changed`).
   */
  savePayoutAccount: (body: { bank_code: string; phone: string; national_id: string; current_password?: string }) =>
    request<PayoutAccount>('/app/payout-account', { method: 'PUT', body }),

  /** Cero o un producto: el asignado AL TRABAJADOR (guía §7.1). Opcional: el perfil ya lo trae. */
  creditProducts: () => request<CreditProduct[]>('/app/credit-products'),

  quote: (principal_usd: string) => request<LoanQuote>('/app/loans/quote', { method: 'POST', body: { principal_usd } }),

  /**
   * Pide el crédito: desembolsa en línea (guía §7.3 y §7.4). Desenlaces:
   * - 200 → desembolsado.
   * - 202 `disbursement_pending_review` (cuerpo con `code`, que `request()` lanza como error) → en
   *   revisión, con `extra.loan_id`. NUNCA se reintenta.
   * - El resto (502 `disbursement_failed`, 409/422/429/503) se lanza como `ApiError` y la pantalla
   *   lo distingue por `code`/`reason`.
   * Los campos de tasa van siempre (recomendado): si la tasa cambió, el servidor responde
   * `409 fx_rate_changed` en vez de desembolsar a una tasa que el usuario no vio.
   */
  requestCredit: async (
    principal_usd: string,
    fx?: { accepted_fx_rate_source_date: string; accepted_usd_to_bs_rate: string },
  ): Promise<LoanRequestOutcome> => {
    const body = { principal_usd, ...fx };
    try {
      const ok = await withIdempotency('credit-request', body, (key) =>
        request<LoanApplicationResult>('/app/loans', {
          method: 'POST',
          body,
          idempotencyKey: key,
          timeoutMs: DISBURSE_TIMEOUT_MS,
        }),
      );
      return { status: 'disbursed', loan: ok.loan, receipt_download_url: ok.receipt_download_url };
    } catch (e) {
      if (e instanceof ApiError && e.status === 202 && e.code === 'disbursement_pending_review') {
        return {
          status: 'in_review',
          message: e.problem.detail ?? 'Tu crédito quedó en revisión.',
          loanId: e.extra<string>('loan_id'),
        };
      }
      throw e;
    }
  },

  /** Todos los estados, sin cronograma, del más reciente al más antiguo. */
  loans: () => request<Loan[]>('/app/loans'),

  loan: (id: string) => request<LoanDetail>(`/app/loans/${encodeURIComponent(id)}`),

  /**
   * Reporta un abono: valida con el banco en la misma llamada (guía §10). Sin respuesta → la MISMA
   * clave en el reintento; error con cuerpo → clave nueva (lo decide `withIdempotency`).
   */
  reportPayment: (loanId: string, body: DirectPaymentRequest) =>
    withIdempotency('payment-report', { loanId, ...body }, (key) =>
      request<PaymentTransaction>(`/app/loans/${encodeURIComponent(loanId)}/payments`, {
        method: 'POST',
        body,
        idempotencyKey: key,
        timeoutMs: PAYMENT_TIMEOUT_MS,
      }),
    ),

  // ---------- Extra-crédito: un monto por encima del cupo, que aprueba RRHH ----------

  /** Solo puede haber una `pending` a la vez (409 `extra_credit_request_pending`). */
  requestExtraCredit: (requested_amount_usd: string, note?: string) => {
    const body = { requested_amount_usd, ...(note ? { note } : {}) };
    return withIdempotency('extra-credit-request', body, (key) =>
      request<ExtraCreditRequest>('/app/extra-credit-requests', { method: 'POST', body, idempotencyKey: key }),
    );
  },

  /** Sin `limit` el backend devuelve la lista completa (no la página). */
  extraCreditRequests: (status?: ExtraCreditStatus) =>
    request<ExtraCreditRequest[]>(`/app/extra-credit-requests${status ? `?status=${status}` : ''}`),

  extraCreditRequest: (id: string) =>
    request<ExtraCreditRequest>(`/app/extra-credit-requests/${encodeURIComponent(id)}`),

  /** Solo si está `pending` (409 si ya se resolvió: releer la solicitud). */
  cancelExtraCredit: (id: string) =>
    withIdempotency(`extra-credit-cancel`, { id }, (key) =>
      request<ExtraCreditRequest>(`/app/extra-credit-requests/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
        idempotencyKey: key,
      }),
    ),
};
