import { request } from './client';
import { DISBURSE_TIMEOUT_MS } from './config';
import { ApiError } from './errors';
import { withIdempotency } from './idempotency';
import type {
  Bank,
  Contract,
  CreditDetail,
  CreditRequestResult,
  CreditSummary,
  LoginResponse,
  PaymentReport,
  PaymentReportRequest,
  Profile,
  Quote,
  QuoteRequest,
} from './types';

// Rutas según la guía (app-movil.md). Si alguna difiere en openapi.json, se corrige SOLO aquí.

export const authApi = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', { method: 'POST', auth: false, body: { email, password } }),

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

  contract: () => request<Contract>('/app/contract'),

  signContract: (document_hash: string) =>
    withIdempotency('contract-sign', { document_hash }, (key) =>
      request<Contract>('/app/contract/sign', { method: 'POST', body: { document_hash }, idempotencyKey: key }),
    ),

  banks: () => request<Bank[]>('/app/banks'),

  savePayoutAccount: (body: { bank_code: string; phone: string; cedula: string }) =>
    request<Profile['payout_account']>('/app/payout-account', { method: 'PUT', body }),

  quote: (body: QuoteRequest) => request<Quote>('/app/credits/quote', { method: 'POST', body }),

  /** Pide el crédito: desembolsa en línea. Devuelve siempre uno de los 3 desenlaces. */
  requestCredit: async (body: QuoteRequest): Promise<CreditRequestResult> => {
    try {
      return await withIdempotency('credit-request', body, (key) =>
        request<CreditRequestResult>('/app/credits', {
          method: 'POST',
          body,
          idempotencyKey: key,
          timeoutMs: DISBURSE_TIMEOUT_MS,
        }),
      );
    } catch (e) {
      // El rechazo del banco puede llegar como problem+json en vez de un 2xx con status.
      if (e instanceof ApiError && e.reason?.includes('reject')) {
        return { status: 'rejected', message: e.problem.detail ?? e.message };
      }
      throw e;
    }
  },

  credits: () => request<CreditSummary[]>('/app/credits'),

  credit: (id: string) => request<CreditDetail>(`/app/credits/${encodeURIComponent(id)}`),

  /** Devuelve una URL prefirmada nueva cada vez (las anteriores vencen). */
  creditReceipt: (id: string) => request<{ pdf_url: string }>(`/app/credits/${encodeURIComponent(id)}/receipt`),

  reportPayment: (body: PaymentReportRequest) =>
    withIdempotency('payment-report', body, (key) =>
      request<PaymentReport>('/app/payments', { method: 'POST', body, idempotencyKey: key }),
    ),

  payments: () => request<PaymentReport[]>('/app/payments'),
};
