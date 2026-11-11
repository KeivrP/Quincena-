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
    [429, true],
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
    expect(messageFor(new ApiError(422, { code: 'otra_cosa', detail: 'Texto del servidor' }))).toBe('Texto del servidor');
  });
  it('nunca muestra errores internos de JS', () => {
    expect(messageFor(new TypeError('x is undefined'))).toBe('Ocurrió un error inesperado.');
    expect(messageFor('boom')).toBe('Ocurrió un error inesperado.');
  });
});
