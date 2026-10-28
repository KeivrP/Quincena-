import type { Money } from '../lib/money';

// Formas basadas en la guía del desarrollador. Antes de producción, contrástalas con
// https://developer.dis-global.com/creditos/openapi.json (o genera los tipos con
// `npx openapi-typescript <url> -o src/api/schema.d.ts`) y ajusta solo este archivo.

export interface Problem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  extra?: { reason?: string; [k: string]: unknown };
  [k: string]: unknown;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in?: number;
}

export interface LoginResponse extends TokenPair {
  must_change_password?: boolean;
}

export interface Profile {
  full_name: string;
  email: string;
  cedula?: string;
  company_name?: string;
  must_change_password?: boolean;
  credit_limit: Money;
  credit_used: Money;
  credit_available: Money;
  contract_status: 'pending' | 'signed';
  payout_status: 'pending' | 'registered';
  payout_account?: { bank_code: string; bank_name?: string; phone: string; cedula: string } | null;
  // Cuenta de la empresa a la que el trabajador paga sus abonos (pago móvil).
  company_payment_account?: { bank_code: string; bank_name?: string; phone: string; rif: string } | null;
  active_credits?: CreditSummary[];
}

export interface Contract {
  status: 'pending' | 'signed';
  pdf_url: string; // URL prefirmada, corta vida, GET sin Authorization
  document_hash?: string; // sha256 hex del PDF, si el servidor lo expone
  signed_at?: string | null;
}

export interface Bank {
  code: string; // 4 dígitos
  name: string;
}

export interface QuoteRequest {
  amount: Money;
  installments: number;
}

export interface Quote {
  amount: Money;
  installments: number;
  installment_amount: Money;
  total: Money;
  amount_bs?: Money;
  exchange_rate?: Money;
  first_due_date?: string;
  would_be_rejected: boolean;
  rejection_reason?: string | null;
  installment_options?: number[];
}

export type CreditOutcome = 'disbursed' | 'rejected' | 'in_review';

export interface CreditRequestResult {
  id?: string;
  status: CreditOutcome | string;
  amount?: Money;
  amount_bs?: Money;
  message?: string;
}

export interface CreditSummary {
  id: string;
  amount: Money;
  outstanding: Money;
  status: string;
  installments: number;
  installment_amount: Money;
  next_due_date?: string | null;
  created_at: string;
}

export interface Installment {
  number: number;
  due_date: string; // fecha civil
  amount: Money;
  paid_amount?: Money;
  status: 'pending' | 'paid' | 'overdue' | 'partial' | string;
}

export interface CreditDetail extends CreditSummary {
  amount_bs?: Money;
  exchange_rate?: Money;
  schedule: Installment[];
  receipt_available?: boolean;
}

export interface PaymentReportRequest {
  credit_id: string;
  amount: Money;
  reference: string;
  bank_code?: string;
  paid_on?: string;
}

export interface PaymentReport {
  id: string;
  status: 'validated' | 'pending' | 'rejected' | string;
  amount: Money;
  reference: string;
  message?: string;
}
