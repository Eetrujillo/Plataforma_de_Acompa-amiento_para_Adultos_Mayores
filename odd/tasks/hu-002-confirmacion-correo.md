# HU-002 · Confirmación del correo electrónico

Valida la propiedad de la cuenta por enlace de correo: al registrarse (y al pedirlo de nuevo) se
emite un token de un solo uso, se envía por correo y la verificación marca el correo como
confirmado. Es la primera HU con envío de correo y con límite de tasa.

Fuente de requisitos: `docs/backlog.md` (HU-002), `docs/auth-api.md` (§verificación y `429`),
`docs/smtp-setup.md`, `docs/error-handling.md`, y las skills `email-adapter` y `rate-limiting`
(`.agents/skills/project/`).

## Specs

Texto entre comillas = criterio literal de `docs/backlog.md` (HU-002).

- **S1.** "Envía un correo con token único de confirmación válido 24 horas."
  Al cerrar el registro se emite un token nuevo (32 bytes aleatorios) con vencimiento a
  `EMAIL_VERIFICATION_TTL_HOURS` horas (default `24`) medido con el reloj inyectado, y se envía un
  correo con el enlace. Un envío o una persistencia del token que fallan **no rompen el registro**:
  responde `201` con `verificationSent: false`.
- **S2.** "La verificación marca el correo como confirmado."
  `POST /api/auth/verify-email` con el token en claro marca `emailVerifiedAt` (reloj del servidor),
  invalida el token usado y responde `200` con el usuario y `emailVerified: true`.
- **S3.** "Token expirado o ya usado responde el error del contrato, sin distinguir cuál de los dos
  fue." Los dos casos (y también un token malformado o inexistente) responden **idéntico**:
  `400` `INVALID_TOKEN`, mismo mensaje, sin `details` que delate cuál fue.
- **S4.** "Bloquea el reenvío al cuarto intento dentro de una hora (HTTP 429)."
  Con `RESEND_THROTTLE_MAX=3` y `RESEND_THROTTLE_WINDOW_MINUTES=60`: los tres primeros reenvíos de
  un correo dentro de la ventana móvil se aceptan (`202`); el cuarto responde `429`
  `TOO_MANY_REQUESTS` con `details.retryAfterSeconds`.
- **S5.** "Arma el enlace con `APP_URL` de configuración, nunca con el header `Host` del pedido."
  El enlace es `${APP_URL}/verify-email?token=<token en claro>`. Un `Host` o `X-Forwarded-Host`
  distinto en el pedido no cambia el enlace enviado.
- **S6.** "Persiste solo `sha256(token)`; el token en claro viaja únicamente en el correo."
  La base guarda `verificationTokenHash` (hex de SHA-256) y `verificationTokenExpiresAt`, nunca el
  token en claro; ese valor no aparece en ninguna respuesta HTTP ni en los logs del canal SMTP. La
  única excepción declarada es el canal `console` de desarrollo, que imprime el enlace porque no hay
  otro transporte.
- **S7.** "El contador de reenvíos se incrementa también para correos inexistentes o ya verificados:
  un `429` que solo aparece con cuentas reales es un oráculo de existencia."
  Un correo sin cuenta o ya verificado consume cupo igual y responde `202 { accepted: true }`; el
  cuarto intento también da `429`. Un `INVALID_EMAIL` (formato) responde `400` y **no** consume cupo.
- **S8.** Un reenvío válido **invalida el token anterior**: el enlace viejo responde `INVALID_TOKEN`
  y el nuevo funciona. "Los tokens vencen a las 24 horas y son de un solo uso; el reenvío invalida el
  anterior" (`docs/smtp-setup.md:161`).

## Contrato

- `POST /api/auth/verify-email` — `{ token }`
  - `200` → `{ user: { id, email, fullName, role, emailVerified: true } }`
  - `400` → `INVALID_TOKEN` (vencido, ya usado, inexistente o malformado; mensaje único)
  - `400` → `INVALID_BODY` si falta `token` o no es texto.
- `POST /api/auth/resend-verification` — `{ email }`
  - `202` → `{ accepted: true }` (siempre que el formato sea válido, exista o no la cuenta)
  - `400` → `INVALID_EMAIL` (no consume cupo)
  - `429` → `TOO_MANY_REQUESTS`, `message` de `docs/auth-api.md:94-102`,
    `details: { retryAfterSeconds: <segundos hasta que se libere un cupo> }`
- `POST /api/auth/register` — el `201` de HU-001 gana un campo booleano `verificationSent`
  (`docs/smtp-setup.md:143,158`); el resto de la respuesta no cambia.

## Decisions

- **D1.** La verificación **no** emite sesión: `verify-email` no devuelve `token`/JWT. El JWT es
  HU-003 (login), coherente con `docs/auth-api.md:38-39` ("el registro no emite JWT"). Se reconcilia
  la línea del contrato que prometía `{ token, user }`.
- **D2.** Un solo código para "no sirve este token" (`INVALID_TOKEN`), igual que el `401 Invalid
  credentials` de HU-003: el cliente no distingue vencido de usado ni de inexistente.
- **D3.** El token vive en el documento `User` (`verificationTokenHash`, `verificationTokenExpiresAt`,
  `select: false`), no en una colección aparte: un token vigente por cuenta y el reenvío lo pisa.
- **D4.** `nodemailer` es la dependencia del adaptador SMTP; sin `SMTP_HOST` el canal es `console`.
  Los tests usan un doble del puerto y nunca SMTP real.

## Tasks

- **T1** · Dominio y aplicación del token · S1, S3, S6, S8
  `backend/src/modules/auth/domain/EmailVerificationToken.ts` (token aleatorio, `sha256`, TTL, regla
  "sirve/no sirve"), `backend/src/modules/auth/application/RequestEmailVerification.ts`
  (emite, persiste el hash, arma el enlace con `APP_URL`, envía, no rompe el registro si falla),
  `backend/src/modules/auth/application/ConfirmEmail.ts` (un solo error para los tres fracasos).
- **T2** · Rate limiting · S4, S7
  `backend/src/modules/auth/application/ResendThrottle.ts` (ventana móvil con reloj inyectable,
  incrementa en todo intento de formato válido, el bloqueado no se registra, poda y tope de claves,
  `retryAfterSeconds`).
- **T3** · Adaptadores · S1, S5, S6
  `backend/src/modules/auth/application/EmailSenderPort.ts` (`sendVerificationEmail({ to, fullName,
  link, expiresInHours }) -> { delivered, channel }`),
  `backend/src/modules/auth/infrastructure/EmailSender.ts` (canal `console` sin `SMTP_HOST`, canal
  `smtp` con `nodemailer`; copy en español, `text` + `html`, aviso de vencimiento y de un solo uso),
  `backend/src/shared/models/User.ts` (campos del token),
  `backend/src/modules/auth/infrastructure/MongooseUserRepository.ts` (`saveVerificationToken`,
  `findByVerificationTokenHash`, `markEmailVerified`).
- **T4** · HTTP y composición · contrato completo
  `backend/src/modules/auth/infrastructure/AuthController.ts`, `authRoutes.ts`, `index.ts`,
  `backend/src/config/env.ts` (`APP_URL`, `EMAIL_VERIFICATION_TTL_HOURS`, `RESEND_THROTTLE_MAX`,
  `RESEND_THROTTLE_WINDOW_MINUTES`, `SMTP_HOST/PORT/SECURE/USER/PASS/FROM`), `backend/src/server.ts`,
  `backend/package.json` (`nodemailer`), `backend/env.sample`, `docs/auth-api.md`.
- **T5** · Tests · S1-S8
  `backend/tests/emailVerification.test.ts` y `backend/tests/resendThrottle.test.ts`, un caso por spec
  más el contrato de `register` con `verificationSent`, contra la interfaz HTTP pública, sin Mongo ni
  SMTP. Los 22 tests existentes siguen verdes y `npm run typecheck` queda limpio.

## Reglas de la casa que aplican

- **Hexagonal**: `domain/` no importa Express, Mongoose ni `nodemailer`; el caso de uso recibe el
  puerto de correo, el repositorio y el reloj. `nodemailer` se usa sólo en `infrastructure/`.
- **Un envío caído no rompe la operación**: `{ delivered: false }` + `console.warn`, nunca un 500.
- **El enlace lo arma el servidor** con `APP_URL`; el `Host` del pedido se ignora.
- **El token crudo sólo viaja en el correo**; en respuestas y logs SMTP nunca aparece.
- **Anti-oráculo**: mismo `202` para existente, inexistente y verificado; el contador corre antes de
  buscar la cuenta.
- **Sin `any`**. TypeScript estricto. `node --test`, sin Jest ni Mocha.
- **`docs/smtp-setup.md` es la guía operativa**: el log del canal `console` incluye la frase
  `Enlace de verificación` para que el `grep` de la guía siga funcionando.

## Corrections after independent verification

La verificación independiente encontró un defecto **CRITICAL** y cuatro hallazgos menores en el
adaptador real (ninguno lo veía el doble en memoria). Estas correcciones son parte de la misma HU.

- **C1 (S2, CRITICAL).** `findByVerificationTokenHash` filtra la proyección a `fullName
  emailVerifiedAt verificationTokenHash verificationTokenExpiresAt`: `email` queda afuera y llega
  `undefined`, así que la cadena real termina en `markEmailVerified(undefined, …)` →
  `updateOne({}, …)` marca **la primera cuenta de la colección** y devuelve sus datos. La proyección
  debe incluir **todos** los campos que el puerto devuelve, publicada como constante
  (`VERIFICATION_TOKEN_FIELDS`) y con un test que falle si falta uno.
- **C2 (S2, concurrencia).** Marcar el correo verificado debe ser **atómico**:
  `markEmailVerified(email, tokenHash, verifiedAt)` con
  `findOneAndUpdate({ email, verificationTokenHash: tokenHash, emailVerifiedAt: null }, …, { new: true })`
  y `StoredUser | null`. `ConfirmEmail` traduce `null` a `INVALID_TOKEN`. Dos canjes simultáneos del
  mismo token no pueden dar dos `200` ni marcar dos cuentas.
- **C3 (S4/S7).** `RESEND_THROTTLE_MAX` y `RESEND_THROTTLE_WINDOW_MINUTES` aceptan sólo enteros
  positivos; vacío, `0`, negativo o malformado cae al default (`3` / `60`). Un límite no se puede
  desactivar por configuración accidental.
- **C4.** `verificationTokenHash` lleva índice: `verify-email` es un endpoint público y hoy escanea la
  colección completa.
- **C5.** El transporte SMTP define timeouts explícitos (`connectionTimeout` y `greetingTimeout`
  10 s, `socketTimeout` 20 s): un SMTP colgado no puede retener el `201` del registro.

Diferido, requiere decisión del humano en el deploy: con `NODE_ENV=production` y `SMTP_HOST` vacío
el canal `console` imprime los enlaces con token en el log del contenedor. Fallar cerrado en
producción cambia el arranque del deploy, así que no se decide acá.

## Log

- **L1.** Pedido del humano, literal: *"retomá la plataforma, seguimos con HU-002"*.
- **L2.** Orden de trabajo: primero la unidad de hardening de los tres WARNING de HU-001
  (`odd/tasks/hu-001-advisory-hardening.md`), después esta HU, por decisión del humano en la misma
  sesión (*"Cerrarlos ahora, antes de HU-002"*).
- **L3.** Decisiones D1-D4 tomadas acá porque `docs/auth-api.md` venía del repo viejo y prometía un
  JWT en la verificación: se reconcilia el documento con lo que HU-002 hace y el JWT queda en HU-003.
- **L4.** `nodemailer@10.6.1` disponible en el registro; es la única dependencia nueva y va en
  `dependencies`, no en `devDependencies`.
- **L5.** Hallazgos de HU-001 que siguen diferidos y **no** entran acá: aviso de arranque por
  `TRUST_PROXY_HOPS=0`, la ida y vuelta real del `11000` sin Mongo local, y el `MONGO_URL` vacío.
- **L6.** Implementación delegada a `gentle-ai-worker` con handoff por referencia
  (`Spec: odd/tasks/hu-002-confirmacion-correo.md, T1-T5`). Verificado por el padre: **41/41 tests**,
  `typecheck` y `build` verdes, y las aserciones de HU-001 intactas (sólo migraron al arnés
  compartido). Desviaciones aceptadas: el puerto de persistencia ganó
  `findEmailVerificationState` (el reenvío necesita `fullName` y el estado sin exponer el hash);
  `AppError.details` pasó a `Record<string, unknown>` para que el `429` lleve `retryAfterSeconds`
  numérico como pide el contrato; `ResendThrottle` usa campos explícitos porque el modo *strip-only*
  de Node no soporta parameter properties; se corrigió un test propio del worker que verificaba con
  el token viejo después de un reenvío (el viejo se invalida por diseño).
- **L7.** `docs/smtp-setup.md` se corrigió en dos puntos que contradecían el contrato: la respuesta
  del registro prometía `emailVerified` dentro de `user` (el contrato nunca lo tuvo) y prometía
  "te deja logueado" tras verificar (D1: no emite sesión).
- **L8.** Slice de review: es un commit de ~700 líneas autoradas, por encima de la guía de ~400.
  Es una sola conducta (emisión y confirmación del token) y no se parte sin dejar un commit que no
  compile; se publica como un único slice de PR.
- **L9.** Revisión nativa `review-172231dad156b7f6` (tier alto por escalado del ítem 2, lentes
  risk+resilience+reliability): **aprobada**, autoridad quemada, 9 hallazgos advisory. Cerrados en
  esta misma unidad por su valor (fallaban en silencio): `EMAIL_VERIFICATION_TTL_HOURS` sólo acepta
  enteros positivos (un `0` o un negativo emitía tokens ya vencidos y el flujo entero no hacía nada
  con `201 verificationSent: true`), `SMTP_SECURE` entiende `1/yes/on/0/no/off` (un `1` dejaba el
  transporte sin TLS sin aviso) y el vencimiento entra en el filtro atómico del canje (un token que
  cruzaba el borde entre el chequeo y la escritura se canjeaba igual). Tests: 50/50.
- **L10.** Advisory diferidos, cada uno con su razón: canal `console` con `NODE_ENV=production` y  `SMTP_HOST` vacío imprime los enlaces con token en el log del contenedor (**requiere decisión del
  humano en el deploy**: fallar cerrado cambia el arranque); la evicción por tope de claves del
  throttle permite, con ~10.000 correos distintos, resetear el cupo de una víctima (volumen alto);
  el throttle es por proceso (un reinicio lo resetea; documentado en `docs/auth-api.md`); el envío
  SMTP es inline en el registro y el reenvío (necesita cola asincrónica, cambio de diseño); el
  índice de `verificationTokenHash` no se verificó contra una base real en producción; el oráculo
  por latencia del reenvío es redundante con el `EMAIL_ALREADY_REGISTERED` documentado del registro.
- **L11.** Segunda revisión nativa `review-7e2bb24ca2604e24` (lentes risk+reliability) sobre el
  rango completo con las tres correcciones: **aprobada**, autoridad quemada. Repitió el advisory del
  canal `console` en producción (sigue siendo la decisión de deploy del humano) y agregó dos
  diferidos: el TTL no tiene tope superior (un valor absurdo produce `Invalid Date` y un enlace
  inutilizable) y el envío SMTP inline. El advisory `R1-lock-engines-divergence` / `R3-001` es
  **incorrecto**: se verificó que `backend/package.json` y la entrada raíz de `package-lock.json`
  declaran los dos `node >=22.18.0`.
- **L12.** Estado final de la unidad: 4 commits (`e3d38b2`, `04ceea8`, `c5f9f42`, `9f55763`),
  **50/50 tests**, `typecheck` y `build` verdes, dos revisiones nativas aprobadas y una verificación
  independiente con un CRITICAL real corregido (C1). Nada pusheado: el deploy sigue siendo decisión
  del humano.
