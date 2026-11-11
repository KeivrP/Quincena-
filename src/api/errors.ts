import type { Problem } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem;

  constructor(status: number, problem: Problem) {
    super(problem.detail || problem.title || `Error ${status}`);
    this.status = status;
    this.problem = problem;
  }

  /** Motivo máquina-legible (p. ej. extra.reason en los 401). Ramifica la UI sobre esto. */
  get reason(): string | undefined {
    return (this.problem.extra?.reason as string | undefined) ?? this.problem.code;
  }

  /** Errores por campo (422 de validación o de dominio): `extra.errors[].{loc,msg,type}`. */
  fieldError(field: string): { type: string; msg: string } | undefined {
    const errors = this.problem.extra?.errors;
    if (!Array.isArray(errors)) return undefined;
    const hit = errors.find(
      (e): e is { loc: unknown[]; type: string; msg: string } =>
        !!e && typeof e === 'object' && Array.isArray(e.loc) && e.loc[e.loc.length - 1] === field,
    );
    return hit ? { type: hit.type, msg: hit.msg } : undefined;
  }

  /** Errores de red, timeouts y 5xx: reintentables con la MISMA Idempotency-Key. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
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

const REASON_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  user_inactive: 'Tu usuario está inactivo. Comunícate con RRHH de tu empresa.',
  temporary_password_expired: 'Tu contraseña temporal venció. Usa "Olvidé mi contraseña" para crear una nueva.',
  session_revoked: 'Tu sesión se cerró por seguridad. Inicia sesión de nuevo.',
  login_locked: 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.',
  password_change_required: 'Antes de continuar tienes que cambiar tu contraseña temporal.',
  payout_change_limited: 'Cambiaste tus datos de cobro demasiadas veces hoy. Inténtalo mañana.',
  loan_request_limited: 'Hiciste muchas solicitudes seguidas. Espera un rato e inténtalo de nuevo.',
  loan_quote_limited: 'Hiciste muchas cotizaciones seguidas. Espera unos minutos.',
  payment_report_limited: 'Reportaste muchos pagos seguidos. Espera un rato e inténtalo de nuevo.',
  password_change_limited: 'Demasiados intentos de cambiar la contraseña. Espera unos minutos.',
};

export function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    const r = err.reason;
    if (r && REASON_MESSAGES[r]) return REASON_MESSAGES[r];
    return err.problem.detail || err.problem.title || 'Ocurrió un error inesperado.';
  }
  return 'Ocurrió un error inesperado.';
}
