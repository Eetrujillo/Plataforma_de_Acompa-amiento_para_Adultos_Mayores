# HU-002 — Confirmar mi correo electrónico (rate limiting de reenvío)

Cierra HU-002 de `skills/ACTIVE_TASK` sobre el módulo `backend/src/modules/auth/`. La emisión del
token de 24 h, el cambio de estado y el error de token vencido/usado ya existen
(`odd/tasks/email-auth.md`); falta el bloqueo de "3 intentos por hora" del reenvío y los dos skills
que `ACTIVE_TASK` exige antes de empezar. Rama: `hu-002-confirmar-correo`, que nace de
`dev-Esteban-Trujillo` (esa rama se adelanta a `prod` primero, porque estaba 5 commits atrás).

## Specs

S1. "Envia un correo con un token único de confirmación válido por 24 horas."

S2. "El endpoint de verificación cambia el estado a `isEmailVerified: true`."

S3. "Muestra error si el token expiró o ya fue utilizado."

S4. "Bloquea solicitudes de reenvío si se superan 3 intentos por hora."

S5. Cierre: cambiar `- [ ] **HU-002**` por `- [x] **HU-002**` en
   `skills/backlog_del_proyecto.md`, actualizar el puntero de estado y sobrescribir
   `skills/ACTIVE_TASK` con los datos de HU-003.

S6. `ACTIVE_TASK` exige leer `skills/email-adapter.md` y `skills/rate-limiting.md`; ninguno existe
   todavía, así que hay que crearlos antes de escribir el código.

## Tasks

| ID | Specs | Route | Commit |
|----|-------|-------|--------|
| T1 | S1-S3 | inline (verificar cobertura existente, sin reescribir) | — |
| T2 | S6 | inline | `38c41d9` |
| T3 | S4 | inline | `b3858b4` |
| T4 | S5 | inline | cierre |
| T5 | merge | inline | merge a `dev-Esteban-Trujillo`, luego a `prod` |

Bordes de slice (el conteo de líneas de los avisos se mide contra `origin/main`, que no es la base de
esta rama): `38c41d9` documenta los dos skills (69 líneas); `b3858b4` trae el límite con sus tests y
docs (734 líneas, de las cuales 490 son el archivo de tests y ~220 de ahí son fakes y harness, en
línea con los otros archivos de test del repo). El cierre va aparte para que el diff de
comportamiento quede revisable solo.

## Log

L1 (user, verbatim):

> continua trbajando en las historias de usuario y crea una rama para cada una y luego merge con dev-esteban-trujillo y luego merge con la rama de prod

L2 (decisión, verbatim del usuario en la consulta de alcance): alcance = "Solo HU-002"; en el merge a
prod entra "Solo lo de esta sesión".

L3 (evidence, topología de ramas observada antes de tocar nada):
- `dev-Esteban-Trujillo` es **ancestro** de `prod` (`git merge-base --is-ancestor` exit 0) y está
  5 commits atrás (`git rev-list --left-right --count prod...dev-Esteban-Trujillo` → `5 0`).
- Por eso T5 hace primero fast-forward de `dev-Esteban-Trujillo` a `prod`, y recién entonces mergea
  la rama de la HU. Así el merge a `prod` incorpora exactamente los commits de esta sesión.

L4 (evidence, estado real de los criterios, no asumido):
- S1 DONE — `domain/verificationToken.js:7,36` (32 bytes, SHA-256, TTL 24 h por
  `EMAIL_VERIFICATION_TTL_HOURS`), emisión en `application/issueVerificationEmail.js:24-44`.
- S2 DONE — `User.markEmailVerified` (`domain/User.js:193-201`), `application/VerifyEmail.js:38`.
- S3 DONE — `VerifyEmail.js:35-37` responde un único `ValidationError` para vencido y ya usado.
- S4 MISSING — no hay contador, throttle ni `express-rate-limit` en `backend/src`; tampoco hay Redis
  ni store compartido en las dependencias de `backend/package.json`.

L5 (decisión de diseño, S4). Dos restricciones chocan: `POST /api/auth/resend-verification` responde
siempre `202 {accepted: true}` para no permitir enumerar cuentas, y un `429` solo para correos
registrados las enumeraría. Solución: el contador se lleva por correo normalizado e **incrementa en
todo intento**, exista o no la cuenta y esté o no verificada. Así el cuarto intento responde `429`
igual para un correo desconocido, y el 429 deja de filtrar existencia. Costo asumido: el store es
en memoria del proceso (un solo servicio `backend` en `docker-compose.yml:67`); queda documentado
como limitación para el día que haya más de una réplica.

L6 (evidence, verificación independiente `gentle-ai-verify` sobre S1-S6): S1 PASS, S2 PASS, S3 PASS,
S4 PASS con reserva, S5 pendiente (era el slice 2 al momento de verificar), S6 PASS. El verificador
corrió la suite en un clon de scratch: 73/73 en `f48d737` y 79/79 en la rama, y confirmó que en
`register`/`login`/`verify-email` las respuestas son **idénticas byte a byte** al baseline; el único
delta es el `429` buscado. Sobre el oráculo de existencia: el `429` se decide **antes** de consultar
el repositorio (`lookupsDeltaOnBlocked = 0`), así que no hay nada que filtrar. Sin throttle en el
constructor, el módulo falla al arrancar en vez de publicar el endpoint sin límite.

L7 (defecto propio que encontró la verificación y cómo se corrigió, F1). Mi primer `prune` expulsaba
la clave más vieja cuando el mapa llegaba a `maxKeys`, aunque su ventana siguiera abierta. Eso
permitía un bypass real: 3 intentos sobre la víctima, después 10 000 correos inventados (que no
envían nada, son baratos) y el contador de la víctima desaparecía → 3 correos más. Corregido: el
mapa ya no expulsa contadores vivos; si está lleno de ventanas abiertas, la clave nueva se rechaza
con `429` (fallar cerrado). El costo de llegar a ese estado es el flood que le corresponde frenar a
un límite por IP, que sigue siendo deuda declarada en `skills/rate-limiting.md`. Test que lo pinnea:
"un flood de correos inventados no revive el cupo de un correo bloqueado".

L8 (otros hallazgos del verificador, corregidos): F2 el `backend/env.sample` también necesita las
dos variables (el patrón del repo es espejarlas en ambos templates); F3 `README.md` decía "siempre
202"; F4 el mensaje del `429` se comparaba contra su propia constante, ahora hay un test con el
literal documentado; F5 se agregaron cuatro tests de brecha (formato inválido no consume cupo,
cuenta ya verificada sí consume, el `429` no consulta el repositorio, y entorno malformado no
desactiva el límite).

L9 (evidence, observado al cerrar):
- `backend: npm test` -> **85 tests, 85 pass, 0 fail** (73 en el baseline + 12 nuevos, los 12 vistos
  en RED antes de implementar: primero `MODULE_NOT_FOUND`, después los de brecha).
- `frontend: npm run build` -> 124 módulos, exit 0.
- `node --check` sobre los archivos JS tocados -> sin errores.
- No corrido: `prisma db push` (el diff no toca `schema.prisma`) ni un envío SMTP real.
- Pendiente conocido, preexistente y no introducido acá: el camino de cuenta registrada y sin
  verificar hace escrituras + SMTP y el de correo desconocido responde enseguida, así que el tiempo
  de respuesta distingue ambos casos. Ya pasaba en `f48d737`; queda como deuda de la HU de
  endurecimiento.
