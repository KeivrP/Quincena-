import { ApiError, messageFor, networkError } from '../errors';

describe('ApiError', () => {
  it('usa detail, luego title, luego el status como mensaje', () => {
    expect(new ApiError(422, { detail: 'd', title: 't' }).message).toBe('d');
    expect(new ApiError(422, { title: 't' }).message).toBe('t');
    expect(new ApiError(422, {}).message).toBe('Error 422');
  });

  it('reason prefiere extra.reason sobre code', () => {
    expect(new ApiError(401, { code: 'unauthorized', extra: { reason: 'session_revoked' } }).reason).toBe(
      'session_revoked',
    );
    expect(new ApiError(502, { code: 'disbursement_failed' }).reason).toBe('disbursement_failed');
    expect(new ApiError(400, {}).reason).toBeUndefined();
  });

  it.each([
    [0, true],
    [408, true],
    [429, false],
    [500, true],
    [502, true],
    [503, true],
    [400, false],
    [401, false],
    [404, false],
    [409, false],
    [422, false],
  ])('status %i → retryable %p', (status, retryable) => {
    expect(new ApiError(status, {}).retryable).toBe(retryable);
  });
});

describe('keepsIdempotencyKey (guía §3.4)', () => {
  it('solo sin respuesta o con in_progress se reusa la misma clave', () => {
    expect(new ApiError(0, {}).keepsIdempotencyKey).toBe(true);
    expect(
      new ApiError(409, { code: 'idempotency_conflict', extra: { reason: 'in_progress' } }).keepsIdempotencyKey,
    ).toBe(true);
    expect(
      new ApiError(409, { code: 'idempotency_conflict', extra: { reason: 'payload_mismatch' } }).keepsIdempotencyKey,
    ).toBe(false);
    expect(new ApiError(502, { code: 'disbursement_failed' }).keepsIdempotencyKey).toBe(false);
    expect(new ApiError(503, {}).keepsIdempotencyKey).toBe(false);
    expect(new ApiError(422, {}).keepsIdempotencyKey).toBe(false);
  });
});

describe('networkError', () => {
  it('distingue timeout de sin conexión, y ambos son reintentables', () => {
    const t = networkError(true);
    const n = networkError(false);
    expect(t.reason).toBe('timeout');
    expect(n.reason).toBe('network');
    expect(t.retryable && n.retryable).toBe(true);
    expect(t.message).toMatch(/sin riesgo de duplicar/);
  });
});

describe('messageFor', () => {
  it('traduce los reasons conocidos', () => {
    expect(messageFor(new ApiError(401, { extra: { reason: 'invalid_credentials' } }))).toBe(
      'Correo o contraseña incorrectos.',
    );
    expect(messageFor(new ApiError(401, { extra: { reason: 'session_revoked' } }))).toMatch(/sesión se cerró/);
  });
  it('si no conoce el reason, muestra el detail del servidor', () => {
    expect(messageFor(new ApiError(422, { code: 'otra_cosa', detail: 'Texto del servidor' }))).toBe(
      'Texto del servidor',
    );
  });
  it('un 429 dice cuánto esperar', () => {
    const e = new ApiError(429, {
      code: 'too_many_requests',
      extra: { reason: 'login_locked', retry_after_seconds: 600 },
    });
    expect(messageFor(e)).toBe('Demasiados intentos fallidos. Espera 10 minutos e inténtalo de nuevo.');
  });
  it('payout_account_recently_changed dice en cuántas horas', () => {
    const e = new ApiError(422, {
      code: 'business_rule_violation',
      extra: { reason: 'payout_account_recently_changed', retry_after_seconds: 7200 },
    });
    expect(messageFor(e)).toMatch(/en 2 horas/);
  });
  it('un 500 sin reason muestra el código de soporte', () => {
    expect(messageFor(new ApiError(500, { code: 'internal_error' }, 'req-9'))).toMatch(/req-9/);
  });
  it('reference_already_used no es un error de tecleo: remite a soporte', () => {
    expect(messageFor(new ApiError(409, { code: 'conflict', extra: { reason: 'reference_already_used' } }))).toMatch(
      /ya fue utilizada/,
    );
  });
  it('nunca muestra errores internos de JS', () => {
    expect(messageFor(new TypeError('x is undefined'))).toBe('Ocurrió un error inesperado.');
    expect(messageFor('boom')).toBe('Ocurrió un error inesperado.');
  });
});
