# Seniors API — contrato del módulo seniors

Perfil del adulto mayor creado por el familiar que lo administra (HU-005). El senior es un
`User` con `role: SENIOR` y `caregiverId` del familiar dueño; no tiene correo propio ni
contraseña: se vincula escaneando el QR que genera su familiar (HU-006/HU-007). El QR lleva un
token opaco de un solo uso y 24 h de vigencia; no hay código que tipear.

Todas las rutas exigen `Authorization: Bearer <jwt>` de un usuario con rol `CAREGIVER`.
Sin token: `401`. Con rol `SENIOR`: `403`.

## POST /api/seniors — HU-005

```http
POST /api/seniors
Content-Type: application/json

{ "fullName": "Rosa Pérez", "pin": "4821", "timezone": "America/Bogota" }
```

`timezone` es opcional: si falta, viene vacía o `null`, se guarda `America/Bogota`.

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

Errores (todos `400`, con `error.code` para que la pantalla marque el campo):

| `error.code` | Cuándo |
| --- | --- |
| `INVALID_PIN` | El PIN no es exactamente 4 dígitos ASCII (`"123"`, `"12345"`, `"12a4"`, `" 1234"`, dígitos de otro alfabeto). |
| `INVALID_NAME` | El nombre falta, no es texto o queda con menos de 3 caracteres después de normalizar. |
| `INVALID_TIMEZONE` | La zona no es una zona IANA válida. No se cae a Bogotá en silencio. |

El `caregiverId` **nunca** viaja en el cuerpo: lo pone el servidor desde la sesión. Un
cliente no puede crear un perfil bajo otra cuenta.

## GET /api/seniors — HU-005

Devuelve solo los perfiles del familiar autenticado.

```http
200 OK

{ "seniors": [ { "id": "...", "fullName": "Rosa Pérez", "timezone": "America/Bogota",
                 "linkStatus": "PENDING", "createdAt": "..." } ] }
```

Sin perfiles: `{ "seniors": [] }`, no un `404`.

## GET /api/seniors/:id — HU-005

```http
200 OK   → el mismo objeto del alta
404      → { "error": { "code": "SENIOR_NOT_FOUND", "message": "No encontramos ese perfil" } }
```

Un perfil de **otro** familiar, un `id` inexistente, un `id` mal formado (no son 24
caracteres hexadecimales) y un `id` que corresponde a un `CAREGIVER` devuelven el **mismo**
`404`. Distinguirlos confirmaría que un id existe: es exactamente la filtración que la regla
de propiedad evita.

## Propiedad del perfil (seguridad)

La regla vive en el caso de uso, no en el controlador ni en la consulta del panel:

- La lista se acota en la consulta (`caregiverId` + `role: SENIOR`), así el perfil ajeno no
  se carga.
- El detalle compara `senior.caregiverId === caregiverId` con el id que llega **por
  parámetro**; el caso de uso no lee `req`.
- El `id` se valida en forma antes de ir a la base: si llegara a Prisma un id que no es un
  `ObjectId`, la respuesta sería un `500` en vez del `404` prometido.

## PIN: qué se guarda y qué no

- Se acepta solo `/^\d{4}$/` y se valida **antes** de hashear: un pedido rechazado no gasta
  bcrypt ni escribe nada.
- Se guarda `pinHash` con bcrypt, costo 12. El texto plano no se persiste, no se loguea y no
  aparece en ninguna respuesta: la proyección pública (`toPublicSenior`) no incluye el campo.
- El PIN no se puede consultar. Si el adulto mayor lo olvida, el familiar lo vuelve a definir;
  no hay "recordarme el PIN" ni envío por correo o SMS.
- Un PIN de 4 dígitos son 10 000 combinaciones: el hash encarece el ataque offline, pero la
  defensa real es limitar intentos. Ese límite se implementa en HU-007, junto con la primera
  verificación de PIN del servidor. Ver `skills/bcrypt-pin.md`.

## Zona horaria

Se valida contra `Intl.DateTimeFormat` (base IANA del runtime). El valor se guarda recortado
y se devuelve tal cual se guardó. La zona decide a qué hora vence cada rutina y cada recordatorio,
así que un valor inventado no puede convertirse en Bogotá sin que nadie se entere.

## Estado de vinculación

`linkStatus` tiene dos valores:

- `PENDING` — el familiar cargó el perfil; el teléfono del adulto mayor todavía no lo reclamó.
- `LINKED` — el teléfono canjeó el token del QR de vinculación, o el perfil es anterior a HU-005
  (cuando vincular era el único camino de alta, la ausencia del campo significa vinculado).

Consecuencias, ya vigentes:

- `GET /api/pairing/seniors` (el selector del panel, que alimenta las actividades) devuelve
  solo perfiles no pendientes.
- Un perfil `PENDING` no puede recolectar actividades, SOS ni GPS: el consentimiento lo da el
  titular al vincular su app (HU-008), no el familiar que lo administra. El alta de HU-005 deja
  `acceptedTermsAt` y `termsVersion` en `null` a propósito.

## Pendientes que esta HU deja anotados

- Límite de intentos del PIN (HU-007), con bloqueo por perfil.
- Transición `PENDING → LINKED` en el canje del token del QR (HU-006/HU-007) y un evento para que
  el panel se actualice sin recargar. El canje nunca crea el perfil: lo crea el familiar acá.
- Cambio de PIN por el familiar: hoy solo se define al crear el perfil.
- `GET /api/pairing/seniors` y `GET /api/seniors` listan senior con criterios distintos
  (vinculados vs todos). Si se unifican, el selector de actividades tiene que seguir filtrando.
