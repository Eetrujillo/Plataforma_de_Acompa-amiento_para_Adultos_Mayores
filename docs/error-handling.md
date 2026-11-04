# Manejo de errores — contrato del backend

Qué devuelve el backend cuando algo falla, qué se loguea del lado servidor y cómo usar el id de
request para encontrar la causa. Código: `backend/src/shared/middlewares/errorHandler.js`,
`backend/src/shared/middlewares/requestContext.js`, `backend/src/app.js` y `backend/src/server.js`.

## Forma de la respuesta

Todo error responde con este cuerpo:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "El correo no es válido" } }
```

`details` aparece **solo** cuando un error operativo lo trae cargado (por ejemplo, una validación
campo por campo). Nunca se agrega a los errores enmascarados.

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": { "email": "..." } } }
```

## Id de correlación (`X-Request-Id`)

Cada request recibe un id antes de llegar a cualquier ruta:

- Si el cliente manda `X-Request-Id` y cumple `^[A-Za-z0-9._-]{8,64}$`, se respeta tal cual.
- Si no lo manda o no cumple el patrón, se genera uno (`randomUUID`).
- El id **siempre** vuelve en el header `X-Request-Id` de la respuesta.
- En los `5xx`, el cuerpo agrega `error.requestId`. En los `4xx` **no**: el cuerpo mantiene su forma
  habitual.

```json
{ "error": { "code": "INTERNAL_ERROR", "message": "Unexpected server error", "requestId": "3f2b..." } }
```

## Tabla de status y código

| Status | `error.code` | Cuándo |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | falta un campo o no cumple su regla |
| `400` | `EMAIL_ALREADY_REGISTERED` | el correo ya tiene cuenta |
| `400` | `INVALID_JSON` | el cuerpo no es JSON válido (`entity.parse.failed`) |
| `401` | `UNAUTHORIZED` | falta o no sirve el token de sesión |
| `403` | `EMAIL_NOT_VERIFIED` | la cuenta existe pero no confirmó el correo |
| `404` | `NOT_FOUND` | ruta o recurso inexistente |
| `409` | `CONFLICT` | el estado actual impide la operación |
| `413` | `PAYLOAD_TOO_LARGE` | el cuerpo supera los `100kb` (`entity.too.large`) |
| `500` | `INTERNAL_ERROR` | error inesperado, o error de Prisma sin traducción |
| `503` | `DATABASE_NOT_READY` | Prisma `P2031`: MongoDB no acepta escrituras (replica set sin iniciar) |
| `503` | `DATABASE_UNAVAILABLE` | Prisma `P2010` de conexión: no se pudo contactar la base |

Un JSON inválido y un cuerpo demasiado grande se traducen a `400`/`413` antes de caer en el `500`
enmascarado. Las fallas de Prisma que no están en la tabla se responden como `500 INTERNAL_ERROR`.

## Lo que nunca llega al cliente

El cliente **no** recibe stack, rutas de archivo, query, ni mensajes internos de Prisma o del driver.
Un error no operativo se enmascara como `500 INTERNAL_ERROR` con el mensaje genérico
`Unexpected server error`.

Del lado servidor se loguea, **solo para los `5xx`**:

```js
logger.error('[error]', {
  requestId, method, url, status, code, durationMs,
  error // el error completo, con stack
})
```

Los `4xx` operativos no se loguean como error.

## Caídas del proceso

`unhandledRejection` y `uncaughtException` se manejan igual:

1. Se loguea el nombre, el mensaje y el stack del error.
2. Se ejecuta el mismo apagado ordenado que con `SIGINT`/`SIGTERM`: cerrar Socket.IO, cerrar el
   servidor HTTP y desconectar Prisma.
3. El proceso sale con código `1`.
4. Un watchdog de `5s` fuerza la salida con `1` si el apagado no termina; una segunda caída durante
   el apagado también sale de inmediato con `1`.

Así el proceso no queda vivo en un estado indeterminado y la caída deja rastro.

## Cómo lo usa quien opera

1. La persona usuaria reporta el incidente con el `error.requestId` que vio en pantalla.
2. Se busca ese id en los logs del backend:

```bash
docker compose logs backend | grep <id>
```

La línea `[error]` trae método, ruta, status, código, duración y el error completo con stack, que es
lo que permite ubicar la causa sin adivinar.
