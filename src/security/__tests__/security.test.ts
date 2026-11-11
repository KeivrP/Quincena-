import { ApiError } from '../../api/errors';
import { LOCK_AFTER_MS, onResume, SIGN_OUT_AFTER_MS } from '../inactivity';

jest.mock('expo-device', () => ({ isRootedExperimentalAsync: jest.fn(async () => false) }));
jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: jest.fn(async () => 3),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

type DeviceMock = { isRootedExperimentalAsync: jest.Mock };
type LocalAuthMock = { getEnrolledLevelAsync: jest.Mock; authenticateAsync: jest.Mock };
// `jest.resetModules()` recrea los mocks: hay que volver a tomarlos después de cada reset.
let Device: DeviceMock;
let LocalAuth: LocalAuthMock;
const loadDevice = () => {
  Device = jest.requireMock('expo-device');
  LocalAuth = jest.requireMock('expo-local-authentication');
  return require('../device') as typeof import('../device');
};

describe('onResume (bloqueo por inactividad)', () => {
  const now = 1_000_000_000;

  it('con biometría/PIN: bloquea tras 1 minuto en segundo plano, no antes', () => {
    expect(onResume({ backgroundedAt: now - LOCK_AFTER_MS + 1, now, canLock: true })).toBe('none');
    expect(onResume({ backgroundedAt: now - LOCK_AFTER_MS, now, canLock: true })).toBe('lock');
  });

  it('con biometría/PIN: el arranque en frío con sesión guardada siempre bloquea', () => {
    expect(onResume({ backgroundedAt: null, now, canLock: true })).toBe('lock');
  });

  it('sin bloqueo en el equipo: cierra la sesión tras 5 minutos fuera', () => {
    expect(onResume({ backgroundedAt: now - SIGN_OUT_AFTER_MS + 1, now, canLock: false })).toBe('none');
    expect(onResume({ backgroundedAt: now - SIGN_OUT_AFTER_MS, now, canLock: false })).toBe('signOut');
  });

  it('sin bloqueo en el equipo: el arranque en frío no expulsa al usuario', () => {
    expect(onResume({ backgroundedAt: null, now, canLock: false })).toBe('none');
  });
});

describe('confirmSensitiveAction', () => {
  const g = globalThis as unknown as { __DEV__: boolean };
  const devBefore = g.__DEV__;
  let confirmSensitiveAction: typeof import('../device').confirmSensitiveAction;

  beforeEach(() => {
    jest.resetModules(); // la detección de root se cachea por proceso
    g.__DEV__ = false; // en desarrollo la detección de root está apagada a propósito
    ({ confirmSensitiveAction } = loadDevice());
    Device.isRootedExperimentalAsync.mockResolvedValue(false);
    LocalAuth.getEnrolledLevelAsync.mockResolvedValue(3);
    LocalAuth.authenticateAsync.mockResolvedValue({ success: true });
  });
  afterAll(() => {
    g.__DEV__ = devBefore;
  });

  it('pide la biometría con el motivo y deja pasar si el dueño confirma', async () => {
    await expect(confirmSensitiveAction('Confirma que quieres recibir $100,00')).resolves.toEqual({ ok: true });
    expect(LocalAuth.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ promptMessage: 'Confirma que quieres recibir $100,00', disableDeviceFallback: false }),
    );
  });

  it('bloquea si el dueño cancela o falla la biometría', async () => {
    LocalAuth.authenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' });
    const r = await confirmSensitiveAction('x');
    expect(r.ok).toBe(false);
  });

  it('bloquea en un equipo con root sin siquiera pedir la biometría', async () => {
    Device.isRootedExperimentalAsync.mockResolvedValue(true);
    const r = await confirmSensitiveAction('x');
    expect(r).toEqual({ ok: false, message: expect.stringMatching(/root o jailbreak/) });
    expect(LocalAuth.authenticateAsync).not.toHaveBeenCalled();
  });

  it('si el equipo no tiene biometría ni PIN, no bloquea (el servidor pide lo suyo)', async () => {
    LocalAuth.getEnrolledLevelAsync.mockResolvedValue(0);
    await expect(confirmSensitiveAction('x')).resolves.toEqual({ ok: true });
    expect(LocalAuth.authenticateAsync).not.toHaveBeenCalled();
  });

  it('un error de la detección de root no deja al usuario afuera', async () => {
    Device.isRootedExperimentalAsync.mockRejectedValue(new Error('no soportado'));
    await expect(confirmSensitiveAction('x')).resolves.toEqual({ ok: true });
  });

  it('en desarrollo no se aplica la detección de root (emuladores de QA)', async () => {
    g.__DEV__ = true;
    jest.resetModules();
    ({ confirmSensitiveAction } = loadDevice());
    Device.isRootedExperimentalAsync.mockResolvedValue(true);
    await expect(confirmSensitiveAction('x')).resolves.toEqual({ ok: true });
  });
});

describe('ApiError.fieldError', () => {
  it('encuentra el error del campo por la última parte de loc', () => {
    const e = new ApiError(422, {
      code: 'validation_error',
      extra: {
        errors: [
          { loc: ['body', 'phone'], msg: 'mal', type: 'value_error' },
          { loc: ['body', 'current_password'], msg: 'Confirma tu contraseña', type: 'current_password_required' },
        ],
      },
    });
    expect(e.fieldError('current_password')).toEqual({ type: 'current_password_required', msg: 'Confirma tu contraseña' });
    expect(e.fieldError('email')).toBeUndefined();
  });

  it('no revienta si el problem no trae errores', () => {
    expect(new ApiError(500, {}).fieldError('x')).toBeUndefined();
    expect(new ApiError(422, { extra: { errors: 'raro' } }).fieldError('x')).toBeUndefined();
  });
});

describe('plugin withSecureNetwork', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const plugin = require('../../../plugins/withSecureNetwork');
  const PINS = ['fk6IOKit1ild5647BH06ujSIq5XbCgqlbYl6ANhhi88=', 'C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M='];

  it('genera NSC sin tráfico en claro y con pin-set por dominio', () => {
    const xml: string = plugin.releaseXml({ domains: ['api.example.com'], pins: PINS, expiration: '2027-12-31' });
    expect(xml).toContain('<base-config cleartextTrafficPermitted="false">');
    expect(xml).toContain('<domain includeSubdomains="false">api.example.com</domain>');
    expect(xml).toContain('<pin-set expiration="2027-12-31">');
    for (const p of PINS) expect(xml).toContain(`<pin digest="SHA-256">${p}</pin>`);
    expect(xml).not.toContain('src="user"'); // release no confía en CAs instaladas por el usuario
  });

  it('exige un pin de respaldo y pines con formato SPKI SHA-256', () => {
    expect(() => plugin.validate({ domains: ['a.com'], pins: [PINS[0]] })).toThrow(/al menos 2/);
    expect(() => plugin.validate({ domains: ['a.com'], pins: [PINS[0], 'abc'] })).toThrow(/inválido/);
    expect(() => plugin.validate({ domains: [], pins: PINS })).toThrow(/domains/);
    expect(() => plugin.validate({ domains: ['a.com'], pins: PINS, expiration: '31/12/2027' })).toThrow(/AAAA-MM-DD/);
    expect(() => plugin.validate({ domains: ['a.com'], pins: PINS, expiration: '2027-12-31' })).not.toThrow();
  });
});
