# HU-005 + HU-007 — Slice seniors: vínculos de N familiares y perfil con ficha médica

Rama: `chore/deploy-mongoose`. Alcance elegido por el humano: HU-005 y HU-007 como una sola
unidad de entrega, porque HU-005 no se puede verificar por HTTP sin el alta del perfil.
Código: `backend/src/modules/seniors/`, `backend/src/shared/models/`, `backend/src/shared/middlewares/`.

## Specs

**S1** (HU-005) — «Un adulto mayor admite N familiares vinculados simultáneamente.»

**S2** (HU-005) — «Los familiares vinculados tienen permisos equivalentes: ninguno queda en solo lectura.»

**S3** (HU-005) — «Agregar un familiar no altera ni revoca los vínculos existentes.»

**S4** (HU-005) — «El listado de familiares de un adulto solo lo ve quien está vinculado a ese adulto.»

**S5** (HU-005) — «Un familiar no vinculado recibe HTTP 404 al pedir el perfil, nunca 403.»

**S6** (HU-007) — «Crea el perfil asociado al familiar con estado pendiente de vinculación.»

**S7** (HU-007) — «Registra los datos médicos críticos: grupo sanguíneo, alergias, condiciones, medicación y contacto de emergencia.»

**S8** (HU-007) — «**No hay PIN**: el perfil no guarda `pinHash` ni exige credencial al alta.»

**S9** (HU-007) — «Asigna `America/Bogota` como zona horaria si no se especifica.»

**S10** (HU-007) — «Restringe la vista del perfil a los familiares vinculados.»

**S11** (HU-007) — «La proyección pública excluye los campos médicos sensibles salvo para el familiar vinculado.»

**S12** (HU-007) — «El alta no registra consentimiento del titular: eso ocurre en HU-009, cuando el adulto mayor acepta.»

**S13** (HU-007) — «El perfil se crea con una única fábrica (`User.createSenior`); el alta del panel y el canje del dispositivo usan la misma.»

**S14** (HU-007) — «El `caregiverId` sale de la sesión, nunca del cuerpo del pedido.»

**S15** (HU-007) — «El senior no tiene correo propio: lleva un correo sintético único y `passwordHash` nulo.»

**S16** (HU-007) — «Valida la ficha antes de escribir: grupo sanguíneo de una enumeración cerrada, listas acotadas y longitudes máximas.»

**S17** (`docs/seniors-api.md:25`) — «`timezone` es opcional: si falta, viene vacía o `null`, se guarda `America/Bogota`.»

**S18** (`docs/seniors-api.md:38-45`) — «Errores (todos `400`, con `error.code` para que la pantalla marque el campo)» con las filas exactas:

| `error.code` | Cuándo |
| --- | --- |
| `INVALID_NAME` | El nombre falta, no es texto o queda con menos de 3 caracteres después de normalizar. |
| `INVALID_TIMEZONE` | La zona no es una zona IANA válida. No se cae a Bogotá en silencio. |

**S19** (`docs/seniors-api.md:72-77`) — «Un perfil de **otro** familiar, un `id` inexistente, un `id` mal formado (no son 24 caracteres hexadecimales) y un `id` que corresponde a un `CAREGIVER` devuelven el **mismo** `404`.»

**S20** (`docs/seniors-api.md:10-11`) — «Todas las rutas exigen `Authorization: Bearer <jwt>` de un usuario con rol `CAREGIVER`. Sin token: `401`. Con rol `SENIOR`: `403`.»

**S21** (`docs/seniors-api.md:59-60`) — «Sin perfiles: `{ "seniors": [] }`, no un `404`.»

**S22** (`docs/seniors-api.md:27-36`, respuesta exacta del alta) —

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

**S23** (decisión del humano, este round) — «HU-005 + HU-007 juntas: slice seniors completo»: «Alta
del perfil con ficha médica, colección de vínculos (N familiares), permisos equivalentes, proyección
pública y 404 para el no vinculado.»

## Decisiones de diseño

- **D1 — El vínculo vive en una colección propia.** `SeniorLink` (`seniorId`, `caregiverId`, `role`,
  `status`, `invitedBy`, `createdAt`) es la **única** fuente de propiedad, según L4 de
  `docs/backlog.md:347-348`. `User.caregiverId` deja de escribirse y de leerse para autorizar: dos
  fuentes de verdad conviviendo es el defecto que hay que evitar. Se retira del modelo Mongoose.
- **D2 — Los permisos son los del vínculo, no del rol.** `role` en el vínculo es informativo
  (`OWNER` para quien dio el alta, `FAMILY` para el resto) y **no** cambia permisos (S2): toda
  lectura del slice exige vínculo `status: 'ACTIVE'` y da acceso completo.
- **D3 — La ficha médica vive en el documento del perfil** (`User`: `bloodType`, `allergies`,
  `conditions`, `medications`, `emergencyContact`), porque el alta la escribe y el perfil es ese
  documento. Se expone por `GET /api/seniors/:id/medical` (nueva ruta documentada): el contrato de
  `GET /api/seniors/:id` queda intacto («el mismo objeto del alta») y S11 se vuelve observable.
- **D4 — Orden de escritura del alta: perfil y después vínculo, sin transacción.** Si el vínculo
  falla, queda un perfil huérfano que nadie puede listar, abrir ni vincular (inerte, falla cerrado).
  No se usa sesión de Mongo porque exigiría replica set en todos los entornos de prueba
  (`docs/error-handling.md:50`). Se documenta el modo de falla en vez de esconderlo.
- **D5 — Guard de rol explícito.** Se agrega `requireRole` en `shared/middlewares/` y el código
  `403 FORBIDDEN`, que hoy no existe en la tabla de `docs/error-handling.md` (S20).
- **D6 — Repositorio propio del slice.** `SeniorRepositoryPort` + `MongooseSeniorRepository`. La
  skill `profiles-hexagonal` decía «no se declara un repositorio propio» porque el senior era sólo
  un `User`; ahora los vínculos son otra colección y no pertenecen al adaptador de auth. La skill se
  actualiza en el mismo trabajo (el código y la regla no pueden contradecirse).
- **D7 — La fábrica se llama `createSenior` y vive en `modules/seniors/domain/seniorProfile.ts`.**
  Conserva la invariante de S13 (una sola fábrica) sin meter reglas de seniors dentro del dominio de
  auth; el documento sigue siendo un `User` con `role: 'SENIOR'`.
- **D8 — Códigos de validación nuevos, uno por campo** (S18: «para que la pantalla marque el campo»):
  `INVALID_BLOOD_TYPE`, `INVALID_ALLERGIES`, `INVALID_CONDITIONS`, `INVALID_MEDICATIONS`,
  `INVALID_EMERGENCY_CONTACT`. Grupo sanguíneo obligatorio y de enumeración cerrada
  (`A+ A- B+ B- AB+ AB- O+ O-`); listas opcionales, máximo 20 ítems de 1 a 80 caracteres.

## Tasks

- **T1** · S1-S3, S6-S9, S12-S13, S15-S17 · inline · dominio: fábrica `createSenior`, validación de
  la ficha, reglas del vínculo, proyecciones `toPublicSenior` / `toSeniorMedicalRecord`. Tests primero.
- **T2** · S1, S3-S5, S10-S11 · inline · persistencia: modelo `SeniorLink`, puerto
  `SeniorRepositoryPort`, `MongooseSeniorRepository` (crear perfil + vínculo, listar por vínculo,
  buscar autorizando por vínculo), doble en memoria y test contra MongoDB real (`chk-*`).
- **T3** · S2-S5, S10-S14 · inline · aplicación: `CreateSeniorProfile`, `ListSeniorProfiles`,
  `GetSeniorProfile`, `GetSeniorMedicalRecord`; la propiedad se resuelve por parámetro, nunca por `req`.
- **T4** · S18-S22 · inline · HTTP: controlador, rutas, `requireRole('CAREGIVER')`, montaje en `app.ts`
  y composición en `server.ts`.
- **T5** · docs · `docs/seniors-api.md` (vínculos, ruta médica, códigos), `docs/error-handling.md`
  (filas nuevas), skill `profiles-hexagonal` (D6/D7).
- **T6** · checks · `npm run typecheck`, `npm test` (con y sin `MONGO_URL`), `npm run build`,
  verificación independiente (Risk: item 2) y revisión nativa.

## Log

- **L1** — Pedido del humano, textual: «continua con las HU».
- **L2** — Decisión del humano sobre el alcance de este round, textual: «HU-005 + HU-007 juntas: slice
  seniors completo».
- **L3** — Mapa de evidencia (explorador, read-only): el repo no tiene `Senior` ni `SeniorLink`;
  el vínculo es `User.caregiverId` escalar; el contrato de `docs/seniors-api.md` es de un solo
  familiar; no existe `requireRole` ni `createSenior` ni proyección de seniors.
- **L4** — Decisiones D1-D8 arriba.
- **L5** — Implementación (test-first) en cuatro commits: `b60bd2d` (T1: modelo y dominio), `7d2d50e`
  (T2: persistencia + arnés de Mongo real), `67e12da` (T3-T4: aplicación + HTTP + guard de rol, la
  unidad con el ítem de riesgo 2, sola en su commit), `9d738a0` (T5: contrato, tabla de errores y
  skill). Tamaños: 780 / 351 / 729 / 216 líneas — la primera y la tercera pasan el slice de ~400
  líneas; quedan registradas acá porque ya están commiteadas y la entrega se parte al publicar.
- **L6** — Verificación independiente (`Risk: item 2`): PASS en S1-S22, sin bloqueantes. 6 hallazgos
  no bloqueantes, todos cerrados o documentados: el doble comparaba ids con mayúsculas (arreglado),
  un documento `SENIOR` sin ficha tumbaba la lista entera (ahora se omite en lista y da 404 en
  detalle), re-agregar un vínculo `REVOKED` se devuelve tal cual (documentado en el puerto como
  decisión de HU-012), el reloj no sella el `createdAt` del documento (comentario y pin corregidos),
  y dos discrepancias doc/código (`INVALID_BLOOD_TYPE` vs `INVALID_BODY`, y `linkStatus` ausente)
  alineadas en la documentación. Regresión de auth: 35 peticiones comparadas contra el commit base,
  diff vacío.
- **L7** — Checks: `typecheck` y `build` verdes; `npm test` 151 pass + 10 skipped sin base y
  **161/161** con `MONGO_URL` (`chk-*` con `directConnection=true` en el Mongo local del 4301). El
  archivo de pines de Mongo aísla su base (`…-seniors`) porque `node --test` corre los archivos en
  paralelo y el de HU-004 dropea la suya.
