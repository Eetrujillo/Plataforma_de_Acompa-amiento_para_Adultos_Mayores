# Pairing API — contrato del QR de vinculación

Cómo el familiar emite el QR de un perfil y cómo el teléfono del adulto mayor lo canjea (HU-006,
rework QR-only de L9). **No existe un código legible por una persona**: la credencial es un token
opaco de 32 bytes en base64url (43 caracteres) que viaja únicamente dentro del QR. No se muestra en
pantalla, no se dicta, no se tipea. Este contrato es seguridad, no comodidad.

## POST /api/pairing/qr — HU-006

Requiere sesión de un usuario con rol `CAREGIVER`.

```http
POST /api/pairing/qr
{ "seniorId": "507f1f77bcf86cd799439011" }
```

```http
201 Created

{
  "expiresAt": "2026-11-06T23:10:00.000Z",
  "seniorId": "507f1f77bcf86cd799439011",
  "qrCodeDataUrl": "data:image/png;base64,..."
}
```

El token **no viaja en la respuesta**: la única copia en claro está dentro de `qrCodeDataUrl`. El
payload del QR es un sobre con el token, sin URL y sin datos del adulto mayor:

```json
{ "type": "senior-pairing", "token": "«43 caracteres base64url»" }
```

| `error.code` | Status | Cuándo |
| --- | --- | --- |
| `SENIOR_ID_REQUIRED` | 400 | Falta `seniorId` o no tiene forma de id de Mongo (24 hex). |
| `SENIOR_NOT_FOUND` | 404 | El perfil no existe, es de otro familiar o es una cuenta `CAREGIVER`. |
| `SENIOR_ALREADY_LINKED` | 409 | El perfil ya figura vinculado (o es anterior a HU-005, sin `linkStatus`). |
| `PAIRING_QR_UNAVAILABLE` | 503 | No se pudo codificar la imagen del QR. |

`PAIRING_QR_UNAVAILABLE` significa que **no hay credencial**: el pedido se arma completo (token y
imagen) antes de tocar la base, así que no se invalidó ningún token vigente y se puede reintentar.
La emisión no devuelve un `201` con `qrCodeDataUrl: null`: sin imagen no hay nada que mostrar.

## Vigencia

24 horas por defecto (`PAIRING_TTL_MINUTES`, default `1440`, la constante
`PAIRING_TOKEN_TTL_MINUTES` de `domain/pairingToken.js`). Se calcula al emitir y se devuelve en
`expiresAt`: el cliente muestra esa fecha, no un número escrito a mano.

## Invalidación de tokens previos

Al emitir para un perfil, **todos** los tokens anteriores no usados de ese perfil quedan marcados
con `invalidatedAt` **antes** de crear el nuevo. Consecuencias deliberadas:

- Un token reemplazado no se puede canjear y responde igual que uno vencido: quien tiene el QR no
  puede deducir si venció o si alguien pidió otro.
- `usedAt` significa "canjeado"; `invalidatedAt`, "reemplazado". Son hechos distintos y se guardan
  distinto.
- Si la creación del token nuevo falla, el anterior ya quedó inválido (falla cerrado): el familiar
  pide otro, nadie queda con un QR viejo vivo.
- Un fallo **del codificador** ocurre antes de la invalidación (ver `PAIRING_QR_UNAVAILABLE`).

## POST /api/pairing/redeem — HU-006 (público)

El teléfono del adulto mayor no tiene sesión todavía: el token del QR es la credencial.

```http
POST /api/pairing/redeem
{ "token": "«43 caracteres base64url»" }
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

El cuerpo sólo lleva `token`. El canje **no acepta datos de la ficha** (`fullName`, `phone`): el
perfil ya existe y lo administra el familiar, así que canjear un QR nunca edita ni crea un senior.

El objeto `senior` conserva los campos que la app publicada ya consume (`toPublicUser`) y suma
`linkStatus` y `timezone`. No pierde campos: se agregó, no se reemplazó.

| `error.code` | Status | Cuándo |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Token con forma inválida, vencido o invalidado. Mismo mensaje genérico en los tres casos. |
| `NOT_FOUND` | 404 | El token está bien formado pero la base no lo conoce. |
| `CONFLICT` | 409 | Ya fue canjeado, o el perfil del token ya no es del mismo familiar. |
| `SENIOR_ALREADY_LINKED` | 409 | El perfil del token ya está vinculado: el QR no se quema. |

Los mensajes son los de `domain/pairingToken.js`, en inglés porque los consume la app móvil y no se
muestran en el panel del cuidador: `pairing token is invalid or expired`, `pairing token not found`,
`pairing token already used`. `SENIOR_ALREADY_LINKED` sí está en español porque también lo muestra
el panel.

## Canje de un solo uso (atómico)

El reclamo es una escritura condicional: `usedAt: null`, `invalidatedAt: null` y vigente, en una
sola operación. Solo el pedido que gana la carrera sigue; el otro recibe el mismo 409 genérico. Sin
esto, dos pedidos simultáneos con el mismo QR vinculaban dos veces (el mismo defecto que HU-004
corrigió para el token de reseteo).

Antes de reclamar, el canje valida que el perfil siga existiendo, que **siga siendo del dueño del
token** y que siga pendiente: un perfil ya vinculado no debe quemar un token que todavía sirve. Un
perfil ajeno responde igual que un token consumido, para no confirmar que el id existe. Si la
escritura del perfil falla **después** del reclamo, el token ya quedó quemado (falla cerrado) y el
familiar genera otro.

## GET /api/pairing/seniors — HU-005

Requiere sesión de `CAREGIVER`. Devuelve sólo los perfiles **vinculados** del familiar (los que
alimentan actividades y SOS), con `{ "seniors": [ ... ] }`. Sin cambios en esta HU.

## Lo que este contrato NO cubre todavía

- Escaneo del QR en el teléfono del adulto mayor: HU-007. Hoy el backend ya expone `/redeem`, pero
  no hay escáner en el frontend; la pantalla del teléfono sin vincular sólo explica qué falta.
- Límite de intentos del canje y del PIN: HU-007. Con un token de 32 bytes el espacio de búsqueda
  deja de ser el problema (10^6 ya no existe), así que el límite queda como defensa en profundidad.
- Consentimiento del titular antes de compartir actividades, SOS o GPS: HU-008.

Ver también `skills/pairing-generator.md` (reglas del token) y `skills/qr-adapter.md` (payload y
presentación del QR).
