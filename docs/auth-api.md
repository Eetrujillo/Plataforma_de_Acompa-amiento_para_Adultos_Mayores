# Auth API — contrato del módulo `auth`

Referencia de los campos que cada endpoint acepta y de las respuestas que devuelve.
Código: `backend/src/modules/auth/` (Vertical Slice + Hexagonal).

## `POST /api/auth/register` — HU-001

Crea la cuenta de un familiar/cuidador. El rol (`CAREGIVER`) y la evidencia de
consentimiento los fija el servidor.

| Campo | Tipo | Obligatorio | Regla |
| --- | --- | --- | --- |
| `fullName` | string | sí | mínimo 3 caracteres, espacios colapsados |
| `email` | string | sí | formato válido, guardado en minúsculas |
| `password` | string | sí | mínimo 8 caracteres, con al menos una letra y un dígito |
| `phone` | string | no | `+`, dígitos, espacios o guiones (6 a 20 caracteres) |
| `acceptedTerms` | boolean | sí | tiene que ser exactamente `true` (Ley 1581) |

Campos que el cliente **no** puede fijar: `role`, `emailVerifiedAt`, `termsVersion`,
`acceptedTermsAt`, `ipAddress`. Si los manda, se ignoran.

Éxito — `201`:

```json
{
  "user": {
    "id": "665f...",
    "email": "cuidador@example.com",
    "fullName": "Esteban Trujillo",
    "role": "CAREGIVER"
  },
  "verificationSent": true
}
```

La respuesta lleva el usuario con esos cuatro campos y, desde HU-002, el booleano
`verificationSent` (`docs/smtp-setup.md:143,158`): `true` cuando el correo de verificación salió,
`false` cuando el envío o la persistencia del token fallaron — el registro nunca se rompe por el
correo, y el enlace puede pedirse con `resend-verification`. `emailVerified`/`createdAt` se agregan
cuando un consumidor los necesite: el contrato no promete campos que el código no devuelve.

El registro **no** emite JWT: la cuenta nace sin verificar y el login se habilita
cuando se confirma el correo (HU-002). Al cerrar el registro se emite el token de
verificación de una sola uso (ver la sección siguiente).

Errores:

| Situación | Status | `error.code` | `error.message` |
| --- | --- | --- | --- |
| el cuerpo no es un objeto válido | `400` | `INVALID_BODY` | mensaje en español, listo para mostrar |
| el correo no tiene formato válido | `400` | `INVALID_EMAIL` | indica el formato esperado, nunca el valor recibido |
| la contraseña no cumple la regla | `400` | `WEAK_PASSWORD` | al menos 8 caracteres, con al menos una letra y un dígito |
| falta o no es `true` la aceptación de términos | `400` | `TERMS_NOT_ACCEPTED` | exige aceptar términos y política de datos |
| el correo ya tiene cuenta (sin distinguir mayúsculas) | `400` | `EMAIL_ALREADY_REGISTERED` | `Este correo ya tiene una cuenta` |

El duplicado se cobra igual cuando lo detecta la restricción única de la base y no el chequeo
previo (dos registros simultáneos con el mismo correo): la respuesta es el mismo `400`
`EMAIL_ALREADY_REGISTERED`, nunca un `500`.

Cada motivo tiene su código para que el cliente muestre el mensaje correcto y el test pueda
distinguirlos. `VALIDATION_ERROR` queda como código genérico para lo que no esté enumerado acá.

## Evidencia de consentimiento (Ley 1581)

Cada cuenta guarda, en el documento `User`:

- `acceptedTermsAt` — instante exacto de la aceptación.
- `termsVersion` — versión de la política aceptada, tomada de `TERMS_VERSION` (default `1.0`).
- `ipAddress` — IP del transporte (`req.ip`), acotada a los proxies que la configuración declara.
  El backend **no confía en ningún proxy por defecto**: con `TRUST_PROXY_HOPS=0` (default) el header
  `X-Forwarded-For` de un cliente directo se ignora y la evidencia guarda la IP del socket. En
  producción se declara el número real de proxies delante (`TRUST_PROXY_HOPS=2` con Cloudflare y el
  nginx del host). Sólo se aceptan dígitos entre `0` y `10`: un valor vacío, negativo, decimal, con
  prefijo numérico (`10abc`, `1e2`) o fuera de rango cae a `0`. La IP se registra únicamente si es
  una dirección válida; si `req.ip` trae otra cosa, el campo no se escribe. Preferimos una IP del
  proxy antes que una IP elegida por el cliente: la evidencia de la Ley 1581 no puede ser inventada
  por quien se registra.

La casilla de la pantalla de registro arranca **desmarcada**: la SIC considera que las
casillas premarcadas, el silencio o la inacción no son consentimiento.

## Otros endpoints del módulo

- `POST /api/auth/login` — `{ email, password }`; `200` con `{ token, user: { id, email, fullName,
  role } }`. `400` `INVALID_BODY` si falta `email`/`password` o no son texto (no consume intentos);
  `401` `UNAUTHORIZED` · `Credenciales inválidas` (no revela qué falló, D2 del contrato del módulo:
  idéntico para correo inexistente y contraseña incorrecta); `403` `EMAIL_NOT_VERIFIED` cuando la
  contraseña es correcta y el correo no está confirmado; `429` `ACCOUNT_LOCKED` si la cuenta está
  bloqueada por intentos fallidos; `429` `TOO_MANY_REQUESTS` si la IP agotó su ventana de fallos
  (ver abajo). **Decisión D1 de HU-003:** un correo que no existe nunca se bloquea ni escribe
  estado — sigue respondiendo `401`; la consecuencia asumida es que el `429` revela existencia
  (ver la sección del bloqueo).
- `POST /api/auth/verify-email` — `{ token }`; `200` con `{ user: { id, email, fullName, role,
  emailVerified: true } }`; `400` `INVALID_TOKEN` si el enlace venció, ya se usó, no existe o es
  malformado (la respuesta es idéntica en los cuatro casos y no trae `details`); `400`
  `INVALID_BODY` si falta `token` o no es texto. **No emite JWT**: el token de sesión es HU-003
  (login).
- `POST /api/auth/resend-verification` — `{ email }`; `202` con `{ accepted: true }`, **3 intentos
  por hora y por correo**; el cuarto responde `429` (ver la sección siguiente).
- `POST /api/auth/forgot-password` — `{ email }`; `202` con `{ accepted: true }` **exista o no la
  cuenta**, mismo límite de 3 por hora por correo.
- `POST /api/auth/reset-password` — `{ token, password }`; `200` con `{ reset: true }`, `400` si el
  enlace no sirve (ver la sección de restablecimiento).
- `GET /api/auth/me` — requiere `Authorization: Bearer <jwt>`; `200` con
  `{ user: { id, email, fullName, role } }`; `401` `UNAUTHORIZED` · `Falta el token de sesión` con el
  header ausente, sin el esquema `Bearer` o sin token, y `401` `UNAUTHORIZED` · `La sesión no es
  válida` con token malformado, con firma ajena, vencido, de un usuario borrado o con el claim `sv`
  distinto de `sessionVersion`. El `authMiddleware` (`shared/middlewares/authMiddleware.ts`) es el
  único guard del backend: sin sesión válida la ruta no se ejecuta.
- Los tokens de sesión llevan exactamente los claims `sub`, `role`, `email` y `sv` (numérico,
  `sessionVersion` null leído como `0`), más `iat`/`exp` que agrega la librería. Los arma el helper
  puro `domain/sessionClaims.ts` y los firma únicamente `infrastructure/JwtTokenService.ts` (ningún
  controlador firma). Vigencia `JWT_EXPIRES_IN` (default `7d`): sólo valen duraciones `\d+[smhd]`
  no nulas — vacío, `7`, `0d`, `abc` o cualquier otra cosa cae al default en vez de romper el login
  (C3); no hay refresh token.
- El claim `sv` de los tokens de sesión se documenta en la sección de restablecimiento (abajo).

## Token de verificación del correo (HU-002)

- Al cerrar el registro (y en cada reenvío aceptado) se emite un token de **32 bytes aleatorios**,
  vigente `EMAIL_VERIFICATION_TTL_HOURS` horas (default `24`) y de **un solo uso**.
- En la base sólo se guarda `sha256(token)` (`verificationTokenHash`) y su vencimiento
  (`verificationTokenExpiresAt`); el token en claro viaja únicamente dentro del enlace del correo y
  nunca aparece en una respuesta HTTP. Excepción declarada: sin `SMTP_HOST` el canal `console`
  imprime el enlace en el log del backend.
- El enlace es `${APP_URL}/verify-email?token=<token en claro>`, armado con `APP_URL` de
  configuración: un header `Host` o `X-Forwarded-Host` manipulado no cambia el destino.
- Pedir un enlace nuevo **invalida el anterior**: sólo sirve el último emitido.
- La verificación marca `emailVerifiedAt` con el reloj del servidor y **no emite sesión**.

## Límite del reenvío de verificación (HU-002)

`POST /api/auth/resend-verification` acepta como máximo **3 intentos por correo dentro de una
ventana móvil de una hora**. El cuarto devuelve `429`:

```json
{
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Pediste demasiados enlaces de verificación. Esperá unos minutos antes de pedir otro.",
    "details": { "retryAfterSeconds": 3600 }
  }
}
```

- El contador corre **antes** de buscar la cuenta y cuenta **todo** intento, exista o no el correo y
  esté o no verificado. Eso es lo que impide que el `429` sirva para averiguar si una cuenta existe:
  el cuarto intento responde igual para un correo registrado que para uno inventado, y el reenvío a
  una cuenta ya verificada también consume cupo (respuesta `202 { accepted: true }` sin correo).
- Un reenvío aceptado **invalida el enlace anterior**: sólo el último token emitido sirve.
- Un correo con formato inválido sigue siendo `400` (`INVALID_EMAIL`) y no consume cupo.
- El intento rechazado no se registra: insistir no alarga el bloqueo.
- La clave es el correo normalizado (minúsculas, sin espacios); `Cuidador@Example.com` y
  `cuidador@example.com` comparten contador.
- Configuración: `RESEND_THROTTLE_MAX` (default `3`) y `RESEND_THROTTLE_WINDOW_MINUTES`
  (default `60`).
- Limitación conocida: el contador vive en la memoria del proceso. Con más de una réplica del
  backend el límite real es *3 por hora por réplica*; ese día hay que moverlo a un store
  compartido (Redis) sin cambiar el caso de uso.
- Código: `application/ResendThrottle.js` (ventana y reloj inyectable) y
  `shared/errors/TooManyRequestsError.js` (contrato del `429`).

## Bloqueo de la cuenta por intentos fallidos (HU-003)

`POST /api/auth/login` bloquea la cuenta **tras 5 intentos fallidos consecutivos**. El intento 5 es
el que bloquea: del 1 al 4 la respuesta es `401` `UNAUTHORIZED` · `Credenciales inválidas`, y el 5.º
ya responde `429`:

```json
{
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Bloqueamos tu cuenta por demasiados intentos fallidos. Esperá unos minutos antes de volver a intentar.",
    "details": { "retryAfterSeconds": 900 }
  }
}
```

- Duración del bloqueo: **15 minutos** desde el último fallo. Vence solo, por reloj; no hay
  desbloqueo manual.
- **Estando bloqueada, la contraseña correcta también se rechaza** con el mismo `429`. Un bloqueo que
  la clave correcta puede saltear no es un bloqueo.
- Un login correcto **borra la racha** (`failedLoginAttempts` vuelve a cero): la cuenta no queda a un
  error de distancia del bloqueo para siempre.
- **Una cuenta sin verificar también acumula fallos** (la contraseña incorrecta cuenta), pero un
  login correcto ahí responde `403` `EMAIL_NOT_VERIFIED` y **no** limpia la racha: la cuenta puede
  bloquearse aunque todavía no haya confirmado el correo.
- **Un correo que no existe nunca se bloquea**: sigue respondiendo `401` igual que una contraseña
  incorrecta, y no se escribe ningún estado.
- `code` distinto de `TOO_MANY_REQUESTS` a propósito: aquel es el límite de reenvíos de verificación,
  este es el bloqueo de la cuenta, y el cliente tiene que poder mostrar mensajes distintos.
- Configuración: `LOCKOUT_MAX_ATTEMPTS` (default `5`) y `LOCKOUT_MINUTES` (default `15`).
- **Consecuencia asumida:** como el `429` solo aparece con cuentas reales, probando 5 veces un correo se
  puede averiguar si tiene cuenta. Se aceptó a cambio de que la persona bloqueada entienda qué le
  pasa; la alternativa (un `401` genérico durante el bloqueo) no deja rastro pero deja al usuario
  adivinando.
- Estado persistido en el documento `User` (`failedLoginAttempts`, `lockedUntil`, ambos nullable), así
  que un reinicio del backend **no** desbloquea la cuenta. Código: `domain/loginLockout.ts` (reglas
  puras con reloj inyectado) y `application/Login.ts`.
- La racha es **por correo normalizado**: `Ana@X.com` y `ana@x.com` comparten contador y bloqueo.
- La escritura del fallo es **atómica e incondicional** (C2): un update pipeline de un solo
  `findOneAndUpdate` incrementa `failedLoginAttempts` desde el valor guardado (`$add`, semántica de
  `$inc`) y fija `lockedUntil` en la MISMA operación cuando la racha alcanza el umbral. 20 fallos
  en paralelo persisten exactamente 20 — dos contraseñas incorrectas simultáneas no pueden pasarse
  el bloqueo por la espalda.

## Límite por IP de los intentos de login (HU-003)

Además del bloqueo por cuenta, `POST /api/auth/login` limita los **fallos por IP**: pasados
`LOGIN_IP_MAX_ATTEMPTS` (default `20`) fallos desde una misma IP dentro de
`LOGIN_IP_WINDOW_MINUTES` (default `15`) minutos — ventana móvil — la respuesta es `429`:

```json
{
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Demasiados intentos desde tu conexión. Esperá unos minutos antes de volver a intentar.",
    "details": { "retryAfterSeconds": 900 }
  }
}
```

- Es el mismo `429` del reenvío de verificación y **deliberadamente distinto de `ACCOUNT_LOCKED`
  (D2):** el cliente distingue "esta cuenta está bloqueada" de "esta red hizo demasiados intentos".
- Se evalúa **antes de tocar la base** (D3): no depende de que el correo exista — el propio límite
  no se vuelve oráculo — y **no escribe estado en la base**: el contador vive en memoria, por
  proceso, con el mismo reloj inyectable que el resto de los limitadores. Tiene tope de claves.
- Cuenta **fallos** (respuestas `401`), desde cuentas reales y correos inexistentes por igual; los
  rechazados con `429` no se registran, para que insistir no alargue la ventana.
- Es lo que impide que nadie bloquee a otra persona usando su correo: desde otra IP, la cuenta
  bloqueada por la primera sigue pudiendo loguear.
- **Depende de `TRUST_PROXY_HOPS` (C1):** la clave del límite es `req.ip`, y con el default
  `TRUST_PROXY_HOPS=0` el backend no confía en ningún proxy — detrás del nginx del host todos los
  pedidos traen la IP del proxy y el límite se convierte en **una sola bolsa global**: 20 fallos de
  cualquier persona bloquean el login de todo el mundo durante 15 minutos. En producción hay que
  declarar el número real de proxies delante del backend. Con `NODE_ENV=production` y
  `TRUST_PROXY_HOPS=0` el arranque imprime un `console.warn` fuerte con esta consecuencia (no
  corta el arranque: esa decisión de deploy es del humano).
- Código: `application/LoginIpThrottle.ts`; limitación conocida: con más de una réplica el límite
  real es *N fallos por ventana por réplica*.

## Restablecer la contraseña (HU-004)

Dos endpoints, en ese orden:

1. `POST /api/auth/forgot-password` con `{ email }` → **siempre** `202 { accepted: true }`. Si la
   cuenta existe y tiene contraseña, se manda un correo con un enlace; si no existe, no se manda
   nada y la respuesta es idéntica. Un correo con formato inválido sigue siendo `400`
   (`INVALID_EMAIL`) y no consume cupo del límite.
2. `POST /api/auth/reset-password` con `{ token, password }` → `200 { reset: true }`.

Detalles del enlace:

- Viaja como `${APP_URL}/reset-password?token=<token>`; en la base solo se guarda el SHA-256.
- **Un solo uso y 60 minutos** de vigencia (`PASSWORD_RESET_TTL_MINUTES`, default `60`). Es una
  colección propia (`PasswordResetToken`): un enlace de verificación de correo no puede cambiar la
  contraseña.
- Pedir un enlace nuevo **quema el anterior**: solo sirve el último que se envió.
- **El consumo es atómico.** El token se marca usado con un `updateMany` condicionado a
  `usedAt: null` **antes** de tocar la cuenta: si dos pedidos llegan a la vez con el mismo enlace,
  uno solo gana y el otro recibe el mismo `400` genérico. El orden también hace que un fallo al
  escribir la contraseña deje la cuenta intacta y el enlace quemado (falla cerrado), en vez de
  cambiar la contraseña y dejar el enlace vivo.
- Deuda conocida: el envío del correo se espera dentro del request, así que el `202` tarda más con
  una cuenta real que con un correo desconocido. El cuerpo es idéntico (lo que pide el criterio),
  pero el tiempo distingue los dos casos.
- Token inventado, ya usado, vencido o mal formado devuelven **el mismo** `400`:
  `El enlace para restablecer la contraseña no es válido o ya venció`. Distinguirlos solo le sirve a
  quien está probando enlaces.
- La contraseña nueva se valida **antes** de tocar el token, con la misma regla del registro (mínimo
  8 caracteres y letras + números). Si la rechaza, el enlace **sigue sirviendo** para reintentar.
- Al completarse, el reset guarda la contraseña, limpia `failedLoginAttempts` y `lockedUntil` (quien
  demuestra que controla el correo no queda bloqueado por los intentos previos) y **sube la versión
  de sesión** del usuario.
- **Sesiones anteriores:** el JWT lleva el claim `sv` con la versión que tenía el usuario al emitirse.
  `authMiddleware` lee el usuario en cada request autenticado y compara `sv` contra `sessionVersion`;
  si no coinciden responde `401` y el cliente limpia la sesión. Cambiar la contraseña es, entonces,
  equivalente a cerrar todas las sesiones abiertas. Tokens emitidos antes de este cambio no traen
  `sv` y se leen como versión `0`: siguen sirviendo hasta el primer reset, así un despliegue no deja
  a nadie afuera. Un token de un usuario borrado también deja de servir de inmediato.
- **Cuentas creadas con Google no tienen contraseña que restablecer**: para ellas no se manda nada,
  con la misma respuesta `202`.
- Límite: 3 pedidos por hora y por correo, contando también correos sin cuenta (instancia propia del
  limitador, separada de la del reenvío de verificación).
