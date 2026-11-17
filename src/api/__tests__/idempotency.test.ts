import { secureStore } from './helpers';

let withIdempotency: typeof import('../idempotency').withIdempotency;
let ApiError: typeof import('../errors').ApiError;

beforeEach(() => {
  jest.resetModules();
  ({ withIdempotency } = require('../idempotency'));
  ({ ApiError } = require('../errors'));
});

const keysUsed: string[] = [];
const capture = (result: unknown) => async (key: string) => {
  keysUsed.push(key);
  return result;
};
const failWith = (err: unknown) => async (key: string) => {
  keysUsed.push(key);
  throw err;
};

beforeEach(() => {
  keysUsed.length = 0;
});

it('un intento exitoso limpia la key: el siguiente es un intento nuevo', async () => {
  await withIdempotency('x', { a: 1 }, capture('ok'));
  expect(secureStore().has('xc.idem.x')).toBe(false);
  await withIdempotency('x', { a: 1 }, capture('ok'));
  expect(keysUsed[0]).not.toBe(keysUsed[1]);
});

it('tras un error de red, reintentar lo mismo reusa la MISMA key (no duplica)', async () => {
  await expect(withIdempotency('x', { a: 1 }, failWith(new ApiError(0, {})))).rejects.toBeInstanceOf(ApiError);
  expect(secureStore().has('xc.idem.x')).toBe(true);
  await withIdempotency('x', { a: 1 }, capture('ok'));
  expect(keysUsed[1]).toBe(keysUsed[0]);
});

it('tras un 5xx con cuerpo el intento terminó: clave nueva (guía §3.4)', async () => {
  await expect(withIdempotency('x', { a: 1 }, failWith(new ApiError(503, {})))).rejects.toThrow();
  await withIdempotency('x', { a: 1 }, capture('ok'));
  expect(keysUsed[1]).not.toBe(keysUsed[0]);
});

it('con in_progress se reusa la misma clave', async () => {
  const busy = new ApiError(409, { code: 'idempotency_conflict', extra: { reason: 'in_progress' } });
  await expect(withIdempotency('x', { a: 1 }, failWith(busy))).rejects.toThrow();
  await withIdempotency('x', { a: 1 }, capture('ok'));
  expect(keysUsed[1]).toBe(keysUsed[0]);
});

it('si cambian los datos, es otro intento y usa otra key', async () => {
  await expect(withIdempotency('x', { a: 1 }, failWith(new ApiError(0, {})))).rejects.toThrow();
  await withIdempotency('x', { a: 2 }, capture('ok'));
  expect(keysUsed[1]).not.toBe(keysUsed[0]);
});

it('un error definitivo (4xx) cierra el intento', async () => {
  await expect(withIdempotency('x', { a: 1 }, failWith(new ApiError(422, {})))).rejects.toThrow();
  expect(secureStore().has('xc.idem.x')).toBe(false);
  await withIdempotency('x', { a: 1 }, capture('ok'));
  expect(keysUsed[1]).not.toBe(keysUsed[0]);
});

it('un error que no es de la API también cierra el intento', async () => {
  await expect(withIdempotency('x', { a: 1 }, failWith(new Error('bug')))).rejects.toThrow('bug');
  expect(secureStore().has('xc.idem.x')).toBe(false);
});

it('cada intención tiene su propia key', async () => {
  await expect(withIdempotency('a', { v: 1 }, failWith(new ApiError(0, {})))).rejects.toThrow();
  await expect(withIdempotency('b', { v: 1 }, failWith(new ApiError(0, {})))).rejects.toThrow();
  expect(keysUsed[0]).not.toBe(keysUsed[1]);
});

it('la key es un UUID v4', async () => {
  await withIdempotency('x', {}, capture('ok'));
  expect(keysUsed[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
