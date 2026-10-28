import { request, requestWithStatus } from './client';
import { DISBURSE_TIMEOUT_MS } from './config';
import { withIdempotency } from './idempotency';
import type {
  Bank,
  CreditAgreement,
  CurrentUser,
  DirectPaymentRequest,
  Loan,
  LoanDetail,
  LoanQuote,
  LoanRequestOutcome,
  PaymentTransaction,
  PayoutAccount,
  Problem,
  Profile,
  TokenPair,
} from './types';

// Rutas y formas contrastadas contra el código real del backend (módulos
// identity/origination/lending/collections/workforce en el repo Displata).
// Si el servidor cambia algo, se corrige SOLO aquí.

export const authApi = {
  login: (email: string, password: string) =>
    request<TokenPair>('/auth/login', { method: 'POST', auth: false, body: { email, password } }),

  /** El login NO trae `must_change_password` — hay que pedirlo aparte. */
  me: () => request<CurrentUser>('/auth/me'),

  logout: (refreshToken: string) =>
    request<void>('/auth/logout', { method: 'POST', body: { refresh_token: refreshToken } }),

  changePassword: (current_password: string, new_password: string) =>
    request<void>('/auth/change-password', { method: 'POST', body: { current_password, new_password } }),

  requestPasswordReset: (email: string) =>
    request<void>('/auth/password-reset/request', { method: 'POST', auth: false, body: { email } }),

  confirmPasswordReset: (email: string, code: string, new_password: string) =>
    request<void>('/auth/password-reset/confirm', {
      method: 'POST',
      auth: false,
      body: { email, code, new_password },
    }),
};

export const appApi = {
  profile: () => request<Profile>('/app/profile'),

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

  savePayoutAccount: (body: { bank_code: string; phone: string; national_id: string }) =>
    request<PayoutAccount>('/app/payout-account', { method: 'PUT', body }),

  quote: (principal_usd: string) => request<LoanQuote>('/app/loans/quote', { method: 'POST', body: { principal_usd } }),

  /**
   * Pide el crédito: desembolsa en línea. El backend responde uno de 3
   * desenlaces: 200 desembolsado, 502 `disbursement_failed` (rechazo del
   * banco: nada se persistió, no hay reintento posible con la misma solicitud)
   * o 202 `disbursement_pending_review` (el banco no confirmó a tiempo).
   */
  requestCredit: async (
    principal_usd: string,
    fxConfirmation?: { accepted_fx_rate_source_date: string; accepted_usd_to_bs_rate: string },
  ): Promise<LoanRequestOutcome> => {
    const body = { principal_usd, ...fxConfirmation };
    const { status, data } = await withIdempotency('credit-request', body, (key) =>
      requestWithStatus<{ loan: Loan; receipt_download_url: string; receipt_pdf_sha256: string } | Problem>(
        '/app/loans',
        { method: 'POST', body, idempotencyKey: key, timeoutMs: DISBURSE_TIMEOUT_MS },
      ),
    );
    if (status === 202) {
      const problem = data as Problem;
      return { status: 'in_review', message: problem.detail ?? 'Tu crédito quedó en revisión.' };
    }
    const ok = data as { loan: Loan; receipt_download_url: string };
    return { status: 'disbursed', loan: ok.loan, receipt_download_url: ok.receipt_download_url };
    // Nota: el rechazo del banco (502 `disbursement_failed`) y el resto de
    // errores de negocio (409/422/503) NO llegan aquí: `request()` los lanza
    // como `ApiError` — el caller los distingue por `e.reason`.
  },

  loans: () => request<Loan[]>('/app/loans'),

  loan: (id: string) => request<LoanDetail>(`/app/loans/${encodeURIComponent(id)}`),

  reportPayment: (loanId: string, body: DirectPaymentRequest) =>
    withIdempotency('payment-report', { loanId, ...body }, (key) =>
      request<PaymentTransaction>(`/app/loans/${encodeURIComponent(loanId)}/payments`, {
        method: 'POST',
        body,
        idempotencyKey: key,
      }),
    ),
};
