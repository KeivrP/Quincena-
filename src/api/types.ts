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
  /**
   * Pago móvil DE LA EMPRESA (no necesariamente la cuenta receptora del gateway; guía §10.1 y §15
   * A1). `null` si la empresa no tiene cuenta configurada: entonces no se ofrece reportar abonos.
   */
  payment_destination: PaymentDestination | null;
  /** Producto asignado al trabajador; `null` = no puede cotizar ni pedir crédito (guía §5.2). */
  credit_product?: CreditProduct | null;
}

/** `GET /app/credit-products` (0 o 1 elemento) y `credit_product` del perfil (guía §7.1). */
export interface CreditProduct {
  id: string;
  tenant_id: string;
  name: string;
  funding_source: string;
  /** Obsoleto: usar `amortization_method`. */
  charge_model?: string;
  amortization_method: AmortizationMethod;
  rate_percent: Money;
  rate_period_months: number | null;
  allowed_installments: number[];
  min_amount_usd: Money;
  max_amount_usd: Money;
  /** Tasa ANUAL de mora. */
  default_interest_percent: Money;
  fees: { id?: string; name: string; percent: Money }[];
  version?: number;
  is_active?: boolean;
}

/** `GET /app/sessions`: un dispositivo con sesión abierta (guía §4.8). */
export interface DeviceSession {
  family_id: string;
  ip: string | null;
  user_agent: string | null;
  last_seen_at: string;
  is_current: boolean;
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

/**
 * Cómo se arma el cronograma (lo elige el admin al crear el producto):
 * - `french`: cuota pareja; si hay comisiones, van todas en la cuota 1.
 * - `german`: capital fijo, el total de la cuota BAJA con el tiempo.
 * - `flat_prorated`: sin interés, la comisión prorrateada en todas las cuotas.
 * - `flat_interest`: cuotas iguales; el cargo es INTERÉS total del préstamo (no anual), repartido en
 *   partes iguales (`fee_component_usd` = 0).
 * Se toleran valores nuevos: la UI muestra el texto crudo.
 */
export type AmortizationMethod = 'french' | 'german' | 'flat_prorated' | 'flat_interest';

/** Una comisión del producto; su suma es `total_fees_usd`. */
export interface LoanFee {
  name: string;
  percent: Money;
  amount_usd: Money;
  /** Solo en el detalle del préstamo otorgado: en qué cuota se cobra. */
  applied_on_installment?: number | null;
}

// Los campos del desglose (tandas 2026-11-07 y 2026-11-08) se marcan opcionales mientras el
// servidor de pruebas no los tenga desplegados: la UI cae al total combinado si faltan.
export interface LoanQuoteInstallment {
  sequence_number: number;
  due_date: string;
  period_key: string;
  principal_component_usd: Money;
  /** Interés + comisión sumados (= interest_component_usd + fee_component_usd). */
  interest_or_fee_component_usd: Money;
  interest_component_usd?: Money;
  fee_component_usd?: Money;
  /** NO es constante: con `german` baja, y con `french` + comisiones la cuota 1 es más alta. */
  total_amount_usd: Money;
  total_amount_bs: Money;
}

export interface LoanQuote {
  principal_usd: Money;
  installments_count: number;
  total_payable_usd: Money;
  /** = total_interest_usd + total_fees_usd. */
  total_charge_usd: Money;
  amortization_method?: AmortizationMethod;
  total_interest_usd?: Money;
  total_fees_usd?: Money;
  fees?: LoanFee[];
  fx_rate_date: string;
  usd_to_bs_rate: Money;
  total_payable_bs: Money;
  installments: LoanQuoteInstallment[];
  would_be_rejected: boolean;
  rejection_reason?: string | null;
  /**
   * El monto supera el cupo y es lo ÚNICO que falla. Junto con `would_be_rejected`, en vez de un
   * error se ofrece pedirlo como extra-crédito.
   */
  exceeds_credit_limit?: boolean;
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
  interest_component_usd?: Money;
  fee_component_usd?: Money;
  total_amount_usd: Money;
  status: LoanInstallmentStatus;
  paid_principal_usd: Money;
  paid_fee_interest_usd: Money;
  mora_accrued_usd: Money;
  mora_paid_usd: Money;
  outstanding_usd: Money;
  overdue_since: string | null;
  paid_at: string | null;
  /** Último día SIN mora de esta cuota; `null` si el préstamo no tiene gracia. Solo en el detalle. */
  mora_grace_ends_on?: string | null;
  /** La cuota ya venció pero todavía no genera mora. */
  in_mora_grace_period?: boolean;
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
  /** `charge_model_snapshot` es ambiguo entre french/german; este es el que manda. */
  amortization_method_snapshot?: AmortizationMethod | null;
  rate_period_months_snapshot?: number | null;
  total_interest_usd?: Money;
  total_fees_usd?: Money;
  /** Días de gracia de mora de ESTE crédito (0 = sin gracia), fijados al originarse. */
  grace_period_days_snapshot?: number;
}

/** `GET /app/loans/{id}`: además trae el cronograma, las comisiones y el comprobante. */
export interface LoanDetail extends Loan {
  installments: LoanInstallment[];
  /** `null` mientras el préstamo esté en revisión. */
  receipt_download_url: string | null;
  fees?: LoanFee[];
}

export interface LoanApplicationResult {
  loan: Loan;
  receipt_download_url: string;
  receipt_pdf_sha256: string;
}

/** Los 3 desenlaces posibles de `POST /app/loans`, unificados para la UI. */
export type LoanRequestOutcome =
  | { status: 'disbursed'; loan: Loan; receipt_download_url: string }
  | { status: 'in_review'; message: string; loanId?: string };

/** Cómo se repartió ESE abono. Orden del backend: mora → interés/comisión → capital. */
export interface PaymentApplied {
  principal_usd: Money;
  interest_or_fee_usd: Money;
  mora_usd: Money;
}

export interface PaymentTransaction {
  id: string;
  loan_id: string | null;
  amount_usd: Money;
  /** La referencia que DECLARÓ el trabajador. */
  provider_reference: string;
  /** Referencia canónica del banco para ese pago (puede diferir de la declarada, o venir null). */
  bank_reference?: string | null;
  confirmed_at: string;
  applied: PaymentApplied;
}

// ---------- Extra-crédito: un monto por encima del cupo, que aprueba RRHH ----------

export type ExtraCreditStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface UserSummary {
  id: string;
  full_name: string;
  email: string;
}

/** `ExtraCreditRequestResponse` del backend (origination/schemas.py). */
export interface ExtraCreditRequest {
  id: string;
  employee_id: string;
  employee_full_name?: string | null;
  employee_national_id?: string | null;
  requested_amount_usd: Money;
  /** Cupo y deuda del trabajador al momento de pedir. */
  snapshot_credit_limit_usd: Money;
  snapshot_outstanding_principal_usd: Money;
  employee_note: string | null;
  status: ExtraCreditStatus;
  approved_amount_usd: Money | null;
  rejection_reason: string | null;
  loan_id: string | null;
  requested_by_user_id: string;
  resolved_at: string | null;
  resolved_by?: UserSummary | null;
  created_at: string;
  updated_at: string;
}

export interface DirectPaymentRequest {
  amount_usd: Money;
  reference: string;
  payment_date: string;
  payer_bank_code: string;
  payer_account: string;
}
