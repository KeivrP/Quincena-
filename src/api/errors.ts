import type { Problem } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem;
  /** `X-Request-Id` de la respuesta: se muestra en errores inesperados para soporte (guía §13). */
  readonly requestId?: string;

  constructor(status: number, problem: Problem, requestId?: string) {
    super(problem.detail || problem.title || `Error ${status}`);
    this.status = status;
    this.problem = problem;
    this.requestId = requestId;
  }

  /** Clase del error (`business_rule_violation`, `conflict`…). Se ramifica primero por aquí. */
  get code(): string | undefined {
    return this.problem.code;
  }

  /** Variante máquina-legible: `extra.reason`, o el `code` si no trae reason. */
  get reason(): string | undefined {
    return (this.problem.extra?.reason as string | undefined) ?? this.problem.code;
  }

  /** Lo que mande `extra` (montos, `retry_after_seconds`, `loan_id`…). */
  extra<T = unknown>(key: string): T | undefined {
    return this.problem.extra?.[key] as T | undefined;
  }

  /** Segundos de espera de un 429 (o de `payout_account_recently_changed`), si vienen. */
  get retryAfterSeconds(): number | undefined {
    const v = this.extra<number | string>('retry_after_seconds');
    const n = typeof v === 'string' ? Number(v) : v;
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
  }

  /** Errores por campo (422 de validación): `extra.errors[].{loc,msg,type}`. */
  fieldError(field: string): { type: string; msg: string } | undefined {
    const errors = this.problem.extra?.errors;
    if (!Array.isArray(errors)) return undefined;
    const hit = errors.find(
      (e): e is { loc: unknown[]; type: string; msg: string } =>
        !!e && typeof e === 'object' && Array.isArray(e.loc) && e.loc[e.loc.length - 1] === field,
    );
    return hit ? { type: hit.type, msg: hit.msg } : undefined;
  }

  /**
   * Fallas transitorias que el usuario puede reintentar a mano: sin red, timeout, 408 o 5xx. Un 429
   * NO: hay que esperar `retry_after_seconds` (guía §3.5).
   */
  get retryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status >= 500;
  }

  /**
   * Si el próximo intento debe reusar la MISMA Idempotency-Key (guía §3.4): solo cuando no hubo
   * respuesta (no sabemos si llegó) o el servidor dice que la original sigue en curso. Una
   * respuesta de error con cuerpo cierra el intento: el siguiente va con clave nueva.
   */
  get keepsIdempotencyKey(): boolean {
    return this.status === 0 || (this.code === 'idempotency_conflict' && this.reason === 'in_progress');
  }
}

export function networkError(timeout: boolean): ApiError {
  return new ApiError(0, {
    title: timeout ? 'La operación tardó demasiado' : 'Sin conexión',
    detail: timeout
      ? 'No recibimos respuesta a tiempo. Puedes reintentar sin riesgo de duplicar la operación.'
      : 'Revisa tu conexión a internet e inténtalo de nuevo.',
    code: timeout ? 'timeout' : 'network',
  });
}

/** "2 minutos", "1 hora", "unos segundos". */
export function formatWait(seconds: number | undefined): string {
  if (!seconds || seconds < 60) return seconds ? `${Math.ceil(seconds)} segundos` : 'unos minutos';
  if (seconds < 3600) {
    const m = Math.ceil(seconds / 60);
    return `${m} minuto${m === 1 ? '' : 's'}`;
  }
  const h = Math.ceil(seconds / 3600);
  return `${h} hora${h === 1 ? '' : 's'}`;
}

// Textos por `extra.reason` (o por `code` cuando no hay reason). Los que no están aquí muestran el
// `detail` del servidor, que ya viene redactado para el usuario (guía §3.3).
const REASON_MESSAGES: Record<string, string> = {
  // Sesión (§4.1, §4.7)
  invalid_credentials: 'Correo o contraseña incorrectos.',
  user_inactive: 'Tu cuenta está desactivada. Comunícate con RRHH de tu empresa.',
  temporary_password_expired:
    'Tu acceso temporal venció. Usa "Olvidé mi contraseña" o pide a RRHH que te reenvíe el acceso.',
  session_revoked: 'Tu sesión se cerró por seguridad. Inicia sesión de nuevo.',
  token_expired: 'Tu sesión se cerró por seguridad. Inicia sesión de nuevo.',
  invalid_token: 'Tu sesión se cerró por seguridad. Inicia sesión de nuevo.',
  mfa_required: 'Esta app es solo para trabajadores.',
  invalid_mfa_code: 'Esta app es solo para trabajadores.',
  not_employee: 'Esta app es solo para trabajadores.',
  password_change_required: 'Antes de continuar tienes que cambiar tu contraseña temporal.',
  invalid_or_expired_code: 'El código es incorrecto o ya venció. Pide uno nuevo.',
  // Topes de intentos (§3.5): se completan con el tiempo de espera
  login_locked: 'Demasiados intentos fallidos.',
  refresh_limited: 'Demasiadas solicitudes seguidas.',
  code_request_limited: 'Pediste muchos códigos seguidos.',
  password_reset_confirm_limited: 'Demasiados intentos con el código.',
  password_change_limited: 'Demasiados intentos de cambiar la contraseña.',
  loan_quote_limited: 'Hiciste muchas cotizaciones seguidas.',
  loan_request_limited: 'Hiciste muchas solicitudes seguidas.',
  payment_report_limited: 'Reportaste muchos abonos seguidos.',
  payout_change_limited: 'Cambiaste tus datos de cobro demasiadas veces hoy.',
  // Tasa de cambio (§7.2)
  bcv_unavailable: 'No se pudo obtener la tasa del día. Inténtalo más tarde.',
  fx_rate_too_old: 'No se pudo obtener la tasa del día. Inténtalo más tarde.',
  fx_rate_unavailable: 'No se pudo obtener la tasa del día. Inténtalo más tarde.',
  // Solicitar crédito (§7.5)
  tenant_inactive: 'Tu empresa no tiene créditos nuevos habilitados en este momento.',
  employee_credit_product_unassigned: 'Todavía no tienes un producto de crédito asignado. Contacta a RRHH.',
  employee_credit_product_inactive: 'Tu producto de crédito ya no está disponible. RRHH debe asignarte otro.',
  no_active_credit_product: 'Tu empresa todavía no tiene créditos configurados.',
  installments_not_allowed_for_product: 'Hay un problema con tu configuración de cuotas. Contacta a RRHH.',
  rate_cap_exceeded: 'Hay un problema con la configuración de tu crédito. Contacta a RRHH.',
  payroll_fund_insufficient: 'No se pudo procesar tu solicitud en este momento. Inténtalo más tarde.',
  disbursement_pending_review: 'Tienes un crédito en revisión. Espera a que se resuelva antes de pedir otro.',
  fx_rate_changed: 'La tasa cambió desde tu cotización. Vuelve a cotizar para ver los montos nuevos.',
  disbursement_failed:
    'No pudimos desembolsar tu crédito en este momento. Verifica tus datos de cobro o inténtalo más tarde.',
  // Abonos (§10.5)
  reference_already_used:
    'Esta referencia ya fue utilizada. Si no la registraste tú, contacta a soporte con la referencia.',
  receiving_account_not_configured: 'No podemos registrar abonos en este momento. Contacta a soporte de tu empresa.',
  bank_validator_misconfigured:
    'No se pudo validar el pago con el banco en este momento. Inténtalo en unos minutos: tu pago no se perdió.',
  bank_validator_bad_response:
    'No se pudo validar el pago con el banco en este momento. Inténtalo en unos minutos: tu pago no se perdió.',
  // Extra-crédito (§8)
  extra_credit_request_pending: 'Ya tienes una solicitud de extra-crédito pendiente.',
  // Red
  timeout: 'No recibimos respuesta a tiempo. Puedes reintentar sin riesgo de duplicar la operación.',
  network: 'Revisa tu conexión a internet e inténtalo de nuevo.',
};

export function messageFor(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Ocurrió un error inesperado.';
  const r = err.reason;
  if (err.status === 429) {
    const base = (r && REASON_MESSAGES[r]) || 'Demasiados intentos.';
    return `${base} Espera ${formatWait(err.retryAfterSeconds)} e inténtalo de nuevo.`;
  }
  if (r === 'payout_account_recently_changed') {
    return `Cambiaste tus datos de cobro hace poco. Por seguridad podrás solicitar en ${formatWait(
      err.retryAfterSeconds,
    )}.`;
  }
  if (r && REASON_MESSAGES[r]) return REASON_MESSAGES[r];
  if (err.status >= 500 && err.code !== 'disbursement_failed') {
    const id = err.requestId ? ` Código de soporte: ${err.requestId}.` : '';
    return `Algo salió mal de nuestro lado. Inténtalo de nuevo.${id}`;
  }
  return err.problem.detail || err.problem.title || 'Ocurrió un error inesperado.';
}

/** Mensaje de un campo de un `validation_error` (o undefined si el error no es de ese campo). */
export function fieldMessage(err: unknown, field: string, overrides: Record<string, string> = {}): string | undefined {
  if (!(err instanceof ApiError)) return undefined;
  const f = err.fieldError(field);
  if (!f) return undefined;
  return overrides[f.type] ?? f.msg;
}
