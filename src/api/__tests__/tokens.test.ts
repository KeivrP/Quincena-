import { jwt, secureStore } from './helpers';

type Tokens = typeof import('../tokens');
let tokens: Tokens;

beforeEach(() => {
  jest.resetModules(); // estado limpio: caché de sesión y store
  tokens = require('../tokens');
});

describe('sessionFromPair', () => {
  it('toma el vencimiento del JWT', () => {
    const s = tokens.sessionFromPair({ access_token: jwt(600), refresh_token: 'r', token_type: 'bearer' });
    expect(s.accessExpiresAt).toBeGreaterThan(Date.now() + 590_000);
    expect(s.accessExpiresAt).toBeLessThanOrEqual(Date.now() + 600_000);
    expect(s.refreshToken).toBe('r');
  });

  it('si el token no es un JWT legible, asume 15 minutos', () => {
    const s = tokens.sessionFromPair({ access_token: 'opaco', refresh_token: 'r', token_type: 'bearer' });
    expect(Math.abs(s.accessExpiresAt - (Date.now() + 15 * 60_000))).toBeLessThan(1000);
  });

  it('exige refresh_token (la app móvil nunca usa el modo cookie)', () => {
    expect(() => tokens.sessionFromPair({ access_token: jwt(600), refresh_token: null, token_type: 'bearer' })).toThrow(
      /refresh_token/,
    );
  });
});

describe('persistencia', () => {
  it('guarda, recarga desde el almacenamiento seguro y borra', async () => {
    await tokens.saveSession({ access_token: jwt(600), refresh_token: 'r1', token_type: 'bearer' });
    expect(secureStore().has('xc.session')).toBe(true);

    // Otra "apertura" de la app: sin caché en memoria, lee del store.
    const stored = secureStore().get('xc.session')!;
    jest.resetModules();
    const fresh: Tokens = require('../tokens');
    secureStore().set('xc.session', stored); // el Keychain sobrevive al reinicio
    expect((await fresh.loadSession())?.refreshToken).toBe('r1');
    tokens = fresh;

    await tokens.clearSession();
    expect(await tokens.loadSession()).toBeNull();
    expect(secureStore().has('xc.session')).toBe(false);
  });

  it('sin sesión guardada devuelve null', async () => {
    expect(await tokens.loadSession()).toBeNull();
  });
});
