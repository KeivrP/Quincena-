import { jwt, res } from './helpers';

jest.mock('../config', () => ({
  API_BASE_URL: 'https://api.test/v1',
  USE_MOCK: false,
  DEFAULT_TIMEOUT_MS: 20_000,
  DISBURSE_TIMEOUT_MS: 90_000,
  REFRESH_MARGIN_MS: 30_000,
}));

let api: typeof import('../endpoints');
let fetchMock: jest.Mock;

beforeEach(async () => {
  jest.resetModules();
  api = require('../endpoints');
  await require('../tokens').saveSession({ access_token: jwt(600), refresh_token: 'r', token_type: 'bearer' });
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

const last = () => {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return {
    path: (url as string).replace('https://api.test/v1', ''),
    method: (init as RequestInit).method,
    body: (init as RequestInit).body ? JSON.parse((init as RequestInit).body as string) : undefined,
    key: ((init as RequestInit).headers as Record<string, string>)['Idempotency-Key'],
  };
};

describe('rutas y cuerpos', () => {
  it.each<[string, () => Promise<unknown>, string, string, unknown]>([
    ['perfil', () => api.appApi.profile(), 'GET', '/app/profile', undefined],
    ['bancos', () => api.appApi.banks(), 'GET', '/app/banks', undefined],
    ['cotizar', () => api.appApi.quote('200.00'), 'POST', '/app/loans/quote', { principal_usd: '200.00' }],
    ['préstamos', () => api.appApi.loans(), 'GET', '/app/loans', undefined],
    ['detalle (id escapado)', () => api.appApi.loan('a/b'), 'GET', '/app/loans/a%2Fb', undefined],
    [
      'cuenta de pago',
      () => api.appApi.savePayoutAccount({ bank_code: '0102', phone: '04141234567', national_id: 'V1' }),
      'PUT',
      '/app/payout-account',
      { bank_code: '0102', phone: '04141234567', national_id: 'V1' },
    ],
    ['extra-créditos', () => api.appApi.extraCreditRequests(), 'GET', '/app/extra-credit-requests', undefined],
    [
      'extra-créditos filtrados',
      () => api.appApi.extraCreditRequests('pending'),
      'GET',
      '/app/extra-credit-requests?status=pending',
      undefined,
    ],
    [
      'login',
      () => api.authApi.login('a@b.com', 'x'),
      'POST',
      '/auth/login',
      { email: 'a@b.com', password: 'x' },
    ],
    [
      'confirmar reset',
      () => api.authApi.confirmPasswordReset('a@b.com', '123456', 'Nueva1234'),
      'POST',
      '/auth/password-reset/confirm',
      { email: 'a@b.com', code: '123456', new_password: 'Nueva1234' },
    ],
  ])('%s', async (_name, call, method, path, body) => {
    fetchMock.mockResolvedValue(res(200, {}));
    await call();
    expect(last()).toMatchObject({ method, path, body });
  });

  it('el extra-crédito no manda `note` vacía', async () => {
    fetchMock.mockResolvedValue(res(201, {}));
    await api.appApi.requestExtraCredit('900.00');
    expect(last().body).toEqual({ requested_amount_usd: '900.00' });
    await api.appApi.requestExtraCredit('900.00', 'Para la mudanza');
    expect(last().body).toEqual({ requested_amount_usd: '900.00', note: 'Para la mudanza' });
  });

  it('las operaciones con efecto mandan Idempotency-Key', async () => {
    fetchMock.mockResolvedValue(res(200, {}));
    await api.appApi.signCreditAgreement('abc');
    expect(last().key).toBeTruthy();
    await api.appApi.reportPayment('L1', {
      amount_usd: '10.00',
      reference: 'R1',
      payment_date: '2026-11-11',
      payer_bank_code: '0102',
      payer_account: '04141234567',
    });
    expect(last()).toMatchObject({ path: '/app/loans/L1/payments', key: expect.any(String) });
    await api.appApi.cancelExtraCredit('ec-1');
    expect(last()).toMatchObject({ path: '/app/extra-credit-requests/ec-1/cancel', key: expect.any(String) });
  });
});

describe('requestCredit: los 3 desenlaces', () => {
  it('200 → desembolsado', async () => {
    fetchMock.mockResolvedValue(res(200, { loan: { id: 'L1' }, receipt_download_url: 'u', receipt_pdf_sha256: 'h' }));
    await expect(api.appApi.requestCredit('100.00')).resolves.toEqual({
      status: 'disbursed',
      loan: { id: 'L1' },
      receipt_download_url: 'u',
    });
  });

  it('202 → en revisión, con el mensaje del servidor', async () => {
    fetchMock.mockResolvedValue(res(202, { code: 'disbursement_pending_review', detail: 'Lo revisa un admin.' }));
    await expect(api.appApi.requestCredit('100.13')).resolves.toEqual({
      status: 'in_review',
      message: 'Lo revisa un admin.',
    });
  });

  it('502 → lanza disbursement_failed', async () => {
    fetchMock.mockResolvedValue(res(502, { code: 'disbursement_failed', detail: 'El banco rechazó.' }));
    await expect(api.appApi.requestCredit('100.14')).rejects.toMatchObject({ reason: 'disbursement_failed' });
  });

  it('manda la confirmación de tasa cuando se pide', async () => {
    fetchMock.mockResolvedValue(res(200, { loan: {}, receipt_download_url: 'u' }));
    await api.appApi.requestCredit('100.00', {
      accepted_fx_rate_source_date: '2026-11-10',
      accepted_usd_to_bs_rate: '38.50',
    });
    expect(last().body).toEqual({
      principal_usd: '100.00',
      accepted_fx_rate_source_date: '2026-11-10',
      accepted_usd_to_bs_rate: '38.50',
    });
  });

  it('si se cae la red al pedir, reintentar NO duplica el crédito (misma key)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(api.appApi.requestCredit('100.00')).rejects.toMatchObject({ status: 0 });
    const first = last().key;
    fetchMock.mockResolvedValue(res(200, { loan: { id: 'L1' }, receipt_download_url: 'u' }));
    await api.appApi.requestCredit('100.00');
    expect(last().key).toBe(first);
    // y después de un éxito, un crédito nuevo lleva key nueva
    await api.appApi.requestCredit('100.00');
    expect(last().key).not.toBe(first);
  });
});
