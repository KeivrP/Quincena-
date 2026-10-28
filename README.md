# XtraCash (nombre provisional)

App móvil del **trabajador** para el crédito de nómina DisGlobal. React Native + Expo (SDK 58) + Expo Router, TypeScript.
Estilo y personajes 3D tomados del Figma *Pure Edu* (naranja `#FA7136`, Poppins), con un azul noche para el tono bancario.

## Arrancar

```bash
npm install
cp .env.example .env        # EXPO_PUBLIC_USE_MOCK=1 = datos simulados, sin credenciales
npx expo start              # escanea el QR con Expo Go, o pulsa "a" para Android
```

Modo demo: entra con `maria.perez@demo.com` / `Temporal123` (ya vienen escritos). Montos que terminan en `.14`
simulan rechazo del banco, en `.13` "en revisión", y una referencia que empiece con `SIMFAIL` un abono que no concilia,
igual que el banco simulado del backend.

Para usar el servidor real pon `EXPO_PUBLIC_USE_MOCK=0` (o bórralo) y deja `EXPO_PUBLIC_API_BASE_URL`.

APK de prueba: `npx eas-cli@latest build -p android --profile preview` (requiere cuenta Expo) o `npx expo run:android`.

## Flujo cubierto (§4 de la guía)

Bienvenida → Login → cambio de contraseña obligatorio → firma del contrato marco (hash SHA‑256 del PDF) → datos de cobro
(banco, móvil venezolano, cédula propia) → Inicio con cupo → Simular / Solicitar (3 desenlaces: desembolsado, rechazado,
en revisión) → Mis créditos con cronograma y comprobante → Reportar abono. También: "olvidé mi contraseña" con código de
6 dígitos y la pantalla "revisa tu correo" para cuentas nuevas.

## Reglas de la guía y dónde están

| Regla | Archivo |
|---|---|
| Tokens en Keychain/Keystore (`expo-secure-store`), `allowBackup: false` | `src/lib/storage.ts`, `src/api/tokens.ts`, `app.json` |
| Refresh *single-flight* con rotación de un solo uso; 401 irrecuperable → Login | `src/api/client.ts` |
| `Idempotency-Key` UUID v4 persistida por intento lógico (sobrevive a cerrar la app) | `src/api/idempotency.ts` |
| Errores `problem+json`, UI ramifica por `extra.reason` | `src/api/errors.ts` |
| Dinero como string decimal (`big.js`), nunca `number` | `src/lib/money.ts` |
| Timeout ≥ 60 s al solicitar crédito | `src/api/config.ts` |
| URLs prefirmadas: se piden de nuevo cada vez, GET sin `Authorization` | `onboarding/contract.tsx`, `credit/[id].tsx` |
| URL base por entorno (`EXPO_PUBLIC_API_BASE_URL`), no hardcodeada | `src/api/config.ts` |

## ⚠️ Pendiente antes de producción

- **Contrastar rutas y campos con `openapi.json`.** No tuve acceso a la API ni al OpenAPI al escribir esto: las rutas
  (`/auth/login`, `/app/credits/quote`, `/app/payments`…) y los nombres de campos siguen la guía, pero algunos son
  supuestos. Todo está concentrado en `src/api/endpoints.ts` y `src/api/types.ts`; se puede generar el esquema con
  `npx openapi-typescript https://developer.dis-global.com/creditos/openapi.json -o src/api/schema.d.ts`.
- Correr la matriz de QA de `app-movil.md` §14 contra el servidor de desarrollo.
- Los PDFs se abren en el navegador interno (`expo-web-browser`); si se quiere visor embebido y guardado privado,
  añadir `expo-file-system` + un visor PDF.
