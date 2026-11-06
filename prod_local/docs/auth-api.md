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
- `GET /api/auth/me` — requiere `Authorization: Bearer <jwt>`.

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
