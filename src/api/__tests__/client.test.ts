import { jwt, res } from './helpers';

jest.mock('../config', () => ({
  API_BASE_URL: 'https://api.test/v1',
  USE_MOCK: false,
  DEFAULT_TIMEOUT_MS: 20_000,
  DISBURSE_TIMEOUT_MS: 90_000,
  REFRESH_MARGIN_MS: 30_000,
}));

type Client = typeof import('../client');
let client: Client;
let tokens: typeof import('../tokens');
let ApiError: typeof import('../errors').ApiError;
let fetchMock: jest.Mock;

beforeEach(() => {
  jest.resetModules();
  client = require('../client');
  tokens = require('../tokens');
  ({ ApiError } = require('../errors'));
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

const login = (expIn = 600, refresh = 'r1') =>
  tokens.saveSession({ access_token: jwt(expIn, refresh), refresh_token: refresh, token_type: 'bearer' });

// La promesa DEBE fallar: si resuelve, la prueba falla.
const noFail = (): never => {
  throw new Error('se esperaba un error');
};
const asApiError = (e: unknown) => e as InstanceType<typeof import('../errors').ApiError>;

const calls = () => fetchMock.mock.calls.map(([url, init]) => ({ url: url as string, init: init as RequestInit }));
const headersOf = (i: number) => calls()[i].init.headers as Record<string, string>;

describe('armado de la petición', () => {
  it('usa la URL base, Bearer, JSON e Idempotency-Key', async () => {
    await login();
    fetchMock.mockResolvedValue(res(200, { ok: true }));
    const out = await client.request('/app/loans/quote', {
      method: 'POST',
      body: { principal_usd: '10.00' },
      idempotencyKey: 'k-1',
    });
    expect(out).toEqual({ ok: true });
    const [{ url, init }] = calls();
    expect(url).toBe('https://api.test/v1/app/loans/quote');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"principal_usd":"10.00"}');
    expect(headersOf(0)).toMatchObject({
      Authorization: expect.stringMatching(/^Bearer h\./),
      'Content-Type': 'application/json',
      'Idempotency-Key': 'k-1',
      Accept: 'application/json, application/problem+json',
    });
  });

  it('GET sin cuerpo no manda Content-Type', async () => {
    await login();
    fetchMock.mockResolvedValue(res(200, []));
    await client.request('/app/loans');
    expect(calls()[0].init.method).toBe('GET');
    expect(headersOf(0)['Content-Type']).toBeUndefined();
    expect(calls()[0].init.body).toBeUndefined();
  });

  it('auth:false no exige sesión ni manda Authorization', async () => {
    fetchMock.mockResolvedValue(res(200, { access_token: 'x' }));
    await client.request('/auth/login', { method: 'POST', auth: false, body: {} });
    expect(headersOf(0).Authorization).toBeUndefined();
  });

  it('un 204 sin cuerpo devuelve undefined', async () => {
    await login();
    fetchMock.mockResolvedValue(res(204));
    await expect(client.request('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });
});

describe('errores', () => {
  it('convierte problem+json en ApiError con su reason', async () => {
    await login();
    fetchMock.mockResolvedValue(
      res(422, { title: 'Regla', status: 422, code: 'business_rule_violation', extra: { reason: 'within_credit_limit' } }),
    );
    const err = await client.request('/app/x').then(noFail, asApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.reason).toBe('within_credit_limit');
  });

  it('si el error no es JSON (p. ej. HTML de un proxy) arma un problem mínimo', async () => {
    await login();
    fetchMock.mockResolvedValue(res(502, '<html>Bad gateway</html>'));
    const err = await client.request('/app/x').then(noFail, asApiError);
    expect(err.problem).toEqual({ title: 'Error 502', status: 502 });
    expect(err.retryable).toBe(true);
  });

  it('sin red → ApiError status 0 reintentable', async () => {
    await login();
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const err = await client.request('/app/x').then(noFail, asApiError);
    expect(err.status).toBe(0);
    expect(err.reason).toBe('network');
    expect(err.retryable).toBe(true);
  });

  it('corta por timeout y lo informa como tal', async () => {
    await login();
    fetchMock.mockImplementation(
      (_url, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))),
        ),
    );
    const err = await client.request('/app/x', { timeoutMs: 20 }).then(noFail, asApiError);
    expect(err.reason).toBe('timeout');
  });
});

describe('sesión y refresh', () => {
  it('sin sesión guardada: avisa a la app y lanza session_revoked', async () => {
    const onExpired = jest.fn();
    client.onSessionExpired(onExpired);
    const err = await client.request('/app/profile').then(noFail, asApiError);
    expect(err.reason).toBe('session_revoked');
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refresca antes de llamar si al token le quedan < 30 s, y guarda el par nuevo', async () => {
    await login(10, 'r1');
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/auth/refresh')
        ? res(200, { access_token: jwt(900, 'r2'), refresh_token: 'r2', token_type: 'bearer' })
        : res(200, { ok: 1 }),
    );
    await client.request('/app/profile');
    expect(calls().map((c) => c.url)).toEqual(['https://api.test/v1/auth/refresh', 'https://api.test/v1/app/profile']);
    expect(JSON.parse(calls()[0].init.body as string)).toEqual({ refresh_token: 'r1' });
    expect((await tokens.loadSession())?.refreshToken).toBe('r2');
  });

  it('single-flight: varias llamadas a la vez disparan UN solo refresh', async () => {
    await login(10, 'r1');
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/auth/refresh')
        ? res(200, { access_token: jwt(900, 'r2'), refresh_token: 'r2', token_type: 'bearer' })
        : res(200, {}),
    );
    await Promise.all([client.request('/app/a'), client.request('/app/b'), client.request('/app/c')]);
    expect(calls().filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('401 con token vigente: refresca y reintenta UNA vez', async () => {
    await login(600, 'r1');
    let n = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/refresh'))
        return res(200, { access_token: jwt(900, 'r2'), refresh_token: 'r2', token_type: 'bearer' });
      return ++n === 1 ? res(401, { title: 'No autorizado' }) : res(200, { ok: true });
    });
    await expect(client.request('/app/profile')).resolves.toEqual({ ok: true });
    expect(calls().map((c) => c.url.replace('https://api.test/v1', ''))).toEqual([
      '/app/profile',
      '/auth/refresh',
      '/app/profile',
    ]);
    // el reintento va con el token nuevo
    expect(headersOf(2).Authorization).not.toBe(headersOf(0).Authorization);
  });

  it('401 también después del refresh: cierra la sesión', async () => {
    await login(600, 'r1');
    const onExpired = jest.fn();
    client.onSessionExpired(onExpired);
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/auth/refresh')
        ? res(200, { access_token: jwt(900, 'r2'), refresh_token: 'r2', token_type: 'bearer' })
        : res(401, {}),
    );
    const err = await client.request('/app/profile').then(noFail, asApiError);
    expect(err.reason).toBe('session_revoked');
    expect(onExpired).toHaveBeenCalled();
    expect(await tokens.loadSession()).toBeNull();
  });

  it('refresh rechazado (token revocado): cierra la sesión', async () => {
    await login(10, 'r1');
    fetchMock.mockResolvedValue(res(401, { extra: { reason: 'session_revoked' } }));
    const err = await client.request('/app/profile').then(noFail, asApiError);
    expect(err.reason).toBe('session_revoked');
    expect(await tokens.loadSession()).toBeNull();
  });

  it('refresh sin red: NO cierra la sesión (se puede reintentar)', async () => {
    await login(10, 'r1');
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const err = await client.request('/app/profile').then(noFail, asApiError);
    expect(err.reason).toBe('network');
    expect((await tokens.loadSession())?.refreshToken).toBe('r1');
  });

  it('desuscribirse deja de avisar', async () => {
    const onExpired = jest.fn();
    const off = client.onSessionExpired(onExpired);
    off();
    await client.request('/app/profile').catch(() => undefined);
    expect(onExpired).not.toHaveBeenCalled();
  });
});

describe('requestWithStatus', () => {
  it('expone el status 2xx para distinguir 200 de 202', async () => {
    await login();
    fetchMock.mockResolvedValue(res(202, { code: 'disbursement_pending_review', detail: 'En revisión' }));
    await expect(client.requestWithStatus('/app/loans', { method: 'POST', body: {} })).resolves.toEqual({
      status: 202,
      data: { code: 'disbursement_pending_review', detail: 'En revisión' },
    });
  });
});
