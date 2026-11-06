# Pairing API — contrato del código de vinculación

Cómo el familiar emite el código y cómo el teléfono del adulto mayor lo canjea (HU-006). El código
es la credencial con la que un dispositivo reclama un perfil, así que este contrato es seguridad,
no comodidad.

## POST /api/pairing/codes — HU-006

Requiere sesión de un usuario con rol `CAREGIVER`.

```http
POST /api/pairing/codes
{ "seniorId": "507f1f77bcf86cd799439011" }
```

```http
201 Created

{
  "code": "482913",
  "expiresAt": "2026-11-06T23:10:00.000Z",
  "seniorId": "507f1f77bcf86cd799439011",
  "qrCodeDataUrl": "data:image/png;base64,..."
}
```

| `error.code` | Status | Cuándo |
| --- | --- | --- |
| `SENIOR_ID_REQUIRED` | 400 | Falta `seniorId` o no tiene forma de id de Mongo (24 hex). |
| `SENIOR_NOT_FOUND` | 404 | El perfil no existe, es de otro familiar o es una cuenta `CAREGIVER`. |
| `SENIOR_ALREADY_LINKED` | 409 | El perfil ya figura vinculado (o es anterior a HU-005, sin `linkStatus`). |
| `PAIRING_CODE_UNAVAILABLE` | 503 | No se pudo asignar un código único tras varios intentos. |

## Vigencia

24 horas por defecto (`PAIRING_TTL_MINUTES`, default `1440`). Se calcula al emitir y se devuelve en
`expiresAt`: el cliente muestra esa fecha, no un número escrito a mano.

## Invalidación de códigos previos

Al emitir un código para un perfil, **todos** los códigos anteriores no usados de ese perfil quedan
marcados con `invalidatedAt` **antes** de crear el nuevo. Consecuencias deliberadas:

- Un código reemplazado no se puede canjear y responde igual que uno vencido: quien lo tiene no
  puede deducir si venció o si alguien pidió otro.
- `usedAt` significa "canjeado"; `invalidatedAt`, "reemplazado". Son hechos distintos y se guardan
  distinto.
- Si la creación del código nuevo falla, el anterior ya quedó inválido (falla cerrado): el familiar
  pide otro, nadie queda con un código viejo vivo.

## POST /api/pairing/link — HU-006 (público)

La app móvil no tiene sesión todavía: el código es la credencial.

```http
POST /api/pairing/link
{ "code": "482913", "fullName": "Rosa Pérez", "phone": "+573001112233" }
```

```http
201 Created

{
  "token": "<jwt>",
  "senior": { "id": "...", "email": "senior+...@seniors.local", "fullName": "Rosa Pérez",
              "role": "SENIOR", "phone": null, "caregiverId": "...", "emailVerified": true,
              "createdAt": "...", "linkStatus": "LINKED", "timezone": "America/Bogota" }
}
```

El objeto `senior` conserva los campos que la app publicada ya consume (`toPublicUser`) y suma
`linkStatus` y `timezone`. No pierde campos: se agregó, no se reemplazó.

| `error.code` | Status | Cuándo |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Formato inválido, vencido o invalidado. Mismo mensaje genérico en los tres casos. |
| `NOT_FOUND` | 404 | El código no existe. |
| `CONFLICT` | 409 | Ya fue canjeado, o el perfil ya está vinculado. |

## Canje de un solo uso (atómico)

El reclamo es una escritura condicional: `usedAt: null`, `invalidatedAt: null` y vigente, en una sola
operación. Solo el pedido que gana la carrera sigue; el otro recibe el mismo 409 genérico. Sin esto,
dos pedidos simultáneos con el mismo código creaban **dos** seniors (el mismo defecto que HU-004
corrigió para el token de reseteo).

Antes de reclamar, el canje valida que el perfil siga existiendo, que **siga siendo del dueño del
código** y que siga pendiente: un perfil ya vinculado no debe quemar un código que todavía sirve.
Un perfil ajeno responde igual que un código consumido, para no confirmar que el id existe. Si la
escritura del perfil falla **después** del reclamo, el código ya quedó quemado (falla cerrado) y el
familiar genera otro.

## Las dos ramas del canje

| Código | Qué hace |
| --- | --- |
| Con `seniorId` (HU-006) | Pasa **ese** perfil a `LINKED` y emite el token para él. No crea un senior nuevo y no pisa `fullName`/`phone`: el teléfono no edita la ficha. |
| Sin `seniorId` (legacy) | Comportamiento anterior: crea el senior y lo deja `LINKED`. **Transitorio**: existe para que un APK ya publicado con un código en la mano siga funcionando. HU-007 lo retira cuando la app exija el perfil. No entran en la invalidación por perfil (no tienen `seniorId`): mueren por su propia vigencia. |

## Lo que este contrato NO cubre todavía

- Límite de intentos del código (5 fallos / 15 min) y del PIN: HU-007. Sin eso, un código de 6
  dígitos (10^6) es adivinable con paciencia; hoy la única defensa es la vigencia de 24 h y la
  invalidación al pedir uno nuevo.
- Consentimiento del titular antes de compartir actividades, SOS o GPS: HU-008.
- Si el QR no se puede generar, la emisión responde igual: `201` con `qrCodeDataUrl: null`. El QR es
  un atajo, no la credencial (`skills/qr-adapter.md`).
