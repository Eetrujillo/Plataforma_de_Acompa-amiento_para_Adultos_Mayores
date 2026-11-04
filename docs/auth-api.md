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
  `Invalid credentials` (no revela qué falló), `403` `EMAIL_NOT_VERIFIED` hasta confirmar el correo.
- `POST /api/auth/verify-email` — `{ token }`; `200` con `{ token, user }`, `400` si el enlace
  expiró o ya se usó.
- `POST /api/auth/resend-verification` — `{ email }`; siempre `202`, no revela si la cuenta existe.
- `GET /api/auth/me` — requiere `Authorization: Bearer <jwt>`.
