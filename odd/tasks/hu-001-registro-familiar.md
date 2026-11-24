# HU-001 · Registro de familiar con correo y contraseña

Crea la cuenta de un familiar. Es la primera HU del rewrite y la que levanta el esqueleto del
backend: hasta que exista, `backend/package.json` no existe y el `Dockerfile` no compila.

Fuente de requisitos: `docs/backlog.md` (HU-001), `docs/auth-api.md`, y las skills
`auth-hexagonal`, `ley-1581`, `rate-limiting` y `email-adapter`.

## Specs

- **S1.** Con correo y contraseña válidos crea la cuenta y responde **HTTP 201**.
- **S2.** Correo con formato inválido responde **HTTP 400**.
- **S3.** Correo ya existente responde **HTTP 400** indicando duplicidad.
- **S4.** Exige contraseña de al menos 8 caracteres; `"abc123"` (6) se rechaza con **HTTP 400**.
- **S5.** Exige aceptación de la política de tratamiento de datos: sin `acceptedTerms: true`
  responde **HTTP 400** y **no escribe nada** en la base.
- **S6.** Normaliza el correo a minúsculas y sin espacios antes de validar duplicidad y de guardar:
  `"Ana@X.com"` y `"ana@x.com"` son la misma cuenta, y el segundo registro responde 400.
- **S7.** Persiste **solo el hash bcrypt de la contraseña** (costo 10); el texto plano no se guarda
  ni aparece en la respuesta ni en los logs.
- **S8.** Registra la evidencia de consentimiento de la Ley 1581: `acceptedTermsAt` (fecha del
  servidor), `termsVersion` (de `TERMS_VERSION`) e `ipAddress` cuando el pedido la trae.
- **S9.** La respuesta **no** incluye `passwordHash` ni ningún campo de sesión.

## Contrato

`POST /api/auth/register` con `{ fullName, email, password, acceptedTerms }`.

- `201` → `{ user: { id, email, fullName, role } }`
- `400` → `{ error: { code, message, details } }`, con `code` en `INVALID_EMAIL`,
  `EMAIL_ALREADY_REGISTERED`, `WEAK_PASSWORD`, `TERMS_NOT_ACCEPTED`, `INVALID_BODY`.
- El formato exacto del sobre de error es el de `docs/error-handling.md`.

## Tasks

- **T1** · Esqueleto del backend en TypeScript estricto · S1
  `backend/package.json`, `backend/tsconfig.json`, `backend/src/app.ts`, `backend/src/server.ts`,
  `backend/src/config/env.ts`, `backend/src/config/database.ts`, `backend/src/shared/errors/AppError.ts`,
  `backend/src/shared/middlewares/errorHandler.ts`. Scripts: `build`, `start`, `typecheck`, `test`.
  Test runner: `node --test` (sin Jest ni Mocha).
- **T2** · Dominio de la cuenta y caso de uso de registro · S2, S4, S5, S6
  `backend/src/modules/auth/domain/User.ts` (reglas puras: forma del correo, `normalizeEmail`,
  regla de contraseña, evidencia de consentimiento) y
  `backend/src/modules/auth/application/RegisterCaregiver.ts`.
- **T3** · Persistencia e HTTP · S1, S3, S7, S8, S9
  `backend/src/modules/auth/infrastructure/MongooseUserRepository.ts`,
  `backend/src/modules/auth/infrastructure/AuthController.ts`,
  `backend/src/modules/auth/infrastructure/authRoutes.ts`, `backend/src/modules/auth/index.ts`,
  más el modelo `backend/src/shared/models/User.ts`.
- **T4** · Hasher inyectable y correo · S7 (el hasher) y el envío de verificación queda para HU-002
  `backend/src/modules/auth/infrastructure/BcryptPasswordHasher.ts`.
- **T5** · Verificación · S1-S9
  Suite en `backend/tests/authRegister.test.js` (o `.ts` compilado) que ejerce **cada** spec contra
  la interfaz pública, más `npm run typecheck` en verde. Un caso por spec, sin tocar Mongo real.

## Reglas de la casa que aplican

- **Hexagonal**: `domain/` no importa Express, Mongoose ni bcrypt. El caso de uso recibe el
  repositorio y el hasher por parámetro.
- **La fábrica del usuario es única** (`User.create`), como pide `profiles-hexagonal`.
- **El correo se normaliza en el dominio**, no en el controlador.
- **Un error de validación no escribe nada**: se valida todo antes de tocar el repositorio.
- **Sin `any`**. TypeScript estricto.
- **Los tests no tocan Mongo**: el repositorio se sustituye por un doble en memoria.

## Log

- **L1.** Pedido del humano, literal: *"vale procede"*, sobre la propuesta previa: *"el siguiente
  paso real es el esqueleto del backend en TypeScript: package.json con typecheck, test y build,
  tsconfig estricto, conexión a Mongo con Mongoose, y la primera HU en RED/GREEN sobre node:test"*.
- **L2.** Stack fijado por el anteproyecto (decisiones `L2`/`L3` de `docs/backlog.md`): TypeScript
  estricto, Mongoose sobre MongoDB 7, sin PIN, sin Prisma.
- **L3.** Alcance: HU-001 **sola**. El envío del correo de verificación es HU-002 y no entra acá,
  aunque el alta cree el usuario sin verificar.
- **L4.** Los códigos de error del registro son específicos (`INVALID_BODY`, `INVALID_EMAIL`,
  `WEAK_PASSWORD`, `TERMS_NOT_ACCEPTED`, `EMAIL_ALREADY_REGISTERED`), no el `VALIDATION_ERROR`
  genérico que mostraba el contrato. Se reconcilió `docs/auth-api.md` para que el documento diga lo
  que el código hace: un código por motivo, `VALIDATION_ERROR` queda genérico, y la respuesta de
  201 lleva solo `{ user: { id, email, fullName, role } }` — `verificationSent` llega con HU-002.
