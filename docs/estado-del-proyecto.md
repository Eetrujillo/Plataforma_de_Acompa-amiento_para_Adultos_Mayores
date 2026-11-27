# Estado del proyecto — Plataforma de Acompañamiento para Adultos Mayores

> Documento de estado técnico. Fecha de corte: rama `prod`, commit `62ac691` (*merge: bring HU-001
> to HU-009 into main*). Describe **qué está construido, con qué, cómo se verificó y qué falta**.
> No es el anteproyecto ni el backlog: el backlog vive en `docs/backlog.md` y es la fuente de las 30 HU.

---

## 1. Resumen ejecutivo

**Lo que hay:** un backend completo y funcional para todo el Sprint 1 de cuentas y vinculación
(HU-001 a HU-009), escrito en TypeScript estricto sobre Express 4 + MongoDB/Mongoose, con
arquitectura Vertical Slicing sobre Hexagonal, 27 archivos de prueba y 246 casos automatizados.

**Lo que no hay:** ninguna aplicación cliente. Ni React Native, ni Expo, ni un APK. Tampoco
Socket.IO, Firebase Cloud Messaging, `react-native-maps` ni el panel web del cuidador. El contenedor
`frontend/` fue retirado y la carpeta quedó vacía (sólo `node_modules` residual).

**Cifras del rewrite** (desde la reducción del repo en `b3a6b0a` hasta `62ac691`):

| Métrica | Valor |
| --- | --- |
| Commits desde la reducción | 51 |
| Archivos TypeScript en `backend/src/` | 64 |
| Líneas en `backend/src/` | 5.721 |
| Archivos de prueba en `backend/tests/` | 27 (24 suites + 3 helpers) |
| Líneas en `backend/tests/` | 8.115 |
| Casos de prueba | 246 |
| Resultado de la suite (`npm test`) | **216 pasan, 0 fallan, 30 saltados** |
| Documentos de feature en `odd/tasks/` | 8 |
| Contratos HTTP en `docs/` | 8 |

Los 30 casos saltados no son fallos: son las pruebas de pin contra MongoDB real, que sólo corren
cuando `MONGO_URL` está definida y la base se llama con prefijo `chk-`.

**Cómo se construyó:** no se heredó código del intento anterior. El commit `b3a6b0a` borró 229
archivos y 27.317 líneas; lo que vino después es una reconstrucción guiada por especificación
(Organic Driven Development), con un documento de feature por HU, commits de unidad de trabajo
revisables y revisión nativa de cada unidad antes de integrarla.

---

## 2. Punto de partida: la reducción del repositorio

`b3a6b0a` — *chore: reduce the repository to deployment and database configuration*:

- **229 archivos modificados, 0 agregados, 27.317 líneas eliminadas.**
- **Se borró:** todo `backend/src/` (módulos `auth`, `activities`, `pairing`, `seniors`,
  `sos_emergency`), sus pruebas, el proyecto `frontend/` (Vite + React SPA), `design/`, los
  documentos y las skills.
- **Sobrevivió:** `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile` + `nginx.conf`,
  `.github/workflows/prod.yml`, plantillas de entorno y `backend/prisma/schema.prisma` (referencia de
  datos, ya eliminado por ser inaplicable con Mongoose).

Ese código viejo sigue consultable en `git show 25672da:backend/src/...`, pero **el rewrite no hereda
su estructura**: es una arquitectura distinta desde el primer archivo.

### Correcciones al `AGENTS.md` vigente

El `AGENTS.md` describe el estado en `b3a6b0a` y ya quedó desactualizado en tres puntos:

| Dice | Realidad |
| --- | --- |
| "No existe `backend/package.json` ni `backend/src/`; la aplicación no compila" | Existen 64 archivos en `src/` y la aplicación compila (`npm run build`) |
| "`backend/prisma/schema.prisma` sobrevive como referencia de datos" | Fue eliminado; el modelo es Mongoose (Prisma v7 no tiene conector MongoDB) |
| "El contenedor `frontend/` está pendiente de retiro" | El servicio ya salió de `docker-compose.yml` y la carpeta está vacía |

---

## 3. Stack real, con versiones

Todo declarado en `backend/package.json`, `backend/tsconfig.json` y `docker-compose.yml`.

### Lenguaje y runtime

| Elemento | Valor | Dónde |
| --- | --- | --- |
| Lenguaje | TypeScript **estricto**, ESM (`"type": "module"`) | `backend/package.json:5` |
| Config | `target/lib ES2023`, `module NodeNext`, `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `noUnusedLocals`, `noUnusedParameters` | `backend/tsconfig.json` |
| Node | `engines.node >= 22.18.0` (piso real: sin él `node --test` no corre TS nativo) | `backend/package.json:7-9` |
| Node en imagen | `node:22-alpine` | `backend/Dockerfile:1` |

`any` está prohibido por convención y por `strict`; no hay `eslint` ni `prettier` configurados
(deuda reconocida, ver §13).

### Dependencias de ejecución

| Paquete | Versión | Para qué |
| --- | --- | --- |
| `express` | `^4.22.1` | HTTP, router por módulo |
| `mongoose` | `^8.0.0` | ODM de MongoDB, esquemas e índices |
| `jsonwebtoken` | `^9.0.3` | Sesión del cuidador (**sólo HS256**) |
| `bcryptjs` | `^3.0.2` | Hash de contraseñas |
| `nodemailer` | `^10.6.1` | Envío SMTP (canal `console` si no hay host) |
| `qrcode` | `^1.5.4` | PNG del QR de vinculación (data URL) |
| `overrides.qs` | `^6.16.2` | Parche de DoS por denegación de servicio en `qs` |

### Dependencias de desarrollo

`typescript ^5.9.0`, `@types/node ^26.0.0`, `@types/express ^4.17.25`,
`@types/jsonwebtoken ^9.0.10`, `@types/qrcode ^1.5.6`. **Sin framework de test**: se usa el Node Test
Runner nativo.

### Scripts

| Script | Comando |
| --- | --- |
| `npm run build` | `tsc -p tsconfig.build.json` → `dist/` |
| `npm start` | `node --env-file-if-exists=.env dist/server.js` |
| `npm run typecheck` | `tsc -p tsconfig.json --noEmit` |
| `npm test` | `node --test tests/*.test.ts` |

### Datos e infraestructura

| Elemento | Valor |
| --- | --- |
| Motor | MongoDB **7** (`mongo:7`), single-node **replica set `rs0`** |
| Base de trabajo | `mearn_db` |
| Puerto mongo (host) | `127.0.0.1:4301` → `27017` (sólo loopback) |
| Volumen | `mongo_data` |
| Healthcheck | `mongosh` ping sobre el contenedor mongo |
| Init del replica set | Contenedor de un solo uso `mearn-mongo-rs-init`, idempotente (`rs.initiate`/`reconfig` al hostname `mongo:27017`) |
| Backend en compose | `mearn-backend`, `MONGO_URL=mongodb://mongo:27017/mearn_db?replicaSet=rs0`, `BACKEND_INTERNAL_PORT=3500`, host `127.0.0.1:${BACKEND_PORT:-3500}` |
| Dependencias de arranque | `depends_on`: mongo *healthy* + rs-init *completed* |
| Imagen backend | Multi-stage manual: `npm ci` → `tsc build` → `npm prune --omit=dev`, `EXPOSE 3500` |
| Sin bind mount | El contenedor corre la imagen compilada, no el código fuente |

### Despliegue

`.github/workflows/prod.yml`: **push a `prod`** (o `workflow_dispatch`) → `appleboy/ssh-action` al
VPS → `set -e` → `cd $WORK_DIR` → `git fetch && git checkout $PROD_BRANCH && git pull --ff-only` →
`docker compose up -d --build --remove-orphans`.

Dos decisiones que vale registrar: el `set -e` está porque sin él el step reportaba éxito aunque
`git fetch` hubiera fallado; y `--remove-orphans` está porque un servicio retirado del compose (el
contenedor web) seguía corriendo después del deploy.

**No hay gates de CI**: el workflow no corre `npm test` ni `npm run typecheck`. Esas verificaciones
son locales y manuales.

### Desviaciones respecto del stack del anteproyecto

| Anteproyecto | Realidad del repo | Motivo |
| --- | --- | --- |
| Prisma ORM | **Mongoose 8** | Prisma v7 no tiene conector para MongoDB |
| Panel web (SPA) en `3201` | Sin aplicación web | La entrega son dos APK |
| Socket.IO 4, FCM, `react-native-maps` | **Nada de eso** | No hay cliente que los consuma todavía |

---

## 4. Arquitectura

**Vertical Slicing sobre Hexagonal (puertos y adaptadores).** Tres módulos verticales y un núcleo
compartido. La regla de dependencia es estricta: `domain` no importa nada de infraestructura,
`application` depende de puertos, y los adaptadores se instancian **sólo** en el composition root.

```
backend/src/
├── app.ts                  # fábrica de Express: json 100kb, trust proxy, monta routers, 404, errorHandler
├── server.ts               # composition root: env → mongo → adaptadores → app → listen → shutdown
├── config/
│   ├── env.ts              # loadEnv + defaults + parseo estricto de cada variable
│   ├── database.ts         # mongoose.connect / disconnect
│   └── redactMongoUrl.ts   # limpia credenciales de los mensajes de error
├── shared/
│   ├── errors/AppError.ts          # statusCode + code + details
│   ├── middlewares/authMiddleware.ts  # guard de sesión (Bearer → verify + sessionVersion)
│   ├── middlewares/requireRole.ts     # 403 sin nombrar el rol requerido
│   ├── middlewares/errorHandler.ts    # body-parser 400/413, enmascara no operacionales a 500
│   ├── models/                     # User, SeniorLink, PairingToken, PasswordResetToken
│   └── domain/                     # text.ts (normalización), evidenceIp.ts (IP de la evidencia)
└── modules/
    ├── auth/        (21 archivos)  domain 5 · application 9 · infrastructure 6 · index 1
    ├── seniors/     (13 archivos)  domain 2 · application 7 · infrastructure 3 · index 1
    └── pairing/     (16 archivos)  domain 1 · application 8 · infrastructure 6 · index 1
```

### Slice `auth` — HU-001 a HU-004

| Capa | Piezas |
| --- | --- |
| `domain` | `User`, `EmailVerificationToken`, `PasswordResetToken`, `loginLockout`, `sessionClaims` |
| `application` | `RegisterCaregiver`, `RequestEmailVerification`, `ConfirmEmail`, `Login`, `RequestPasswordReset`, `ResetPassword`, `ResendThrottle`, `LoginIpThrottle`, puerto `EmailSenderPort` |
| `infrastructure` | `BcryptPasswordHasher`, `EmailSender`, `JwtTokenService`, `MongooseUserRepository`, `AuthController`, `authRoutes` |
| `index.ts` | Exporta puertos y `buildAuthRouter` / `buildSessionGuard` / `buildSessionTokenPort`; **falla cerrado sin `JWT_SECRET` en producción** |

### Slice `seniors` — HU-005 + HU-007

| Capa | Piezas |
| --- | --- |
| `domain` | `seniorProfile` (fábrica única `createSenior`, validación, `toPublicSenior` / `toSeniorMedicalRecord`), `seniorLink` (`OWNER`/`FAMILY`, `ACTIVE`/`REVOKED`, `isObjectIdHex`) |
| `application` | `CreateSeniorProfile`, `ListSeniorProfiles`, `GetSeniorProfile`, `GetSeniorMedicalRecord`, `ListSeniorCaregivers`, `loadAccessibleSenior`, puerto `SeniorRepositoryPort` |
| `infrastructure` | `MongooseSeniorRepository`, `SeniorController`, `seniorRoutes` |

La propiedad del perfil **no** se guarda en el perfil: se resuelve por la colección de vínculos
`seniorlinks`. Por eso el `404` es uniforme (un perfil ajeno no existe para la consulta, nunca un
`403` que confirme el id).

### Slice `pairing` — HU-008 + HU-009

| Capa | Piezas |
| --- | --- |
| `domain` | `pairingToken`: token base64url de 32 bytes, `sha256` en base, payload `{type:"senior-pairing", token}`, TTL por config |
| `application` | `GeneratePairingQr`, `RedeemPairingToken`, `pairingMessages` (textos exactos que ve el usuario), puertos `PairingQrEncoderPort`, `PairingTokenRepositoryPort`, `SeniorProfileReaderPort`, `RedeemSeniorWriterPort` |
| `infrastructure` | `MongoosePairingTokenRepository`, `MongoosePairingSeniorReader` (envoltorio del repositorio de seniors), `MongoosePairingSeniorWriter`, `QrGenerator`, `PairingController`, `pairingRoutes` |

El orden de la emisión está en el caso de uso, no en el controlador: **validar perfil → generar token
→ codificar QR → invalidar anteriores → reiniciar la racha del canje → persistir el hash**. Los pasos
que tocan la base van después de los que pueden fallar, así un `503` del codificador deja el QR
anterior vigente y el pedido se puede reintentar.

---

## 5. API implementada

Raíz `/api`. Envoltura de error uniforme definida en `docs/error-handling.md`.

### `/api/auth` — HU-001 a HU-004

| Método | Ruta | Guard | Caso de uso |
| --- | --- | --- | --- |
| POST | `/register` | público | `RegisterCaregiver` |
| POST | `/verify-email` | público | `ConfirmEmail` |
| POST | `/resend-verification` | público + throttle | `RequestEmailVerification` |
| POST | `/login` | público + bloqueo + throttle IP | `Login` |
| POST | `/forgot-password` | público + throttle | `RequestPasswordReset` |
| POST | `/reset-password` | público | `ResetPassword` |
| GET | `/me` | sesión | proyección del dueño del token |

### `/api/seniors` — HU-005 y HU-007

Todas las rutas llevan **dos guards en orden**: `requireSession` y después
`requireRole('CAREGIVER')`. Sin token → `401`; con otro rol → `403`.

| Método | Ruta | Devuelve |
| --- | --- | --- |
| POST | `/` | alta del perfil (`createSenior`), vínculo `OWNER` con el cuidador de la sesión |
| GET | `/` | perfiles accesibles por la sesión |
| GET | `/:id` | detalle público (sin datos médicos) |
| GET | `/:id/medical` | ficha médica en ruta propia |
| GET | `/:id/caregivers` | familiares vinculados al perfil |

Separar la ficha médica en su propia ruta es lo que hace **observable** que el detalle público la
excluye: misma regla, verificable con dos requests.

### `/api/pairing` — HU-008 y HU-009

| Método | Ruta | Guard | Nota |
| --- | --- | --- | --- |
| POST | `/qr` | sesión + `CAREGIVER` | Emite el QR; **nunca devuelve el token en claro** |
| POST | `/redeem` | **público** | El teléfono del adulto mayor no tiene sesión: el token del QR es la credencial |

`POST /api/pairing/redeem` firma una sesión con el `SessionTokenPort` de `auth`, pero sólo después de
canjear el token, registrar el consentimiento del titular y escribir el vínculo. Un canje repetido
dentro de `REDEEM_RECOVERY_MINUTES` recupera la respuesta perdida **sin** escribir un vínculo ni una
evidencia nuevos.

---

## 6. Modelo de datos (Mongoose)

Cuatro colecciones. Todos los tokens se guardan **hasheados**; el valor en claro viaja sólo en el
correo o dentro del QR.

### `users` — `shared/models/User.ts`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `email` | string | **required, unique** |
| `passwordHash` | string | bcrypt |
| `fullName`, `phone` | string | |
| `role` | enum | `CAREGIVER` \| `SENIOR` |
| `emailVerifiedAt` | Date | |
| `verificationTokenHash` / `verificationTokenExpiresAt` | string / Date | `select: false`, índice propio |
| `failedLoginAttempts`, `lockedUntil` | number / Date | bloqueo de login persistido |
| `sessionVersion` | number | cierre de sesión por versión (`sv` del JWT) |
| `redeemFailedAttempts`, `redeemLockedUntil` | number / Date | bloqueo del canje, sobre el documento del adulto mayor |
| `timezone` | string | default `America/Bogota` |
| `linkStatus` | enum | `PENDING` \| `LINKED` |
| `bloodType`, `allergies[]`, `conditions[]`, `medications[]`, `emergencyContact` | mixto | ficha médica |
| `acceptedTermsAt`, `termsVersion`, `ipAddress` | Date/string/string | **evidencia de la Ley 1581** |

### `seniorlinks` — `shared/models/SeniorLink.ts`

`seniorId`, `caregiverId`, `role` (`OWNER`/`FAMILY`), `status` (`ACTIVE`/`REVOKED`), `invitedBy`,
`createdAt`. **Índices únicos compuestos:** `(seniorId, caregiverId)` y `(caregiverId, status)`.

La colección de vínculos es la que resuelve propiedad y permisos: el perfil no lleva `caregiverId`.
Es lo que permite varios familiares con permisos equivalentes (HU-005) sin tocar el perfil.

### `pairing_tokens` — `shared/models/PairingToken.ts`

`seniorId`, `caregiverId`, `tokenHash` (**único**, sha256), `expiresAt`, `usedAt`, `invalidatedAt`,
timestamps. Índice `(seniorId, usedAt, invalidatedAt)` para el *hot path* de invalidación al emitir.

### `password_reset_tokens` — `shared/models/PasswordResetToken.ts`

`tokenHash` (**único**), `userId`, `email` (**único**: un solo enlace vivo por correo), `expiresAt`,
`usedAt`. El índice único sobre `email` permite un *upsert* atómico: pedir un segundo reset no puede
dejar dos enlaces válidos en carrera.

**No hay índices TTL** en ninguna colección: las expiraciones se evalúan en la consulta, no por
limpieza del servidor (deuda en §13).

---

## 7. Seguridad y cumplimiento

| Control | Implementación |
| --- | --- |
| Contraseñas | bcrypt (`BcryptPasswordHasher`); nunca se registran ni se devuelven |
| Sesión | JWT **sólo HS256**, claims `sub`, `role`, `email`, `sv`; `JWT_EXPIRES_IN` con regex `^\d+[smhd]$` |
| Cierre por versión | `sv` del token contra `sessionVersion` del usuario; cambiarla invalida todas las sesiones |
| `JWT_SECRET` ausente en producción | Falla cerrado al construir el slice; el backend no arranca |
| Un solo error de credenciales | Login incorrecto no distingue correo inexistente de contraseña mala |
| Bloqueo de cuenta | `LOCKOUT_MAX_ATTEMPTS` (5) / `LOCKOUT_MINUTES` (15), persistido en el documento |
| Bloqueo de canje | `REDEEM_MAX_ATTEMPTS` (5) / `REDEEM_LOCKOUT_MINUTES` (15), persistido; emitir un QR nuevo lo reinicia |
| Rate limiting | Ventana móvil en memoria con reloj inyectable: `ResendThrottle` (reenvío), `LoginIpThrottle` (login por IP), `ResendThrottle` propio (forgot), `LoginIpThrottle` reutilizado (canje por IP) |
| Trust proxy | `TRUST_PROXY_HOPS` estricto, default `0` (fail closed); con `NODE_ENV=production` y 0, el arranque imprime advertencia porque todos los clientes compartirían un solo bucket |
| Tokens | 32 bytes aleatorios, sha256 en base, un solo uso, TTL por config |
| Ficha médica | Ruta propia, guard de sesión + rol; el detalle público la excluye por proyección |
| Perfil ajeno | `404`, nunca `403` (un `403` confirma que el id existe) |
| QR | `{type:"senior-pairing", token}`; sin PIN; `503` si el codificador devuelve algo que no es imagen |
| Errores | `AppError` con `code` estable; los no operacionales se enmascaran a `500 INTERNAL_ERROR` |
| Logs | Redacción de credenciales en los mensajes de arranque y de Mongo (`redactMongoUrl`, `redactConnectionStrings`) |
| Ley 1581 | Consentimiento obligatorio con evidencia en el servidor: `acceptedTermsAt`, `termsVersion`, `ipAddress`. En el registro **y** en el canje del QR |

### Catálogo de códigos de error efectivamente emitidos

`INVALID_BODY`, `INVALID_JSON`, `INVALID_EMAIL`, `INVALID_TOKEN`, `VALIDATION_ERROR`,
`WEAK_PASSWORD`, `INVALID_NAME`, `INVALID_TIMEZONE`, `INVALID_BLOOD_TYPE`, `INVALID_ALLERGIES`,
`INVALID_CONDITIONS`, `INVALID_MEDICATIONS`, `INVALID_EMERGENCY_CONTACT`, `SENIOR_ID_REQUIRED`,
`TERMS_NOT_ACCEPTED`, `UNAUTHORIZED`, `FORBIDDEN`, `EMAIL_NOT_VERIFIED`, `NOT_FOUND`,
`SENIOR_NOT_FOUND`, `CONFLICT`, `SENIOR_ALREADY_LINKED`, `PAYLOAD_TOO_LARGE`, `TOO_MANY_REQUESTS`,
`ACCOUNT_LOCKED`, `PAIRING_QR_UNAVAILABLE`, `INTERNAL_ERROR`.

---

## 8. Configuración

`backend/src/config/env.ts` es el único lugar que lee el entorno, con parseo estricto y *fallback*
declarado por variable. La plantilla comentada es `env.sample`.

### Aplicación y datos

`NODE_ENV`, `PORT` (3500), `MONGO_URL`, `APP_URL`, `TERMS_VERSION` (1.0), `TRUST_PROXY_HOPS` (0-10,
malformado → 0).

### Sesión

`JWT_SECRET` (**obligatorio en producción**), `JWT_EXPIRES_IN` (7d), `EMAIL_VERIFICATION_TTL_HOURS`
(24), `PASSWORD_RESET_TTL_MINUTES` (60), `PAIRING_TTL_MINUTES` (1440 = 24 h).

### Límites

`RESEND_THROTTLE_MAX` (3) / `_WINDOW_MINUTES` (60) · `FORGOT_THROTTLE_MAX` (3) / `_WINDOW_MINUTES`
(60) · `LOCKOUT_MAX_ATTEMPTS` (5) / `LOCKOUT_MINUTES` (15) · `LOGIN_IP_MAX_ATTEMPTS` (20) /
`_WINDOW_MINUTES` (15) · `REDEEM_MAX_ATTEMPTS` (5) / `REDEEM_LOCKOUT_MINUTES` (15) /
`REDEEM_IP_MAX_ATTEMPTS` (20) / `REDEEM_IP_WINDOW_MINUTES` (15) / `REDEEM_RECOVERY_MINUTES` (15).

### Correo

`SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE` (false), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
Sin `SMTP_HOST` el adaptador cae al canal `console`: el enlace se imprime en el log del backend y
**no llega a nadie**. Es el modo correcto en desarrollo y el modo silenciosamente roto en producción
si se olvida configurarlo.

### Sólo en compose

`DATABASE_URL`, `BACKEND_PORT`, `BACKEND_INTERNAL_PORT`. `MONGO_URL` está fijada a propósito en el
compose: un valor viejo de otro proyecto no debe poder pisarla.

---

## 9. Pruebas

**Runner:** Node Test Runner nativo (`node --test tests/*.test.ts`). Sin Jest, sin Vitest, sin
frameworks de mocking. `npm test` corre **sin** MongoDB.

| Grupo | Archivos | Qué cubre |
| --- | --- | --- |
| `auth` | 11 | registro, verificación, reenvío, login, bloqueo, reset, tokens, duplicados, guard de config |
| `configuración` | 3 | `envConfig`, `trustProxy`, `mongoUrlRedaction` |
| `seniors` | 4 | dominio del perfil, vínculos, API HTTP, repositorio contra Mongo |
| `pairing` | 6 | token, emisión, canje, canje contra Mongo, repositorio contra Mongo, lector de seniors |

**Total: 24 suites, 246 casos.** Última ejecución: 216 pasan, 0 fallan, 30 saltados.

### Dobles y aislamiento

- `tests/support/registerHarness.ts`: `InMemoryUserRepository` que satisface los cinco puertos,
  `FakePasswordHasher`, `FakeEmailSender`, `CapturingLogger`, y helpers `withServer` / `post` / `get`
  para probar por HTTP real con `fetch`.
- `tests/support/seniorFakes.ts`: `InMemorySeniorRepository`.
- `tests/support/pairingFakes.ts`: repositorios y escritores en memoria, más `FailingQrEncoder` para
  el camino del `503`.
- Las pruebas se hacen **por la interfaz pública** (HTTP o caso de uso), nunca leyendo el almacén
  interno.

### Pruebas de pin contra MongoDB real

Los seis archivos `*.mongo.test.ts` corren **sólo** con `MONGO_URL` definida, cada uno contra una base
propia con prefijo `chk-`, y **se niegan** a correr contra un nombre de base que no lleve ese prefijo.
Son los 30 casos saltados. Ahí se verifica lo que un doble en memoria no puede probar: el índice
único compuesto, el *upsert* atómico del reset, el canje atómico y la invalidación en bloque.

---

## 10. Proceso de trabajo: ODD y revisión nativa

Cada HU se construyó con **Organic Driven Development**:

1. **Autorizar** — alcance explícito del humano, por escrito.
2. **Explorar** el código existente antes de escribir.
3. **Documento de feature** en `odd/tasks/<hu>.md`: encabezado, `## Specs` con `S#` numerados que
   citan textualmente los criterios de aceptación, `## Tasks` con `T#`, y `## Log` al final donde
   `L1` es el pedido original *verbatim* y cada corrección posterior se agrega sin resumir.
4. **Commit de unidad de trabajo** por slice revisable (≈400 líneas), con pruebas y documentación
   junto al comportamiento y mensaje Conventional Commits.
5. **Revisión nativa** de la unidad antes de integrar, con lentes elegidos por lo tocado
   (`risk`, `resilience`, `readability`, `reliability`). Los hallazgos se cerraron en commits
   posteriores: `9f55763`, `a735d5a`, `f2267ce`, `d15b109`, `8b8b1f6`, entre otros.
6. **Verificación** por criterio `S#`, no por “parece que anda”.

### Los 8 documentos de feature

| Archivo | HU | Specs | Tasks |
| --- | --- | --- | --- |
| `hu-001-registro-familiar.md` | HU-001 | 9 | 5 |
| `hu-001-advisory-hardening.md` | HU-001 (hardening) | 5 | 5 |
| `hu-002-confirmacion-correo.md` | HU-002 | 8 | 5 |
| `hu-003-login-bloqueo.md` | HU-003 | 13 | 5 |
| `hu-004-recuperacion-password.md` | HU-004 | 10 | 5 |
| `hu-005-seniors-vinculos.md` | HU-005 + HU-007 | 23 | 6 |
| `hu-008-qr-vinculacion.md` | HU-008 | 22 | 7 |
| `hu-009-canje-qr.md` | HU-009 | 23 | 6 |

**113 especificaciones numeradas y 44 tareas con trazabilidad al commit que las cerró.** La
completitud no se marca con checkboxes sino que se registra en el `## Log` de cada documento, con la
evidencia y las decisiones tomadas.

### Distribución de los 51 commits

| Tipo | Cantidad |
| --- | --- |
| `feat` | 11 |
| `fix` | 11 |
| `docs` | 17 |
| `chore` | 10 |
| `perf` | 1 |
| merge | 1 |

Once `feat` para nueve HUs: el trabajo se partió por capa (modelo → persistencia → HTTP) y no por HU
completa, para que cada commit fuera revisable por separado.

---

## 11. Documentación disponible

| Archivo | Contenido |
| --- | --- |
| `docs/backlog.md` | Las 30 HU en 3 sprints, con criterios de aceptación y decisiones de producto registradas |
| `docs/flujo-de-trabajo.md` | Contrato operativo: ramas, pruebas, integración, promoción, commits, base de datos de trabajo |
| `docs/auth-api.md` | Contrato HTTP de registro, verificación, login y reset (HU-001 a HU-004) |
| `docs/seniors-api.md` | Contrato del slice de perfiles y vínculos (HU-005, HU-007) |
| `docs/pairing-api.md` | Contrato de emisión y canje del QR (HU-008 a HU-010) |
| `docs/error-handling.md` | Envoltura de error y catálogo de códigos y estados |
| `docs/google-signin.md` | Configuración del cliente OAuth — **declarado, sin implementación** |
| `docs/smtp-setup.md` | Cableado del correo |
| `AGENTS.md` | Contexto y reglas duras del repositorio (desactualizado en §2) |
| `.agents/skills/project/` | 10 skills propias derivadas de las HU, obligatorias antes de tocar el código que gobiernan |
| `.agents/skills/vendor/` | Skills de terceros copiadas y pineadas, con origen y commit en su README |

---

## 12. Estado por historia de usuario

Leyenda: ✅ implementado y probado · 🟡 parcial · ❌ no iniciado

### Sprint 1 — Cuentas, perfil, vinculación (HU-001 a HU-012)

| HU | Título | Estado | Detalle |
| --- | --- | --- | --- |
| HU-001 | Registro de familiar con correo y contraseña | ✅ | Backend completo + evidencia Ley 1581 + hardening de advisories |
| HU-002 | Confirmación del correo electrónico | ✅ | Token de un solo uso, canje atómico, reenvío con throttle, canal `console`/SMTP |
| HU-003 | Inicio de sesión con bloqueo por intentos | ✅ | JWT HS256, `sessionVersion`, bloqueo persistido, límite por IP |
| HU-004 | Recuperación de contraseña | ✅ | Enlace de un solo uso, `TTL` de 60 min, throttle propio, índice único por correo |
| HU-005 | Varios familiares por adulto mayor | ✅ | Colección `seniorlinks`, permisos equivalentes, sin `caregiverId` en el perfil |
| HU-006 | Sesión persistente del familiar | 🟡 | El backend emite y valida la sesión (7d, `expiresAt`); la persistencia en el dispositivo es del cliente, que no existe |
| HU-007 | Perfil del adulto mayor con ficha médica | ✅ | `createSenior` como única fábrica, ficha médica en ruta propia, sin PIN |
| HU-008 | Generar el QR de vinculación | ✅ | Backend completo: token 32 bytes, PNG data URL, invalidación previa, `503` cerrado |
| HU-009 | Vincular el dispositivo con consentimiento | ✅ | Canje de un solo uso, consentimiento previo obligatorio, bloqueo tras 5 fallos, recuperación de respuesta perdida |
| HU-010 | Regenerar el QR | ✅ | Backend completo en `POST /api/pairing/qr`: emitir invalida los no usados, reemplazado responde byte-idéntico a vencido, `expiresAt` real. Los dos criterios del panel son del cliente, que no existe |
| HU-011 | Red de cuidadores y asignación | ❌ | Sólo existe la lectura de cuidadores de un perfil (`GET /:id/caregivers`) |
| HU-012 | Reasignación y desvinculación | ❌ | El modelo soporta `REVOKED`; no hay flujo |

### Sprint 2 — Actividades, bitácora, sin conexión (HU-013 a HU-022, HU-029, HU-030)

❌ **Ninguna iniciada.** No hay modelo de actividades, ni bitácora, ni alerta de omisión, ni cola
local offline.

### Sprint 3 — Comunicación, emergencias, ubicación (HU-023 a HU-028)

❌ **Ninguna iniciada.** No hay botón Llamar, ni SOS, ni tarjeta de auxilio, ni centro de alertas, ni
ubicación.

### Clientes

❌ **Ninguno iniciado.** No existe proyecto React Native para el adulto mayor ni para el
familiar/cuidador. Las 10 skills de proyecto ya están escritas (`senior-ui-wcag`, `pairing-link`,
`qr-adapter`, etc.), así que la especificación de UI está lista aunque el código no.

**Resumen: 8 HU cerradas de punta a punta en backend, 2 parciales, 20 sin iniciar.**

---

## 13. Brechas y riesgos

Ordenados por gravedad, no por comodidad.

1. **No hay cliente, y la entrega son dos APK.** El anteproyecto promete dos binarios Android
   conviviendo sobre una sola base de código. Hoy hay cero líneas de React Native. Es la brecha más
   grande del proyecto y la que más tiempo de reloj consume, porque no se puede paralelizar con el
   backend: el backend ya está.
2. **CI sin gates.** El workflow de `prod` despliega sin correr `npm test` ni `npm run typecheck`. Un
   commit que rompe la suite llega a producción igual. El riesgo es bajo mientras el deploy sea
   manual y el humano verifique, y alto en cuanto haya más de una persona integrando.
3. **Sin TTL en las colecciones de tokens.** `pairing_tokens` y `password_reset_tokens` crecen sin
   límite. No hay job de limpieza. Con 30 personas no importa; con tráfico real, sí.
4. **Rate limiting en memoria, por proceso.** Con más de una instancia del backend, cada una lleva su
   propio contador y el límite efectivo se multiplica. Documentado en `env.sample`; no resuelto.
5. **No hay Socket.IO ni push.** HU-017 (aprobación), HU-020 (alerta de omisión), HU-026 (alerta SOS)
   y HU-028 (aviso de desconexión) dependen de realtime. Nada de la capa de avisos existe.
6. **`docs/google-signin.md` describe algo que no está implementado** y que no figura en el Sprint 1
   del backlog. Decisión pendiente: implementarlo o retirar el documento.
7. **Sin `eslint` ni `prettier`.** `tsc --noEmit` cubre tipos, no estilo. La coherencia hoy depende
   de las skills y de la revisión, no de una herramienta.
8. **`AGENTS.md` desactualizado** en tres afirmaciones (ver §2). Cualquier agente o persona que lo lea
   primero recibe un estado equivocado.
9. **El canal `console` del correo es fail-open silencioso.** Sin `SMTP_HOST` en producción, los
   enlaces se imprimen en el log y no llegan a nadie. El sistema no falla: parece funcionar.
10. **`frontend/` quedó como carpeta vacía con `node_modules` residual.** Ruido que confunde sobre
    qué contiene el proyecto.

### Deuda técnica reconocida (no es riesgo, es trabajo pendiente)

- No hay logger estructurado: `console` con redacción manual.
- No hay tests de contrato contra el cliente HTTP tipado (no hay cliente).
- Los advisories de revisión que se difirieron están registrados en cada `odd/tasks/*.md`.

---

## 14. Próximos pasos sugeridos

En este orden, por dependencia y no por gusto:

1. **Actualizar `AGENTS.md`** con el estado real. Barato, y desbloquea a cualquier colaborador o
   agente que llegue después.
2. **Agregar `npm test` y `npm run typecheck` al workflow** de `prod`, o a un workflow de PR que no
   despliegue.
3. **Revisar el estado real de HU-010**: este documento afirmaba que faltaba un «endpoint de
   regeneración explícito», y es falso — `docs/pairing-api.md:8` documenta `POST /api/pairing/qr`
   como emisión de HU-008 **y** regeneración de HU-010, y la emisión ya invalida los tokens previos.
   Lo que faltaba era el pin de paridad reemplazado/vencido (agregado en `pairingRedeem.test.ts`),
   no una ruta nueva.
4. **Arrancar el proyecto React Native** con la base compartida (TypeScript, cliente HTTP, modelos de
   dominio) y **dos navegadores raíz separados**, empezando por la app del adulto mayor y su pantalla
   de vinculación (HU-009), que es lo único que hoy puede consumir el backend tal como está.
5. **HU-006 del lado del cliente**: sesión persistente en almacenamiento seguro, no en memoria.
6. Recién entonces, **Sprint 2**: modelo de actividades, rutina del día y bitácora.

---

## 15. Cómo correrlo

```bash
# Backend en local, contra el Mongo del compose
cp env.sample .env          # completar JWT_SECRET
docker compose up -d mongo mongo-rs-init
cd backend && npm ci
npm test                    # 216 casos, sin necesidad de Mongo
npm run typecheck
npm run build && npm start  # escucha en 3500

# Stack completo
docker compose up -d --build

# Pruebas de pin contra MongoDB real (una base con prefijo chk-)
MONGO_URL="mongodb://127.0.0.1:4301/chk-local?replicaSet=rs0" npm test
```

Reglas de la base de trabajo, en `docs/flujo-de-trabajo.md`: cualquier prueba que escriba datos usa
prefijo identificable (`chk-`, `e2e-`, `smoke-`) y limpia al terminar; contra la base desplegada no
se corren borrados masivos ni `db drop`.

---

*Documento generado a partir del árbol de `prod` en `62ac691` y de una ejecución real de la suite
(`246 pruebas: 216 pass, 0 fail, 30 skipped`). Toda cifra de este informe es verificable con los
comandos de §15.*
