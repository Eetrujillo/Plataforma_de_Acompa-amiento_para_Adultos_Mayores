# HU-008 — Emisión del QR de vinculación

Rama: `chore/deploy-mongoose`. Alcance: sólo el backend de la emisión (`POST /api/pairing/qr`); el
escaneo y el canje son HU-009. Código: `backend/src/modules/pairing/` (nuevo),
`backend/src/shared/models/PairingToken.ts`, composición en `backend/src/app.ts` y
`backend/src/server.ts`, config en `backend/src/config/env.ts`.

## Specs

**S1** (HU-008) — «Genera un QR de un solo uso con vigencia de 24 horas.»

**S2** (HU-008) — «El payload es `{"type":"senior-pairing","token":"…"}`: el token nunca aparece como
texto en pantalla.»

**S3** (HU-008) — «Impide generar un QR si el perfil ya figura vinculado.»

**S4** (HU-008) — «Si el codificador del QR falla, responde 503 y **no** invalida el QR anterior.»

**S5** (HU-008) — «El token es de 32 bytes en base64url (43 caracteres) y se persiste solo su
`sha256`.»

**S6** (HU-008) — «El token no aparece en el cuerpo de la respuesta ni en los logs: la única copia en
claro es la imagen del QR.»

**S7** (HU-008) — «Solo existe un QR activo por perfil: emitir invalida los anteriores no usados.»

**S8** (HU-008) — «Responde 400 sin `seniorId`, 404 con perfil ajeno o inexistente y 409 si el perfil
ya está vinculado.»

**S9** (`docs/pairing-api.md:8-27`) — Contrato de la emisión, con el cuerpo exacto:

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

**S10** (`docs/pairing-api.md:24`) — «Requiere sesión de un usuario con rol `CAREGIVER`.»

**S11** (`docs/pairing-api.md:29`) — «El token **no viaja en la respuesta**: la única copia en claro
está dentro de `qrCodeDataUrl`. El payload del QR es un sobre con el token, sin URL y sin datos del
adulto mayor.»

**S12** (`docs/pairing-api.md:33-38`) — Tabla de errores, con los códigos y los status exactos:

| `error.code` | Status | Cuándo |
| --- | --- | --- |
| `SENIOR_ID_REQUIRED` | 400 | Falta `seniorId` o no tiene forma de id de Mongo (24 hex). |
| `SENIOR_NOT_FOUND` | 404 | El perfil no existe, es de otro familiar o es una cuenta `CAREGIVER`. |
| `SENIOR_ALREADY_LINKED` | 409 | El perfil ya figura vinculado (o es anterior a HU-005, sin `linkStatus`). |
| `PAIRING_QR_UNAVAILABLE` | 503 | No se pudo codificar la imagen del QR. |

**S13** (`docs/pairing-api.md:41-44`) — «`PAIRING_QR_UNAVAILABLE` significa que **no hay
credencial**: el pedido se arma completo (token y imagen) antes de tocar la base, así que no se
invalidó ningún token vigente y se puede reintentar. La emisión no devuelve un `201` con
`qrCodeDataUrl: null`: sin imagen no hay nada que mostrar.»

**S14** (`docs/pairing-api.md:46-49`) — «24 horas por defecto (`PAIRING_TTL_MINUTES`, default `1440`,
la constante `PAIRING_TOKEN_TTL_MINUTES` de `domain/pairingToken.js`). Se calcula al emitir y se
devuelve en `expiresAt`.»

**S15** (`docs/pairing-api.md:52-62`) — Invalidación de tokens previos, textual: «Al emitir para un
perfil, **todos** los tokens anteriores no usados de ese perfil quedan marcados con `invalidatedAt`
**antes** de crear el nuevo.» · «`usedAt` significa "canjeado"; `invalidatedAt`, "reemplazado". Son
hechos distintos y se guardan distinto.» · «Si la creación del token nuevo falla, el anterior ya
quedó inválido (falla cerrado)». · «Un fallo **del codificador** ocurre antes de la invalidación».

**S16** (`pairing-generator:1 §1`) — Token opaco «32 bytes de azar criptográfico en base64url sin
relleno: 43 caracteres, 256 bits (`/^[A-Za-z0-9_-]{43}$/`). Se rechaza cualquier otra cosa antes de
hashear.» En la base se guarda «sólo `sha256(token)` (`tokenHash`)».

**S17** (`pairing-generator §4`) — Orden de la emisión: «Se valida el perfil (existe, es del
cuidador, sigue pendiente)» → «Se genera el token» → «Se codifica el QR» → «Se invalidan los tokens
anteriores del perfil» → «Se persiste el hash con `expiresAt`».

**S18** (`pairing-generator §3`) — «Un documento sin `linkStatus` cuenta como vinculado: es anterior
a HU-007 y se creó por el canje.» Decisión del humano (L5) ante la contradicción con
`docs/seniors-api.md`: gana esta regla, y el lector del slice la hace observable sobre el BSON.

**S19** (`qr-adapter §1`) — «El payload es `{"type":"senior-pairing","token":"<43 caracteres
base64url>"}`. Nada más» y «Cuerpo exacto en `buildPairingQrPayload()`».

**S20** (`qr-adapter §2`) — «El backend devuelve `qrCodeDataUrl` (PNG en base64, prefijo
`data:image/png;base64,`), generado a 320 px con margen 1 y corrección de errores `M`.»

**S21** (`qr-adapter §4`) — «El QR no se cachea como recurso propio ni se guarda en disco o en
logs: se renderiza desde la respuesta del endpoint de emisión.»

**S22** (HU-010, límite de alcance) — «Al emitirse un token nuevo para el mismo perfil, el QR viejo
deja de servir»: la emisión es también la regeneración; no se agrega otra ruta.

## Decisiones de diseño

- **D1 — Slice nuevo `backend/src/modules/pairing/`** con el mismo patrón que `seniors`
  (`domain/`, `application/`, `infrastructure/`, barrel `index.ts` con `buildPairingRouter`). La
  emisión no entra en el slice seniors: el token es una credencial, no parte del perfil.
- **D2 — Dependencia nueva `qrcode`** (`^1.5.4`) + `@types/qrcode` (`^1.5.6`) como única vía para el
  PNG en data URL. No se escribe un codificador QR a mano. **Risk: item 5**.
- **D3 — Reglas del token en `domain/pairingToken.ts`**: `PAIRING_TOKEN_TTL_MINUTES = 1440`,
  `generatePairingToken()` (`randomBytes(32).toString('base64url')`),
  `isPairingTokenWellFormed()`, `hashPairingToken()` (sha256 hex) y `buildPairingQrPayload()`.
  El hash se duplica en 3 líneas en vez de importar el de `modules/auth/domain`: el slice de auth no
  exporta credenciales y acoplar dos slices por un `createHash` es peor que la repetición.
- **D4 — Dos puertos, dos adaptadores.** `PairingTokenRepositoryPort` (propio:
  `invalidateUnusedForSenior`, `create`) y el `SeniorRepositoryPort` de `seniors` para autorizar el
  perfil: la propiedad se resuelve con la única fuente de verdad de vínculos (D1 de HU-005). El caso
  de uso depende sólo de puertos; `server.ts` inyecta la misma instancia del repositorio de seniors.
- **D5 — El orden de S17 vive en el caso de uso**, no en el controlador ni en el adaptador: validar
  (404/409) → generar token → codificar QR (503 sin tocar la base) → invalidar previos → persistir
  hash. La consecuencia de la falla cerrada de S15 queda escrita en el puerto.
- **D6 — Modelo en `shared/models/PairingToken.ts`**, junto a `User`, `SeniorLink` y
  `PasswordResetToken`: `seniorId`, `caregiverId` (emisor), `tokenHash` (único), `expiresAt`,
  `usedAt`, `invalidatedAt`, timestamps. `tokenHash` único con índice, como `PasswordResetToken`.
- **D7 — TTL por config**: `env.pairingTtlMinutes = readPositiveInt(source, 'PAIRING_TTL_MINUTES',
  1440)`; `backend/env.sample:44` declara hoy `15` y se corrige a `1440` para no contradecir S14.
  La constante del dominio es el default y la config su única fuente de verdad.
- **D8 — Códigos y mensajes**: `SENIOR_ID_REQUIRED` (400), `SENIOR_NOT_FOUND` (404, mismo mensaje
  que `GET /api/seniors/:id`: «No encontramos ese perfil»), `SENIOR_ALREADY_LINKED` (409, español,
  lo muestra el panel), `PAIRING_QR_UNAVAILABLE` (503, español). Se agregan a
  `docs/error-handling.md`.
- **D9 — El codificador entra por un puerto** (`PairingQrEncoderPort.toDataUrl(payload): Promise<string>`)
  y el adaptador traduce cualquier excepción del codificador a `AppError(503,
  'PAIRING_QR_UNAVAILABLE')`: así S4 es observable con un doble que falla y no queda `try/catch`
  suelto en el caso de uso.
- **D10 — `Cache-Control: no-store` en la respuesta de emisión** (S21): el QR es credencial y no se
  cachea en ningún intermediario.
- **D11 — Alineación de documentación** detectada al verificar la HU anterior: `docs/pairing-api.md`
  nombra `GET /api/pairing/seniors` pero la ruta implementada y documentada en `docs/seniors-api.md`
  es `GET /api/seniors`; se corrige el contrato, no el código. Las rutas `.js` de las skills se
  corrigen a `.ts`.

- **D12 — S18 se resuelve en el lector del slice, no en el mapeo de seniors** (decisión del humano,
  L5). El esquema hidrata `linkStatus` con su default, así que la ausencia sólo se ve sobre el BSON
  crudo: `createMongoosePairingSeniorReader(seniorRepository)` delega la propiedad en seniors y
  convierte la falta del campo en `linkStatus: null`, que el caso de uso ya responde como 409. Se
  conserva la semántica visible de `GET /api/seniors/:id` (documentada en `docs/seniors-api.md`) y
  sólo cambia la decisión que crea una credencial: un perfil sin el campo **no** recibe un QR nuevo.

- **D13 — S7 vale en secuencia, no bajo concurrencia (hallazgo 1 de la verificación, L8).** Dos
  emisiones simultáneas del mismo perfil pueden dejar dos tokens vivos: `invalidar → crear` son dos
  escrituras y no hay transacción (Mongo sin sesión, por D4 de HU-005). Se descartan el índice
  parcial único (la condición de "vivo" sería `usedAt`/`invalidatedAt` en `null`, justo lo que Mongo
  no admite como filtro parcial fiable) y la transacción (exigiría replica set en todos los entornos
  de prueba, contra `docs/error-handling.md:50`). El caso lo cierra el canje de HU-009: un perfil ya
  vinculado responde `SENIOR_ALREADY_LINKED` sin quemar el token, así que el segundo QR queda
  inutilizable en cuanto se canjea el primero. Queda anotado como endurecimiento posible en HU-009
  (una escritura condicional única) y como nota en `docs/pairing-api.md`.

## Tasks

- **T1** · S5, S14, S16, S19 · inline · dominio: `pairingToken.ts` con generación, validación de
  forma, hash, payload y TTL; tests primero.
- **T2** · S7, S15, S18 · inline · persistencia: `PairingToken` (modelo + índices), `PairingTokenRepositoryPort`,
  `MongoosePairingTokenRepository` (invalidación de no usados + alta) y doble en memoria; pin contra
  Mongo real (`chk-*`).
- **T3** · S4, S20 · inline · QR: dependencia `qrcode`, `QrGenerator.ts` con `renderPngDataUrl`
  (320 px, margen 1, `M`) y puerto `PairingQrEncoderPort`; fallo del codificador → 503.
- **T4** · S1-S3, S8, S13, S17, S18 · inline · aplicación: `GeneratePairingQr` con el orden de S17 y
  los cuatro errores de S12.
- **T5** · S9-S12 · inline · HTTP: `PairingController` + `pairingRoutes` + `buildPairingRouter`,
  guard de sesión y `requireRole('CAREGIVER')`, montaje en `app.ts`, composición en `server.ts`,
  `PAIRING_TTL_MINUTES` en `env.ts`.
- **T6** · S9-S15, S21 · docs · `docs/pairing-api.md` (D11), `docs/error-handling.md`,
  `backend/env.sample`, skills `pairing-generator` y `qr-adapter` (rutas `.ts`).
- **T7** · checks · `npm run typecheck`, `npm test` con y sin `MONGO_URL`, `npm run build`,
  verificación independiente (**Risk: items 2 y 5**) y revisión nativa.

## Log

- **L1** — Pedido del humano, textual: «continua con las HU».
- **L2** — Pedido de este round, textual: «antes de continuar revisa que no haga falta nada de la
  anterior HU y luego continuas»; la opción elegida fue «HU-008: token de vinculación y QR».
- **L3** — Verificación previa de HU-005 + HU-007: árbol limpio, `typecheck` y `build` verdes,
  `npm test` 154 pass + 10 skipped sin base y 164/164 con Mongo real. Nada faltaba del alcance
  cerrado; los pendientes están anotados en `docs/seniors-api.md:187`. Se detectó una deriva de
  documentación (D11).
- **L4** — Mapa de evidencia (explorador, read-only): composición en `app.ts:24-45` y
  `server.ts:44-88`; patrón de slice en `modules/seniors/`; errores por `AppError` +
  `errorHandler.ts:17`; `requireRole.ts:12`; sesión en `req.sessionUser`
  (`authMiddleware.ts:16-33`); arnés `tests/support/registerHarness.ts:462-529`; pin Mongo con base
  `chk-*` en `seniorRepository.mongo.test.ts:56-96`; `readPositiveInt` en `env.ts:64-77`. No existe
  código de pairing ni dependencia de QR.
- **L5** — Decisión consultada y respondida por el humano: `docs/seniors-api.md:169-172` (documento
  sin `linkStatus` = `PENDING`) contradecía S18 (cuenta como vinculado). Se presentaron las dos
  salidas y el humano eligió la que falla cerrado, con la razón a la vista: emitir una credencial
  sobre un estado desconocido no es simétrico con no emitirla. Implementación de D12 con RED
  observado: `tests/pairingSeniorReader.mongo.test.ts` falló primero por el módulo inexistente y,
  después de crearlo, por dos defectos del propio pin (el `_id` crudo sin castear a `ObjectId` y
  `createCalls` tratado como array); corregido el pin, 2/2 en verde contra Mongo real. El pin
  demuestra las dos caras: `create()` hidrata `PENDING` para el documento sin el campo y el lector
  igual responde 409, mientras un perfil con el campo explícito en `PENDING` emite.
  `docs/seniors-api.md` queda corregido con la excepción y con la migración posible.
- **L6** — El TTL aparece dos veces por diseño: la constante del dominio es el default del slice y
  `env.ts` declara `1440` como default de `PAIRING_TTL_MINUTES`. `config/` no importa un slice, así
  que el número se repite a propósito; el caso de uso no lo duplica (lo recibe por dependencia).
- **L7** — Tres unidades de entrega en `chore/deploy-mongoose`: `6233dd2` (T1-T2, dominio + puertos +
  persistencia + dobles + pines de dominio y de Mongo), `a27789a` (T3-T5, la unidad con los ítems de
  riesgo 2 y 5 sola en su commit: caso de uso, codificador, lector de D12, HTTP, composición, config
  y las dos dependencias) y `0ca7a43` (T6, contratos, catálogo de errores, plantilla de entorno,
  skills y este documento). Checks al cerrar la última: `typecheck` y `build` verdes, `npm test`
  **178 pass + 15 skipped** sin base y **193/193** con Mongo real. Nada pusheado: la rama queda 40
  commits adelante de `origin/main`. Las tres unidades pasan el slice de ~400 líneas de revisión; el
  corte de entrega se decide al publicar (la rama completa es una sola revisión de HU, no de commit).
- **L8** — Verificación independiente (`Risk: items 2 y 5`): **PASS en S1-S22**, sin bloqueantes.
  Puntos altos de la evidencia: el token crudo no aparece en base, respuesta, log ni mensaje de
  error (probado también con el 500); 2000 tokens generados son siempre 43 caracteres base64url y
  el hash es sha256 hex; el PNG del adaptador real mide 320×320, usa margen 1 módulo y la matriz
  canónica de nivel `M`, y `zbarimg` decodifica el sobre exacto; un documento sin `linkStatus`
  responde 409 contra Mongo real, no sólo contra el doble. Hallazgos: 1 WARNING (S7 con dos
  emisiones simultáneas → D13), 1 NOTE de endurecimiento (imagen vacía → se corrige en el commit de
  follow-up), 1 NOTE de etiqueta de spec, 1 NOTE de mensajes del canje aún inexistentes, 1 NOTE de
  despliegue (si el `.env` del VPS conserva `PAIRING_TTL_MINUTES=15` de la plantilla vieja, la
  emisión de producción usaría 15 minutos: es decisión y operación del humano) y 1 NOTE de costo
  (una consulta `exists` extra por emisión, deliberada en D12).
- **L9** — Follow-up de los hallazgos 2, 3 y 5: guarda de imagen vacía en el caso de uso (503 antes
  de cualquier escritura), etiqueta de spec corregida en el controlador y notas del contrato
  (mensajes del canje y la carrera de D13). El hallazgo 6 queda para el humano: es el `.env` del
  VPS, no el repositorio.
