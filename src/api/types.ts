import type { Money } from '../lib/money';

// Formas contrastadas contra el backend real (src/disglobal/modules/*/schemas.py
// en el repo Displata), no contra la guía. Si algo cambia en el servidor, se
// ajusta solo este archivo y `endpoints.ts`.

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
  refresh_token: string | null;
  token_type: string;
}

export interface CurrentUser {
  id: string;
  tenant_id: string | null;
  email: string;
  full_name: string;
  role: string;
  mfa_enabled: boolean;
  must_change_password: boolean;
}

export type LoanStatus = 'disbursing' | 'active' | 'cancelled' | 'paid_off' | 'disbursement_failed';
export type LoanInstallmentStatus = 'scheduled' | 'cancelled' | 'overdue' | 'paid';

export interface PaymentDestination {
  bank_code: string;
  phone: string;
  national_id: string;
}

export interface Profile {
  full_name: string;
  national_id: string;
  email: string | null;
  company_legal_name: string;
  employment_status: string;
  payment_frequency: 'weekly' | 'biweekly' | 'monthly';
  salary_per_period_usd: Money;
  installments_count: number;
  credit_limit_usd: Money;
  credit_used_usd: Money;
  credit_available_usd: Money;
  credit_agreement_signed: boolean;
  payout_registered: boolean;
  payment_destination: PaymentDestination | null;
}

export interface CreditAgreement {
  signed: boolean;
  pdf_sha256: string;
  download_url: string;
  accepted_at: string | null;
}

export interface Bank {
  code: string;
  name: string;
}

export interface PayoutAccount {
  registered: boolean;
  bank_code: string | null;
  phone: string | null;
  national_id: string | null;
  registered_at: string | null;
}

export interface LoanQuoteInstallment {
  sequence_number: number;
  due_date: string;
  period_key: string;
  principal_component_usd: Money;
  interest_or_fee_component_usd: Money;
  total_amount_usd: Money;
  total_amount_bs: Money;
}

export interface LoanQuote {
  principal_usd: Money;
  installments_count: number;
  total_payable_usd: Money;
  total_charge_usd: Money;
  fx_rate_date: string;
  usd_to_bs_rate: Money;
  total_payable_bs: Money;
  installments: LoanQuoteInstallment[];
  would_be_rejected: boolean;
  rejection_reason?: string | null;
  fx_rate_source?: string | null;
  fx_rate_source_date?: string | null;
  fx_rate_is_stale: boolean;
  fx_rate_age_days: number;
  fx_rate_confirmation_required: boolean;
  fx_rate_max_staleness_days?: number | null;
}

export interface LoanInstallment {
  sequence_number: number;
  due_date: string;
  period_key: string;
  principal_component_usd: Money;
  interest_or_fee_component_usd: Money;
  total_amount_usd: Money;
  status: LoanInstallmentStatus;
  paid_principal_usd: Money;
  paid_fee_interest_usd: Money;
  mora_accrued_usd: Money;
  mora_paid_usd: Money;
  outstanding_usd: Money;
  overdue_since: string | null;
  paid_at: string | null;
}

export interface Loan {
  id: string;
  employee_id: string;
  credit_product_id: string;
  status: LoanStatus;
  principal_usd: Money;
  installments_count: number;
  total_payable_usd: Money;
  charge_model_snapshot: string;
  rate_percent_snapshot: Money;
  payment_frequency_snapshot: 'weekly' | 'biweekly' | 'monthly';
  fx_rate_at_disbursement: Money | null;
  fx_rate_date: string | null;
  requested_at: string;
  disbursed_at: string | null;
  paid_off_at: string | null;
  created_at: string;
}

export interface LoanDetail extends Loan {
  installments: LoanInstallment[];
  receipt_download_url: string | null;
}

export interface LoanApplicationResult {
  loan: Loan;
  receipt_download_url: string;
  receipt_pdf_sha256: string;
}

/** Los 3 desenlaces posibles de `POST /app/loans`, unificados para la UI. */
export type LoanRequestOutcome =
  | { status: 'disbursed'; loan: Loan; receipt_download_url: string }
  | { status: 'rejected'; message: string }
  | { status: 'in_review'; message: string };

export interface PaymentTransaction {
  id: string;
  loan_id: string | null;
  amount_usd: Money;
  provider_reference: string;
  confirmed_at: string;
}

export interface DirectPaymentRequest {
  amount_usd: Money;
  reference: string;
  payment_date: string;
  payer_bank_code: string;
  payer_account: string;
}
