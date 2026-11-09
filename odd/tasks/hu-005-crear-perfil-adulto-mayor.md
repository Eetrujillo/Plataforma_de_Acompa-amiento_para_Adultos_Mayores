# HU-005 — Crear el perfil de mi adulto mayor

Rama: `hu-005-crear-perfil-adulto-mayor` (desde `dev-Esteban-Trujillo`). Riesgo: alto (item 2 — seguridad de un
secreto de acceso y de la propiedad del recurso; item 3 — se agrega contrato HTTP nuevo).
Contrato congelado abajo en S5–S7 para que backend y frontend se puedan construir en paralelo.

## Specs

S1. Del backlog (verbatim): "Crea el perfil asociado al familiar con estado pendiente de vinculación."
   - El perfil es un `User` con `role: SENIOR` y `caregiverId` del familiar autenticado (`req.user.id`).
   - Nace con `linkStatus: "PENDING"`. El único camino que crea un senior ya vinculado es el canje de
     código de vinculación (`LinkSeniorApp`), que nace `"LINKED"` (S7).
   - Debe ser imposible crear un senior sin un `caregiverId` válido y autenticado.

S2. Del backlog (verbatim): "Exige que el PIN sea exactamente de 4 dígitos numéricos y lo almacena cifrado."
   - Acepta solo `/^\d{4}$/` (exactamente 4, solo dígitos ASCII). `"1234"` sí; `"123"`, `"12345"`, `"12a4"`,
     `" 1234"`, `"１２３４"` (dígitos no ASCII) no.
   - Se guarda como hash bcrypt en `pinHash` (costo ≥ 12). El texto plano nunca se persiste, ni aparece en
     logs, ni en ninguna respuesta, ni en `toPublicUser`.
   - El hash se calcula con el hasher de infraestructura ya existente (`BcryptPasswordHasher` o su
     generalización), inyectado; el caso de uso no importa bcrypt.

S3. Del backlog (verbatim): "Asigna por defecto la zona horaria `America/Bogota` si no se especifica."
   - Ausente, `null`, `""` o solo espacios ⇒ `"America/Bogota"`.
   - Si viene una zona que no es IANA válida (validada con `Intl.DateTimeFormat`), responde 400; no se
     normaliza en silencio a Bogotá.

S4. Del backlog (verbatim): "Restringe la vista del perfil únicamente al familiar propietario."
   - Todo caso de uso que lea un perfil compara `caregiverId === caregiver autenticado` **dentro del caso de
     uso**, con el id recibido por parámetro (no leyendo `req` en el dominio).
   - Un perfil que existe pero pertenece a otro familiar responde **404**, igual que uno inexistente: no se
     filtra su existencia. Un usuario con rol SENIOR recibe 403 por `requireRole`.

S5. Contrato HTTP (congelado para el frontend):

```
POST /api/seniors                     auth: caregiver (401 sin token, 403 rol SENIOR)
  body: { "fullName": "Rosa Pérez", "pin": "4821", "timezone": "America/Bogota" }  // timezone opcional
  201:  { "id": "...", "fullName": "Rosa Pérez", "timezone": "America/Bogota",
          "linkStatus": "PENDING", "createdAt": "<iso>" }
  400:  { "error": { "code": "INVALID_PIN",    "message": "..." } }   // ver S2
  400:  { "error": { "code": "INVALID_NAME",   "message": "..." } }
  400:  { "error": { "code": "INVALID_TIMEZONE","message": "..." } }
```

Ninguna respuesta contiene `pinHash` ni el PIN. `fullName` se normaliza con el normalizador existente
(`normalizeFullName`) y rechaza vacío.

S6. Contrato HTTP de lectura (congelado para el frontend):

```
GET /api/seniors            auth: caregiver
  200: { "seniors": [ <perfil de S5 sin pinHash> ] }   // solo los del familiar autenticado

GET /api/seniors/:id        auth: caregiver
  200: <perfil>             // propio
  404: { "error": { "code": "SENIOR_NOT_FOUND", "message": "..." } }  // inexistente o de otro familiar
```

`GET /api/pairing/seniors` (HU-006) queda como está; `GET /api/seniors` es la lista canónica del panel de
perfiles. La creación de seniors sigue teniendo un solo camino nuevo (S5) más el canje de código (S7).

S7. Consistencia de los dos caminos de creación:
   - `schema.prisma`: `linkStatus String? @default("PENDING")`, `pinHash String?`, `timezone String? @default("America/Bogota")`.
   - `LinkSeniorApp` escribe `linkStatus: "LINKED"` al crear el senior por canje; un test de pairing lo pinnea.
   - `User.createSenior` sigue siendo la fábrica única; acepta `pinHash`, `timezone` y `linkStatus` opcionales
     sin cambiar su comportamiento por defecto (`PENDING`, `America/Bogota`, sin PIN).

S8. Ley 1581 (no pedido en la HU, decisión de alcance): el perfil se crea con `acceptedTermsAt: null` y
   `termsVersion: null`. El consentimiento del adulto mayor lo otorga el titular al vincular/abrir la app
   (HU-008); estampar consentimiento acá sería registrar un consentimiento que nadie dio. Queda escrito en
   `skills/profiles-hexagonal.md` junto con la consecuencia: un perfil `PENDING` sin consentimiento no puede
   recolectar actividades, SOS ni GPS.

## Tasks

- [x] T1 · S1–S3, S5, S7 · backend: schema + dominio + caso de uso + repositorio + controlador/ruta + tests · `5246d3c`, `bcb982f`
- [x] T2 · S4, S6 · backend: lectura por propietario (lista y detalle) + tests de aislamiento entre familiares · `2896b7d`
- [x] T3 · S5, S6 · frontend: `seniorsApi` + `SeniorProfilePanel` en el dashboard del familiar · `cb62192` (selector de vinculados), `cbdc12b`
- [x] T4 · S1–S8 · docs + skills (`docs/seniors-api.md`, `skills/profiles-hexagonal.md`, `skills/bcrypt-pin.md`) · `be1e5eb`
- [x] T5 · cierre: suite + build, verificación S1–S8, backlog y `ACTIVE_TASK` a HU-006 · `ea8368f`, `ae956a7` y este commit

## Log

L1. Pedido del usuario (verbatim): "continua con la parte de el proyecto que est en Proyectos/Plataforma_de_Acompa-amiento_para_Adultos_Mayores/"
L2. Estado de partida (verbatim de `skills/ACTIVE_TASK`): "Ya existe el slice `backend/src/modules/pairing/` con
`LinkSeniorApp` y `POST /api/pairing/link`: el adulto mayor se crea **vinculando un código**, no por un alta
directa." Se resolvió en S7: la fábrica es la misma (`User.createSenior`) y solo cambia `linkStatus`.
L3. Mapa del código (explorador, con evidencia `path:line`): no existían `pinHash`, `timezone` ni `linkStatus`
en `User` (schema.prisma:12-42); `toPublicUser` (User.js:212) es la proyección pública; `loginLockout.js` y
`ResendThrottle.js` son el patrón de límite de intentos.
L4. Decisión de arquitectura: el límite de intentos del PIN **no** se implementa en esta HU porque hoy no existe
verificación de PIN en el servidor; se implementa en HU-007 (vincular app) y se documenta como regla obligatoria
en `skills/bcrypt-pin.md`. Un PIN de 4 dígitos tiene 10 000 combinaciones: el hash encarece el ataque offline,
pero la defensa real es el bloqueo por intentos.
L5 (implementación). Nueve commits en la rama. Lo que vale registrar:
- El slice nuevo reusa el `userRepository` de auth en vez de declarar un segundo adaptador sobre la misma
  colección: el senior es un `User`, y dos adaptadores son la forma más rápida de que dos reglas de escritura
  convivan sin que nadie lo note.
- El PIN se valida **antes** de hashear, así un pedido rechazado no gasta bcrypt ni escribe nada; el test cuenta
  las llamadas al hasher y falla si se invierte el orden.
- `toPublicSenior` es una lista blanca (id, fullName, timezone, linkStatus, createdAt). No expone el correo
  sintético del senior ni el hash.
- Un id con forma inválida corta antes de la consulta: si llegara a Prisma, la respuesta sería `500` en vez del
  `404` que promete el contrato.
- La consulta de vinculados del panel pasó a filtrar `PENDING`, porque tras esta HU un senior puede existir sin
  dispositivo y el selector alimenta el compositor de actividades. Un documento previo a HU-005 no trae
  `linkStatus` y se interpreta como vinculado (el canje era el único camino de alta). Ese cambio está cubierto
  con un caso explícito en `tests/pairingLinkedList.test.js`.
L6 (verificación de mutación, hecha a mano). Ignorando la validación del PIN, falla el test de PIN inválido;
quitando el default de zona horaria, fallan dos tests; quitando la comparación de dueño, falla el test de perfil
ajeno. Restaurado cada vez: suite en verde.
L7 (verificación independiente `gentle-ai-verify`, con probes reproducidos sobre una copia del árbol y contra
`dev-Esteban-Trujillo` como base). Veredicto: S1 a S8 **met**, sin bloqueantes. Tres advertencias:
- `america/lima` se aceptaba y se guardaba tal cual (dos perfiles podían nombrar la misma zona de dos formas).
- El filtro del selector solo excluía `"PENDING"` exacto, así que un documento importado con `"pending"` se
  colaba. Corregido en `ae956a7`, con la comparación sin distinguir mayúsculas.
- `ListLinkedSeniors` cambia de salida (filtra pendientes), pero un `PENDING` no podía existir antes de esta HU:
  toda fila representable en la base anterior se devuelve igual, comparado contra la copia base.
El verificador dejó dos archivos de prueba durables que ahora corren en la suite (`seniorsHttp.test.js` y
`seniorProfileProbes.test.js`): el borde HTTP real (401/403, cuerpo 201 exacto, los tres códigos de error, los
cuatro 404 byte-idénticos), el conteo de llamadas al hasher y la regresión del hasher de contraseñas en costo 10.
L8 (verificación final observada): `cd backend && npm test` → 154 tests, 154 pass, 0 fail, exit 0;
`npx prisma validate` → schema válido, exit 0; `npm run build` (prisma generate) → exit 0;
`cd frontend && npm run build` → exit 0, 273,14 kB (128 módulos). **No hay verificación en navegador**: este
entorno no tiene navegador ni runner de tests de frontend, así que el comportamiento visual del panel no está
observado. Es el único hueco de prueba de esta HU, igual que en HU-004.
L9 (riesgo declarado): **item 2** (un secreto de acceso y la propiedad de un recurso: PIN, hash y aislamiento
entre familiares) e **item 3** (contrato HTTP nuevo y cambio de salida en un listado ya consumido por el panel).
Verificación independiente: `gentle-ai-verify`, ver L7.
L10 (deuda que esta HU deja, para no perderla): el cambio de PIN por el familiar no existe (hoy solo se define al
crear); la transición `PENDING → LINKED` la va a escribir HU-006/HU-007 sobre el mismo perfil, y hoy el código de
vinculación no está atado a un perfil concreto (hay que resolverlo ahí, no acá).
