# Seniors API — contrato del módulo seniors

Perfil del adulto mayor creado por el familiar que lo administra (HU-005/HU-007). El senior es
un `User` con `role: SENIOR`; no tiene correo propio ni contraseña y **no hay PIN**: se vincula
escaneando el QR que genera su familiar (HU-009). La propiedad del perfil no vive en el
documento: vive en la colección `seniorlinks` (ver «Propiedad por vínculos»).

Todas las rutas exigen `Authorization: Bearer <jwt>` de un usuario con rol `CAREGIVER`.
Sin token: `401 UNAUTHORIZED`. Con sesión de otro rol (por ejemplo `SENIOR`): `403 FORBIDDEN`.
El guard de rol es `requireRole('CAREGIVER')`
(`backend/src/shared/middlewares/requireRole.ts`) y va siempre después del guard de sesión.

## Propiedad por vínculos

El perfil ya no lleva `caregiverId`: la propiedad es un registro de la colección `seniorlinks`
(`backend/src/shared/models/SeniorLink.ts`, índice único compuesto `(seniorId, caregiverId)`).

| Campo | Significado |
| --- | --- |
| `seniorId` | id del adulto mayor. |
| `caregiverId` | id del familiar vinculado. |
| `role` | `OWNER` (el familiar que dio el alta) o `FAMILY` (el resto). Informativo: **no** cambia permisos. |
| `status` | `ACTIVE` o `REVOKED`. Solo un vínculo activo autoriza; revocar desactiva, nunca borra. |
| `invitedBy` | quién agregó el vínculo; `null` en el vínculo `OWNER` del alta. |
| `createdAt` | fecha del vínculo. |

Consecuencias:

- Un adulto mayor admite N familiares `ACTIVE` simultáneos, con permisos equivalentes: ninguno
  queda en solo lectura.
- Agregar un familiar no toca los vínculos existentes: entra como `FAMILY`, no revoca a nadie y
  nunca se duplica (el índice único lo impide; la escritura es idempotente).
- Un vínculo `REVOKED`, como un vínculo inexistente, no autoriza: la respuesta es `404`.

## POST /api/seniors — HU-007

```http
POST /api/seniors
Content-Type: application/json

{ "fullName": "Rosa Pérez", "timezone": "America/Bogota",
  "bloodType": "O+", "allergies": ["penicilina"], "conditions": ["hipertensión"],
  "medications": ["losartán"],
  "emergencyContact": { "fullName": "Ana Pérez", "phone": "+573001234567" } }
```

`timezone` es opcional: si falta, viene vacía, solo con espacios o `null`, se guarda `America/Bogota`.

```http
201 Created

{
  "id": "507f1f77bcf86cd799439011",
  "fullName": "Rosa Pérez",
  "timezone": "America/Bogota",
  "linkStatus": "PENDING",
  "createdAt": "2026-11-05T20:41:00.000Z"
}
```

La respuesta del alta es exactamente la proyección pública: sin ficha médica, sin correo
sintético y sin consentimiento.

Notas del alta:

- El `caregiverId` **nunca** viaja en el cuerpo: lo pone el servidor desde la sesión. Un cliente
  no puede crear un perfil bajo otra cuenta.
- El orden de escritura es perfil y después el vínculo `OWNER` de quien lo pidió, **sin
  transacción**. Si el vínculo no se puede escribir, la respuesta es `500` y el perfil queda sin
  vínculo: nadie lo puede listar, abrir ni reclamar (falla cerrado), y el alta se reintenta entera.
- El perfil nace `PENDING`, con `acceptedTermsAt` y `termsVersion` en `null`: el consentimiento lo
  da el titular en HU-009, no el familiar que lo administra.
- El perfil lleva un correo sintético único `senior+<uuid12>@seniors.local` y `passwordHash` nulo.

Errores (todos `400`, con `error.code` para que la pantalla marque el campo):

| `error.code` | Cuándo |
| --- | --- |
| `INVALID_NAME` | El nombre falta, no es texto o queda con menos de 3 caracteres después de normalizar (máximo 120). |
| `INVALID_TIMEZONE` | La zona no es una zona IANA válida. No se cae a Bogotá en silencio; si falta, viene vacía o solo con espacios, sí se guarda `America/Bogota`. |
| `INVALID_BLOOD_TYPE` | El grupo sanguíneo no está en la enumeración cerrada `A+ A- B+ B- AB+ AB- O+ O-` (es obligatorio). Si el campo falta o no es texto, la respuesta es `INVALID_BODY` con `details.field`. |
| `INVALID_ALLERGIES` | Una lista tiene más de 20 ítems, o un ítem queda vacío o con más de 80 caracteres. |
| `INVALID_CONDITIONS` | Ídem para las condiciones. |
| `INVALID_MEDICATIONS` | Ídem para la medicación. |
| `INVALID_EMERGENCY_CONTACT` | El nombre queda fuera de 3 a 120 caracteres, o el teléfono fuera de 6 a 20 caracteres con `+`, dígitos, espacios o guiones. |

Además, cuando un campo no es del tipo esperado (una zona que no es texto ni `null`, una lista que
no es array de textos, un contacto que no es objeto), responde `400 INVALID_BODY` con
`details.field` indicando el campo.

## GET /api/seniors — HU-005

Devuelve solo los perfiles con un vínculo `ACTIVE` con el familiar autenticado (los `PENDING` y
los `LINKED` incluidos), del más reciente al más antiguo.

```http
200 OK

{ "seniors": [ { "id": "...", "fullName": "Rosa Pérez", "timezone": "America/Bogota",
                 "linkStatus": "PENDING", "createdAt": "..." } ] }
```

Sin perfiles: `{ "seniors": [] }`, no un `404`.

## GET /api/seniors/:id — HU-005

```http
200 OK   → el mismo objeto público del alta
404      → { "error": { "code": "SENIOR_NOT_FOUND", "message": "No encontramos ese perfil" } }
```

Un perfil de **otro** familiar, un `id` inexistente, un `id` mal formado (no son 24
caracteres hexadecimales) y un `id` que corresponde a un `CAREGIVER` devuelven el **mismo**
`404`. Distinguirlos confirmaría que un id existe: es exactamente la filtración que la regla
de propiedad evita.

## GET /api/seniors/:id/medical — HU-007

```http
200 OK

{
  "bloodType": "O+",
  "allergies": ["penicilina"],
  "conditions": ["hipertensión"],
  "medications": ["losartán"],
  "emergencyContact": { "fullName": "Ana Pérez", "phone": "+573001234567" }
}
```

Esta ruta existe para que «la proyección pública excluye los campos médicos sensibles salvo para
el familiar vinculado» sea observable por HTTP no solo un deseo: el detalle
`GET /api/seniors/:id` queda intacto (el mismo objeto del alta, sin ficha), y la ficha médica se
lee por una ruta y una proyección propias (`toSeniorMedicalRecord`). Responde `200` solo para un
familiar vinculado; en cualquier otro caso responde el mismo `404 SENIOR_NOT_FOUND` que el
detalle: ajeno, inexistente, mal formado o el `id` de un `CAREGIVER`.

## GET /api/seniors/:id/caregivers — HU-005

```http
200 OK

{ "caregivers": [ { "id": "…", "fullName": "Juan Gómez", "role": "OWNER", "linkedAt": "…" },
                   { "id": "…", "fullName": "María López", "role": "FAMILY", "linkedAt": "…" } ] }
```

Enumera los N familiares del adulto mayor (solo vínculos `ACTIVE`), del vínculo más antiguo al
más nuevo. El `role` es el informativo del vínculo. El listado solo lo ve un familiar vinculado
al perfil; en cualquier otro caso responde el mismo `404 SENIOR_NOT_FOUND`.

## Sin PIN, y por qué

- El contrato **no acepta ni devuelve PIN**. El anteproyecto exige la ausencia de credenciales para
  el adulto mayor (decisión L3 del backlog): un PIN es una credencial, y cuatro dígitos son 10 000
  combinaciones, defendibles solo con límite de intentos por perfil.
- El perfil tampoco guarda `pinHash`. Quien agregue ese campo reabre una decisión ya cerrada.
- La protección del acceso es el vínculo del dispositivo con token de un solo uso más el
  consentimiento registrado, no un secreto que la persona deba recordar.

## Zona horaria

Se valida contra `Intl.DateTimeFormat` (base IANA del runtime). El valor se guarda recortado
y se devuelve tal cual se guardó. La zona decide a qué hora vence cada rutina y cada recordatorio,
así que un valor inventado no puede convertirse en Bogotá sin que nadie se entere.

## Estado de vinculación

`linkStatus` tiene dos valores:

- `PENDING` — el familiar cargó el perfil; el teléfono del adulto mayor todavía no lo reclamó.
- `LINKED` — el teléfono canjeó el token del QR de vinculación. Solo el canje lo escribe; el panel
  nunca lo marca a mano.

El alta escribe `linkStatus: 'PENDING'` siempre, así que ningún perfil del rewrite queda sin el
campo. Si un documento llegara sin él (escrito a mano o por una versión anterior del modelo), el
adaptador lo lee como `PENDING`: un perfil del que no consta el vínculo no se trata como vinculado.

Consecuencias:

- El listado del panel incluye los pendientes: el familiar administra perfiles que aún no
  reclamó su dueño. Un endpoint futuro que alimente acciones del adulto mayor tendrá que filtrar
  los `PENDING`.
- Un perfil `PENDING` no puede recolectar actividades, SOS ni GPS: el consentimiento lo da el
  titular al aceptar en su app (HU-009), no el familiar que lo administra. El alta deja
  `acceptedTermsAt` y `termsVersion` en `null` a propósito.

## Pendientes que esta HU deja anotados

- Canje del QR y transición `PENDING → LINKED` (HU-009). El canje nunca crea el perfil: lo crea
  el familiar acá.
- Invitación de otro familiar con token propio (HU-011, L11 del backlog). El dominio ya modela el
  vínculo `FAMILY` y el repositorio ya sabe escribirlo de forma idempotente, pero no hay un
  contrato HTTP que lo use.
- Edición de la ficha médica por el familiar y su consentimiento separado (HU-012 y HU-025).
- Límite de intentos del canje de QR, con bloqueo por perfil (HU-009).
