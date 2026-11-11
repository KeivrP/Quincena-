/** JWT falso con el `exp` dado (segundos desde ahora). Solo el payload importa para la app. */
export function jwt(expInSeconds: number, tag = 'a'): string {
  const payload = globalThis
    .btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expInSeconds, tag }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `h.${payload}.s`;
}

/** Respuesta HTTP mínima (lo único que usa el cliente: status, ok, text()). */
export function res(status: number, body?: unknown): Response {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return { status, ok: status >= 200 && status < 300, text: async () => text } as unknown as Response;
}

/** El store en memoria del mock de expo-secure-store (ver jest.setup.js). */
export function secureStore(): Map<string, string> {
  return (jest.requireMock('expo-secure-store') as { __store: Map<string, string> }).__store;
}
