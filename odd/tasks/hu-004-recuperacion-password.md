# HU-004 · Recuperación de contraseña

Permite recuperar la cuenta con un enlace de un solo uso enviado por correo. Reusa el adaptador de
correo y el limitador de HU-002, pero con **colección propia** de tokens: un enlace de verificación de
correo no puede cambiar la contraseña.

Fuente de requisitos: `docs/backlog.md` (HU-004), `docs/auth-api.md` (§Restablecer la contraseña),
`docs/error-handling.md`, y las skills `email-adapter`, `jwt-security` y `rate-limiting`.

## Specs

Texto entre comillas = criterio literal de `docs/backlog.md` (HU-004).

- **S1.** "Responde un mensaje genérico exista o no el correo ingresado."
  `POST /api/auth/forgot-password` con un correo de formato válido responde **siempre**
  `202 { accepted: true }`, exista la cuenta, no exista, o sea una cuenta de Google sin contraseña.
  Un formato inválido responde `400 INVALID_EMAIL` y **no** consume cupo del limitador.
- **S2.** "El enlace funciona una sola vez y expira en 60 minutos."
  El token se genera con 32 bytes aleatorios y vence a `PASSWORD_RESET_TTL_MINUTES` (default `60`)
  medido con el reloj inyectado. Un segundo intento con el mismo token responde igual que uno
  inválido.
- **S3.** "Al completar el cambio se invalidan todas las sesiones previas (sube `sessionVersion`)."
  `POST /api/auth/reset-password` con `{ token, password }` válidos responde `200 { reset: true }`,
  guarda el hash bcrypt nuevo, limpia `failedLoginAttempts` y `lockedUntil`, y **sube**
  `sessionVersion` en la misma operación: todo JWT emitido antes deja de servir (`401` en `/me`).
- **S4.** "Persiste solo `sha256(token)` del enlace de reset; el token en claro viaja únicamente en el
  correo." La colección `PasswordResetToken` guarda `tokenHash` (sha256 hex) y `expiresAt`; el token
  en claro no aparece en ninguna respuesta, en ningún log del canal SMTP ni en la base.
- **S5.** "El endpoint no distingue entre token vencido y token ya usado." Vencido, ya usado,
  inexistente o malformado responden **idéntico**: `400 INVALID_TOKEN` con el mensaje de
  `docs/auth-api.md:268-269`, sin `details`.
- **S6.** El consumo es **atómico y previo**: se marca `usedAt` con un `updateOne` condicionado a
  `usedAt: null` y vencimiento vigente **antes** de tocar la cuenta. Dos canjes simultáneos del mismo
  token no pueden dar dos `200`; el perdedor recibe el mismo `400`.
- **S7.** La contraseña se valida **antes** de tocar el token: un `WEAK_PASSWORD` no quema el enlace,
  que sigue sirviendo después del rechazo.
- **S8.** Pedir un enlace nuevo **quema el anterior**: sólo sirve el último enviado.
- **S9.** `forgot-password` tiene su **propia instancia** del limitador (separada de la del reenvío de
  verificación), 3 pedidos por hora por correo normalizado, contando también correos sin cuenta; el
  cuarto responde `429 TOO_MANY_REQUESTS` con `details.retryAfterSeconds`.
- **S10.** El correo de reset usa un **método nuevo** del puerto de correo
  (`sendPasswordResetEmail`), con copy propio y aviso de vencimiento y de un solo uso; sin
  `SMTP_HOST` el canal es `console` (excepción ya declarada en HU-002). Un envío caído no rompe la
  respuesta: siguen `202 { accepted: true }` con un `warn`.

## Contrato

- `POST /api/auth/forgot-password` — `{ email }`
  - `202` → `{ accepted: true }` (exista o no la cuenta, y también para cuentas sin contraseña)
  - `400` `INVALID_EMAIL` (no consume cupo) · `400` `INVALID_BODY`
  - `429` `TOO_MANY_REQUESTS` con `details.retryAfterSeconds`
- `POST /api/auth/reset-password` — `{ token, password }`
  - `200` → `{ reset: true }`
  - `400` `INVALID_TOKEN` · mensaje único para vencido/usado/inexistente/malformado
  - `400` `WEAK_PASSWORD` (la misma regla del alta; el enlace **sigue vigente**)
  - `400` `INVALID_BODY` si falta un campo o no es texto
- Enlace: `${APP_URL}/reset-password?token=<token>`, armado con `APP_URL`, nunca con `Host`.

## Decisions

- **D1.** Colección propia `PasswordResetToken` (`tokenHash` único, `userId`, `email`, `expiresAt`,
  `usedAt`, `createdAt`), como manda `docs/auth-api.md:255-257`: un token de verificación de correo
  no puede cambiar la contraseña. Índice en `tokenHash`; `tokenHash` y el documento se leen con
  proyección explícita (misma disciplina que HU-002/HU-003).
- **D2.** El `429` de `forgot-password` usa `TOO_MANY_REQUESTS` con mensaje propio
  (`docs/auth-api.md` no fija el texto; sí el código ya existente en `docs/error-handling.md`).
- **D3.** El consumo atómico es `updateOne({ tokenHash, usedAt: null, expiresAt: { $gt: now } },
  { $set: { usedAt: now } })` y sólo si `modifiedCount === 1` se cambia la contraseña. El orden es el
  de `docs/auth-api.md:259-264`: si la escritura de la contraseña falla, la cuenta queda intacta y el
  enlace quemado (fail closed).
- **D4.** La subida de `sessionVersion` va en la **misma** escritura que el hash nuevo y la limpieza
  del bloqueo (`$inc`), para que no exista una ventana con contraseña nueva y sesiones viejas vivas.
- **D5.** Reuso: `ResendThrottle` tal cual (instancia nueva), `hashVerificationToken` como hash
  compartido (`sha256` hex) y el mismo patrón de enlace de `RequestEmailVerification`.

## Tasks

- **T1** · Dominio y persistencia del token · S2, S4, S5, S6, S8
  `backend/src/modules/auth/domain/PasswordResetToken.ts` (generación, hash, vencimiento, regla
  "sirve o no sirve"), `backend/src/shared/models/PasswordResetToken.ts`, y en
  `MongooseUserRepository.ts` (o un adaptador propio del módulo) `savePasswordResetToken`
  (quema el anterior), `consumePasswordResetToken`, `resetPassword`.
- **T2** · Casos de uso · S1, S3, S7, S9, S10
  `backend/src/modules/auth/application/RequestPasswordReset.ts` y
  `backend/src/modules/auth/application/ResetPassword.ts`.
- **T3** · Adaptador de correo · S10
  `backend/src/modules/auth/application/EmailSenderPort.ts` (método nuevo),
  `backend/src/modules/auth/infrastructure/EmailSender.ts` (copy propio, ambos canales).
- **T4** · HTTP y configuración · contrato completo
  `backend/src/modules/auth/infrastructure/AuthController.ts`, `authRoutes.ts`, `index.ts`,
  `backend/src/config/env.ts` (`passwordResetTtlMinutes` con `readPositiveInt`), `server.ts`,
  `backend/env.sample`, `env.sample`, `docs/auth-api.md`, `docs/error-handling.md`.
- **T5** · Tests · S1-S10
  `backend/tests/passwordReset.test.ts` y `backend/tests/passwordResetToken.test.ts`, un caso por
  spec contra HTTP real con dobles (sin Mongo), más el arnés ampliado de forma **aditiva**.
  Los 94 tests existentes siguen verdes y `typecheck` limpio.

## Reglas de la casa que aplican

- **Hexagonal**: `domain/` sin Express, Mongoose, bcrypt ni nodemailer; el caso de uso recibe puertos,
  reloj y configuración.
- **El token en claro sólo viaja en el correo**; `console` es la excepción declarada.
- **Anti-oráculo en el pedido**: mismo `202` para todos los casos; el limitador corre antes de tocar
  la base y cuenta también correos sin cuenta.
- **Un solo error** para cualquier token que no sirva.
- **Ningún controlador firma tokens** y la contraseña se hashea en el adaptador (`bcrypt` costo 10).
- **Sin `any`**. TypeScript estricto. `node --test`.

## Corrections after independent verification

La verificación independiente encontró un **CRITICAL** y un **MAJOR*, los dos invisibles para los
dobles en memoria (el mismo escape que HU-002).

- **C1 (S3, CRITICAL).** El reset **borraba la contraseña**: `resetPassword` usa un update pipeline
  (`updateOne({email}, [{ $set: { passwordHash, … } }])`) y dentro de un pipeline un string que empieza
  con `$` se interpreta como **ruta de campo**. Todos los hashes bcrypt empiezan con `$2b$`, así que
  el campo quedaba vacío: `200 { reset: true }`, la contraseña nueva no servía y, al quedar
  `passwordHash` en null, la cuenta pasaba a parecer una cuenta de Google — `forgot-password` ya no
  le mandaba nada. **Cuenta irrecuperable.** El hash va como `{ $literal: passwordHash }` (o en un
  `$set` clásico, sin pipeline). Pin: test contra Mongo real que compara el hash guardado y valida la
  contraseña nueva con `bcrypt.compare`.
- **C2 (S8, MAJOR).** Guardar un enlace nuevo hace `deleteMany` + `create` en dos viajes: dos pedidos
  simultáneos dejan **dos enlaces vivos** (15/15 intentos). Tiene que ser **una sola escritura
  atómica**: índice único en `email` de `PasswordResetToken` y `findOneAndUpdate({ email }, …,
  { upsert: true })` que pise hash, vencimiento y `usedAt`.
- **C3.** Los dos defectos anteriores sólo se ven contra Mongo real, así que entra al repo
  `backend/tests/passwordResetRepository.mongo.test.ts`: se **saltea** sin `MONGO_URL`, se **niega** a
  correr contra una base que no empiece con `chk-`, y pinea S3/D4 (hash entero + `null→1→2`),
  S6 (un solo ganador), S8 (un solo enlace vivo, secuencial y concurrente) y S4/D1 (sólo el hash en la
  base, índice único).
- **C4 (MINOR/NIT).** `docs/auth-api.md:263` dice `updateMany` y el adaptador usa `findOneAndUpdate`:
  se corrige el documento. Y `resetPassword` deja de ignorar el resultado de la escritura: si no
  matcheó ninguna cuenta, responde el mismo `400 INVALID_TOKEN` en vez de un `200` mentiroso.

## Log

- **L1.** Pedido del humano, literal: *"damek con la HU-4"* (dale con la HU-004), sobre la propuesta
  previa de seguir con la recuperación de contraseña antes que el esqueleto React Native.
- **L2.** `docs/error-handling.md` no lista `INVALID_TOKEN`, `INVALID_EMAIL`, `INVALID_BODY` ni
  `WEAK_PASSWORD`, que el módulo ya usa desde HU-002/HU-003: se agregan a la tabla en esta HU.
- **L3.** El texto del `429` de `forgot-password` no está en el contrato; se define uno propio con
  `TOO_MANY_REQUESTS` (D2) en vez de reusar el mensaje del reenvío de verificación, porque el usuario
  pidió otra cosa.
