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
};

export function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    const r = err.reason;
    if (r && REASON_MESSAGES[r]) return REASON_MESSAGES[r];
    return err.problem.detail || err.problem.title || 'Ocurrió un error inesperado.';
  }
  return 'Ocurrió un error inesperado.';
}
