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

- T1 · S1–S3, S5, S7 · backend: schema + dominio + caso de uso + repositorio + controlador/ruta + tests · commit `feat(seniors): create the senior profile with a hashed PIN`
- T2 · S4, S6 · backend: lectura por propietario (lista y detalle) + tests de aislamiento entre familiares · commit `feat(seniors): scope the profile read to its owner`
- T3 · S5, S6 · frontend: `seniorsApi` + `SeniorProfilePanel` en el dashboard del familiar · commit `feat(seniors): add the senior profile panel`
- T4 · S1–S8 · docs + skills (`docs/seniors-api.md`, `skills/profiles-hexagonal.md`, `skills/bcrypt-pin.md`) · commit `docs(seniors): document the profile contract and the PIN rules`
- T5 · cierre: correr `npm test` + `npm run build`, verificar S1–S8, actualizar backlog y `ACTIVE_TASK` a HU-006 · commit `docs(odd): close HU-005 and load HU-006 as the active task`

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
