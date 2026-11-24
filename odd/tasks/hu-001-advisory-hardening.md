# HU-001 hardening · cierre de los tres hallazgos WARNING

Cierra los tres hallazgos no bloqueantes que la revisión nativa de HU-001 dejó abiertos y que
`odd/tasks/hu-001-registro-familiar.md` (L6) marcó como obligatorios antes del primer deploy. Va
antes de HU-002 por decisión del humano (L2): son deuda de seguridad/contrato del registro, no del
correo de verificación.

Fuente de requisitos: `odd/tasks/hu-001-registro-familiar.md` L6 (a), (b), (c), `docs/auth-api.md`
y `docs/error-handling.md`.

## Specs

- **S1.** La configuración por defecto no confía en ningún proxy: `X-Forwarded-For` enviado por un
  cliente directo **no** cambia `req.ip`, y la evidencia de consentimiento guarda la IP del socket.
  Hoy `app.set('trust proxy', true)` acepta ese header de cualquiera.
- **S2.** El número de saltos confiables es configuración explícita (`TRUST_PROXY_HOPS`, entero ≥ 0,
  default `0`; vacío o malformado cae a `0`). Con un salto confiable, `X-Forwarded-For` sí define
  `req.ip` y la evidencia registra esa IP.
- **S3.** Una carrera de registro que choca con el índice único de Mongo (error `11000`) responde
  **HTTP 400** con `EMAIL_ALREADY_REGISTERED` y el mensaje `Este correo ya tiene una cuenta`, igual
  que el duplicado detectado antes de escribir; nunca `500 INTERNAL_ERROR`.
- **S4.** El log de arranque nunca imprime credenciales: `mongodb://usuario:secreto@host/db` se
  loguea con el userinfo redactado y conserva host, puerto, base y query. Una URL sin credenciales
  se loguea tal cual.
- **S5.** Nada de lo anterior cambia el contrato de `POST /api/auth/register` ni los códigos de error
  existentes: `INVALID_EMAIL`, `WEAK_PASSWORD`, `TERMS_NOT_ACCEPTED`, `EMAIL_ALREADY_REGISTERED`,
  `INVALID_BODY` siguen respondiendo lo mismo.

## Contrato

Sin endpoints nuevos. Cambia solo la evidencia `ipAddress` (S1/S2) y el mapeo de un fallo de
persistencia (S3):

- `POST /api/auth/register` con carrera de índice único → `400`
  `{ error: { code: "EMAIL_ALREADY_REGISTERED", message: "Este correo ya tiene una cuenta" } }`.
- Evidencia Ley 1581: `ipAddress` = `req.ip` con `TRUST_PROXY_HOPS` saltos confiables (default 0).

## Tasks

- **T1** · Tests en RED · S1-S4
  `backend/tests/trustProxy.test.ts`, `backend/tests/duplicateEmail.test.ts`,
  `backend/tests/mongoUrlRedaction.test.ts` y el soporte compartido
  `backend/tests/support/registerHarness.ts`. Se observa el rojo antes de tocar `src/`.
- **T2** · Proxy confiable configurable · S1, S2
  `backend/src/config/env.ts` (`trustProxyHops`), `backend/src/app.ts` (`AppOptions`),
  `backend/src/server.ts`, `backend/env.sample`, `env.sample`, `docs/auth-api.md`.
- **T3** · Carrera de duplicado · S3
  `backend/src/modules/auth/application/RegisterCaregiver.ts` (`DuplicateEmailError`),
  `backend/src/modules/auth/infrastructure/MongooseUserRepository.ts` (mapeo de `11000`).
- **T4** · Redacción del log · S4
  `backend/src/config/redactMongoUrl.ts` y el log de arranque en `backend/src/server.ts`.
- **T5** · Verificación · S1-S5
  `cd backend && npm test` y `npm run typecheck` en verde, más verificación independiente
  (`gentle-ai-verify`) porque la unidad nombra un riesgo alto (seguridad).

## Reglas de la casa que aplican

- **Fail closed**: el default no confía en proxys; producción declara sus saltos.
- **Hexagonal**: el caso de uso no conoce Mongoose; el adaptador traduce `11000` a `DuplicateEmailError`.
- **La evidencia no la elige el cliente** (Ley 1581, skill `ley-1581`).
- **Un error de validación no escribe nada**; se mantiene.
- **Sin `any`**. TypeScript estricto.
- **Los tests no tocan Mongo ni SMTP**: dobles en memoria, `node --test`.

## Log

- **L1.** Hallazgos de la revisión nativa `review-2dd0fd8b10d7bd70` (HU-001), registrados en
  `odd/tasks/hu-001-registro-familiar.md` L6 como trabajo posterior obligatorio antes del deploy:
  (a) `trust proxy` acepta el header de cualquier cliente; (b) carrera de registro duplicado
  devuelve `E11000` como 500; (c) el arranque loguea `MONGO_URL` completa con credenciales.
- **L2.** Decisión del humano, literal: *"Cerrarlos ahora, antes de HU-002"* — sobre la pregunta de
  si estos tres hallazgos van dentro de HU-002, en su propia unidad antes o después. Se elige la
  unidad corta previa para que HU-002 no se contamine y la revisión sea chica.
- **L3.** El pedido que abre la sesión, literal: *"retomá la plataforma, seguimos con HU-002"*, y la
  decisión L2 lo enmarca: primero este hardening, después HU-002.
- **L4.** Rama: se trabaja sobre `chore/deploy-mongoose`, igual que HU-001, porque `main` no tiene
  todavía el rewrite (el árbol nuevo vive en esa rama desde `b3a6b0a`). Se registra la desviación de
  `docs/flujo-de-trabajo.md` §2 (rama por tarea desde `main`) en vez de inventar una topología que
  el humano no pidió.
- **L5.** Verificación independiente (`gentle-ai-verify`) sobre el árbol: 22/22 tests, `typecheck` y
  `build` en verde, y **dos defectos MAJOR reales** que se corrigieron antes del commit:
  (1) `Number.parseInt` aceptaba prefijo numérico, así que `TRUST_PROXY_HOPS=10abc` declaraba 10
  saltos y reabría la IP elegida por el cliente → ahora sólo `/^\d+$/` entre 0 y 10, y el test que
  fijaba `'1.9' → 1` se reemplazó por el criterio correcto;
  (2) el `catch` de arranque imprimía `MongoParseError`, que repite la URI con credenciales → ahora
  el mensaje se scrubea con `redactConnectionStrings` antes de loguearse.
  Además el MINOR de la IP no válida se cerró en el controlador (`evidenceIp` usa `net.isIP`): con
  proxies confiables de más, `X-Forwarded-For: not-an-ip` ya no se guarda como evidencia.
- **L6.** Hallazgos diferidos aceptados, no bloqueantes: (i) no hay aviso de arranque cuando
  `TRUST_PROXY_HOPS=0` y llega un `X-Forwarded-For`: un deploy que olvide la variable guarda la IP
  del nginx del host como evidencia (fail closed, degradado); (ii) `docker-compose.yml` no nombra
  `TRUST_PROXY_HOPS` (llega por `env_file`, pero no está documentado en el compose); (iii) un
  `backend/dist` viejo en local seguiría con `trust proxy: true` (está en `.gitignore` y la imagen
  se recompila, no se envía); (iv) la ida y vuelta real del `11000` contra MongoDB 7 queda sin
  probar hasta que haya Mongo local (no hay ninguno corriendo en esta máquina); (v) el `.env` real no
  se inspeccionó (guard de rutas sensibles): si producción no define `TRUST_PROXY_HOPS`, hay que
  hacerlo en el deploy.
