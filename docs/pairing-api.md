# Pairing API — contrato del QR de vinculación

Cómo el familiar emite el QR de un perfil y cómo el teléfono del adulto mayor lo canjea (HU-008 a HU-010,
rework QR-only de L9). **No existe un código legible por una persona**: la credencial es un token
opaco de 32 bytes en base64url (43 caracteres) que viaja únicamente dentro del QR. No se muestra en
pantalla, no se dicta, no se tipea. Este contrato es seguridad, no comodidad.

## POST /api/pairing/qr — HU-008 (emisión) y HU-010 (regeneración)

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

La respuesta de emisión lleva `Cache-Control: no-store`: el QR es una credencial viva y no se cachea
en intermediarios ni en disco.

## Vigencia

24 horas por defecto (`PAIRING_TTL_MINUTES`, default `1440`, la constante
`PAIRING_TOKEN_TTL_MINUTES` de `domain/pairingToken.ts`). Se calcula al emitir y se devuelve en
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

Nota sobre la concurrencia: dos emisiones simultáneas para el mismo perfil pueden dejar dos tokens
vivos, porque `invalidar → crear` son dos escrituras y no hay transacción. El caso lo cierra el
canje de HU-009: un perfil que ya está vinculado responde `SENIOR_ALREADY_LINKED` **sin quemar** el
token, así que en cuanto se canjea el primero, el segundo QR simplemente deja de servir. Endurecerlo
sería una escritura condicional única, anotada como posible para HU-009.

## POST /api/pairing/redeem — HU-009 (público)

El teléfono del adulto mayor no tiene sesión todavía: el token del QR es la credencial.

```http
POST /api/pairing/redeem
{ "token": "«43 caracteres base64url»", "acceptedTerms": true }
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

El cuerpo lleva `token` más `acceptedTerms: true` — la bandera de consentimiento (Ley 1581): sin
ella el canje responde `400 TERMS_NOT_ACCEPTED` antes de mirar la base (§4 de la skill `ley-1581`).
El resto del cuerpo no importa para la ficha: el canje **no acepta datos de la ficha**
(`fullName`, `phone`) ni campos de evidencia (`acceptedTermsAt`, `termsVersion`, `ipAddress`). El
perfil ya existe y lo administra el familiar, así que canjear un QR nunca edita ni crea un senior;
y la evidencia la arma el servidor con el reloj, `TERMS_VERSION` y la IP del pedido — el cliente
no la inventa.

El objeto `senior` conserva los campos que la app publicada ya consume (`toPublicUser`) y suma
`linkStatus` y `timezone`. No pierde campos: se agregó, no se reemplazó.

| `error.code` | Status | Cuándo |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Token con forma inválida, vencido o invalidado. Mismo mensaje genérico en los tres casos. |
| `NOT_FOUND` | 404 | El token está bien formado pero la base no lo conoce. |
| `CONFLICT` | 409 | Ya fue canjeado, o el perfil del token ya no es del mismo familiar. |
| `SENIOR_ALREADY_LINKED` | 409 | El perfil del token ya está vinculado: el QR no se quema. |
| `TOO_MANY_REQUESTS` | 429 | Se superó el límite de intentos del canje por IP (`REDEEM_IP_MAX_ATTEMPTS`, default 20, por ventana móvil de `REDEEM_IP_WINDOW_MINUTES`, default 15). También cuentan los intentos con token desconocido; el intento bloqueado no se cuenta. El límite es por proceso: con más de una réplica del backend es N por ventana por réplica. |
| `ACCOUNT_LOCKED` | 429 | Cinco fallos consecutivos del canje sobre el mismo perfil lo bloquean `REDEEM_LOCKOUT_MINUTES` (default 15 minutos). `details.retryAfterSeconds` trae los segundos restantes, y el intento que dispara el bloqueo ya responde 429. El intento bloqueado no se cuenta. |

Los mensajes del canje viven en `backend/src/modules/pairing/application/pairingMessages.ts`, el
mismo módulo que concentra los de la emisión. Están en inglés porque los consume la app móvil y no
se muestran en el panel del cuidador: `pairing token is invalid or expired`,
`pairing token not found`, `pairing token already used`. `SENIOR_ALREADY_LINKED` sí está en
español porque también lo muestra el panel.

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

La transición `PENDING → LINKED` y la evidencia del consentimiento viajan en la MISMA escritura
condicional: `acceptedTermsAt` (reloj del servidor), `termsVersion` (`TERMS_VERSION`, default
`1.0`) y `ipAddress` (la IP del pedido, sólo cuando es una IP válida — `evidenceIp`). O el perfil
queda vinculado con evidencia, o no queda nada. Quién escribe `LINKED` vive en los detalles de
`docs/seniors-api.md`.

## Reintento del canje tras una respuesta perdida (REDEEM_RECOVERY_MINUTES)

Si la respuesta `201` nunca llegó al teléfono —conexión caída, app cerrada—, el reintento con el
MISMO token vuelve a responder `201` con una sesión nueva de `SENIOR` mientras el perfil esté
`LINKED`, siga del mismo familiar y el reintento llegue dentro de `REDEEM_RECOVERY_MINUTES`
(default 15) desde `usedAt`. Es el replay de la recuperación (D15.3): no crea vínculo, no escribe
evidencia, no toca contadores — el token ya estaba quemado y así queda, y el reintento pasa por
el mismo límite por IP y el mismo bloqueo por perfil (un perfil bloqueado responde `429` aunque el
token sea recuperable); fuera de la ventana recibe el `409` de siempre.

## Límite de intentos del canje

Con un token de 32 bytes el espacio de búsqueda deja de ser el problema —el viejo código de 6
dígitos tenía 10^6 combinaciones y ya no existe—, así que el límite queda como defensa en
profundidad:

- **Por perfil (bloqueo persistido):** 5 fallos consecutivos bloquean los canjes de ese perfil.
  Umbral `REDEEM_MAX_ATTEMPTS` (default 5) y ventana `REDEEM_LOCKOUT_MINUTES` (default 15). El
  contador y la fecha viven en el propio documento del adulto mayor (`redeemFailedAttempts` /
  `redeemLockedUntil`), contados por el adaptador en una escritura atómica con la misma forma del
  bloqueo de login. Un canje exitoso limpia la racha, y un bloqueo ya vencido la reinicia.
- **Por IP (en memoria, por proceso):** `REDEEM_IP_MAX_ATTEMPTS` (default 20) intentos fallidos
  por ventana móvil de `REDEEM_IP_WINDOW_MINUTES` (default 15). Cuenta también los intentos con
  token desconocido, para que el endpoint no sea un oráculo de qué QR existe. La ventana es móvil
  con reloj inyectado y el intento bloqueado no se registra. El almacenamiento es del proceso:
  con más de una réplica del backend el límite real es N por ventana por réplica.
- Los bloqueos no extienden la ventana (contar los rechazos la haría eterna) y un intento
  bloqueado nunca quema un QR todavía usable.

## GET /api/seniors — HU-005

Requiere sesión de `CAREGIVER`. Devuelve sólo los perfiles del familiar con un vínculo `ACTIVE`
(los `PENDING` y los `LINKED` incluidos), con `{ "seniors": [ ... ] }`. El contrato completo está en
`docs/seniors-api.md`: el listado ya existía y esta HU no lo cambia. La ruta vive bajo
`/api/seniors`, no bajo `/api/pairing`.

## Lo que este contrato NO cubre todavía

- Escaneo del QR en el teléfono del adulto mayor: HU-009. La pantalla de escaneo, la validación
  local del sobre, el consentimiento en pantalla y el guardado cifrado del token de dispositivo
  (MMKV) son de la app; el endpoint de canje ya existe y el contrato es el de arriba.
- Desvinculación y reasignación del dispositivo (HU-012): estos QR sólo vinculan.

Ver también `.agents/skills/project/pairing-generator/SKILL.md` (reglas del token) y
`.agents/skills/project/qr-adapter/SKILL.md` (payload y presentación del QR).
