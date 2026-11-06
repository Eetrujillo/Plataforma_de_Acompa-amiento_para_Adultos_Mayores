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
    "role": "CAREGIVER",
    "phone": "+54 11 5555 1234",
    "caregiverId": null,
    "emailVerified": false,
    "createdAt": "2026-01-01T00:00:00.000Z"
  },
  "verificationSent": true
}
```

El registro **no** emite JWT: la cuenta nace sin verificar y el login se habilita
cuando se confirma el correo (HU-002).

Errores:

| Situación | Status | `error.code` | `error.message` |
| --- | --- | --- | --- |
| falta un campo o no cumple su regla | `400` | `VALIDATION_ERROR` | mensaje en español, listo para mostrar |
| el correo ya tiene cuenta (sin distinguir mayúsculas) | `400` | `EMAIL_ALREADY_REGISTERED` | `Este correo ya tiene una cuenta` |
| falta o no es `true` la aceptación de términos | `400` | `VALIDATION_ERROR` | exige aceptar términos y política de datos |

## Evidencia de consentimiento (Ley 1581)

Cada cuenta guarda, en el documento `User`:

- `acceptedTermsAt` — instante exacto de la aceptación.
- `termsVersion` — versión de la política aceptada, tomada de `TERMS_VERSION` (default `1.0`).
- `ipAddress` — IP del transporte (`req.ip`). Detrás de nginx hay que confiar en el proxy
  para que sea la IP real del usuario y no la del contenedor.

La casilla de la pantalla de registro arranca **desmarcada**: la SIC considera que las
casillas premarcadas, el silencio o la inacción no son consentimiento.

## Otros endpoints del módulo

- `POST /api/auth/login` — `{ email, password }`; `200` con `{ token, user }`. `401`
  `Invalid credentials` (no revela qué falló), `403` `EMAIL_NOT_VERIFIED` hasta confirmar el correo,
  `429` `ACCOUNT_LOCKED` si la cuenta está bloqueada por intentos fallidos (ver abajo).
- `POST /api/auth/verify-email` — `{ token }`; `200` con `{ token, user }`, `400` si el enlace
  expiró o ya se usó.
- `POST /api/auth/resend-verification` — `{ email }`; `202` con `{ accepted: true }`, **3 intentos
  por hora y por correo**; el cuarto responde `429` (ver la sección siguiente).
- `POST /api/auth/forgot-password` — `{ email }`; `202` con `{ accepted: true }` **exista o no la
  cuenta**, mismo límite de 3 por hora por correo.
- `POST /api/auth/reset-password` — `{ token, password }`; `200` con `{ reset: true }`, `400` si el
  enlace no sirve (ver la sección de restablecimiento).
- `GET /api/auth/me` — requiere `Authorization: Bearer <jwt>`.
- El claim `sv` de los tokens de sesión se documenta en la sección de restablecimiento (abajo).

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
  el cuarto intento responde igual para un correo registrado que para uno inventado.
- Un correo con formato inválido sigue siendo `400` (`VALIDATION_ERROR`) y no consume cupo.
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
el que bloquea: del 1 al 4 la respuesta es `401` `Invalid credentials`, y el 5.º ya responde `429`:

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
  que un reinicio del backend **no** desbloquea la cuenta. Código: `domain/loginLockout.js` (reglas
  puras con reloj inyectado) y `application/Login.js`.

## Restablecer la contraseña (HU-004)

Dos endpoints, en ese orden:

1. `POST /api/auth/forgot-password` con `{ email }` → **siempre** `202 { accepted: true }`. Si la
   cuenta existe y tiene contraseña, se manda un correo con un enlace; si no existe, no se manda
   nada y la respuesta es idéntica. Un correo con formato inválido sigue siendo `400`
   (`VALIDATION_ERROR`) y no consume cupo del límite.
2. `POST /api/auth/reset-password` con `{ token, password }` → `200 { reset: true }`.

Detalles del enlace:

- Viaja como `${APP_URL}/reset-password?token=<token>`; en la base solo se guarda el SHA-256.
- **Un solo uso y 60 minutos** de vigencia (`PASSWORD_RESET_TTL_MINUTES`, default `60`). Es una
  colección propia (`PasswordResetToken`): un enlace de verificación de correo no puede cambiar la
  contraseña.
- Pedir un enlace nuevo **quema el anterior**: solo sirve el último que se envió.
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
