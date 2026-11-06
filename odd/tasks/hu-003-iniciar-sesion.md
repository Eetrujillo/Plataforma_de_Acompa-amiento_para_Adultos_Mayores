# HU-003 — Iniciar sesión (bloqueo por intentos fallidos)

Cierra HU-003 de `skills/ACTIVE_TASK` sobre `backend/src/modules/auth/`. El `200` con JWT y el `401`
que no distingue qué falló ya existen (`application/Login.js`); falta el bloqueo temporal por
intentos fallidos y verificar la redirección de rutas privadas. Rama: `hu-003-iniciar-sesion`, creada
desde `dev-Esteban-Trujillo` (en `4e5031d`).

## Specs

S1. "Con datos correctos, retorna HTTP 200 y el token JWT de sesión."

S2. "Con datos incorrectos, devuelve HTTP 401 sin especificar qué campo falló."

S3. "Bloquea la cuenta por 15 minutos tras 5 intentos fallidos consecutivos."

S4. "Redirige al login al intentar acceder a rutas privadas sin token."

S5. Cierre: marcar `- [x] **HU-003**` en `skills/backlog_del_proyecto.md`, actualizar el puntero y
   sobrescribir `skills/ACTIVE_TASK` con HU-004.

S6. `ACTIVE_TASK` exige `skills/jwt-security.md`, que no existía: se creó antes de escribir código.

## Tasks

| ID | Specs | Route | Commit |
|----|-------|-------|--------|
| T1 | S6 | inline | `12a053b` |
| T2 | S1-S2 | inline (verificar cobertura existente) | `c2fe006` |
| T3 | S3 | inline | `c2fe006` |
| T4 | S4 | inline (ya estaba implementado, sin cambios) | — |
| T5 | S5 | inline | cierre |

Bordes de slice: `12a053b` solo documenta el skill (36 líneas); `c2fe006` trae el bloqueo con sus
tests, schema, config y docs (por el conteo del aviso, medido contra `origin/main`, que no es la base
de esta rama). El cierre va aparte para que el diff de comportamiento quede revisable solo. T4 no
tuvo commit a propósito: el criterio ya se cumplía y agregar un cambio de frontend sin necesidad
habría sido ruido.

## Log

L1 (user, verbatim):

> si inicia a y otra cosa una regla muy importante agrega no cuando trabajes en el vps solo tienes permiso para modificar dentro del proyecto del proyecto si llegas a necesitara algo mas me repreguntas antes y me detallas lo que vayas a hacer para decidir si si ono doy el permiso

L2 (regla operativa derivada de L1, guardada también en memoria global). En el VPS solo se modifica
dentro de `/root/admin/home/projects/victor/Plataforma_de_Acompa-amiento_para_Adultos_Mayores`. Fuera
de esa ruta, solo lectura y diagnóstico: cualquier escritura o cambio de configuración se pregunta
antes, con el detalle de lo que se va a hacer. Antecedente declarado al usuario: antes de esta regla
se escribieron `/root/.git-origin-url.bak` y `/tmp/hu002.bundle` (este último ya borrado); el backup
queda a la espera de que el usuario decida si se elimina.

L3 (evidence, lo que ya está y lo que falta):
- S1 DONE — `application/Login.js:40-42` firma el JWT (`sub`, `role`, `email`) y la ruta responde
  `200` con `{ token, user }`.
- S2 DONE — `Login.js:27-37`: usuario inexistente y contraseña incorrecta lanzan el mismo
  `UnauthorizedError('Invalid credentials')`; el `403 EMAIL_NOT_VERIFIED` es un tercer caso, no una
  variante del anterior.
- S3 MISSING — no hay contador ni bloqueo: `grep` de `lockedUntil|failedLogin` no encuentra nada en
  `backend/src` ni en `backend/prisma/schema.prisma`.
- S4 SIN VERIFICAR — el backend tiene el guard (`shared/middlewares/authMiddleware.js`, usado por
  `GET /api/auth/me`); falta confirmar qué hace el frontend en una ruta privada sin sesión.

L4 (decisión del usuario, S3, verbatim de la consulta): "429/423 claro solo para cuentas reales".
Consecuencia asumida y aceptada: probando 5 veces un correo se puede averiguar si tiene cuenta, porque
el bloqueo responde distinto que un correo inexistente. Se implementa como `429` con código
`ACCOUNT_LOCKED` (no `423`) para que todo el módulo hable el mismo idioma de "esperá y reintentá" y
reutilice el `details.retryAfterSeconds` que ya documenta `docs/auth-api.md`. El intento 5 es el que
bloquea: 1 a 4 responden `401`, el 5.º responde `429`. Con un correo inexistente nunca hay bloqueo:
siempre `401`, igual que hoy.

L5 (decisión técnica, persistencia). `failedLoginAttempts` y `lockedUntil` se agregan al documento
`User` como **nullable** (`Int?`, `DateTime?`) y el dominio lee `null` como 0. Es el mismo criterio que
HU-001 usó para no necesitar migración de datos en Mongo, y además evita el problema de un campo
`Int @default(0)` no nullable sobre documentos que ya existen. Sin `prisma db push`: se agregan campos,
no índices, y Mongo no necesita crear nada para escribirlos.

L6 (evidence, S4). Ya está implementado y no requiere cambios: `frontend/src/app/routes/AppRouter.jsx`
envuelve `/caregiver` en `RequireCaregiver` (:15-25), que devuelve `<Navigate to="/login" replace />`
cuando no hay usuario (:17-19); la sesión se lee de storage al inicializar el contexto
(`AuthContext.jsx:7`), así que no se dispara ningún request antes de redirigir. Deuda preexistente
detectada, fuera de esta HU: `/senior` no tiene guard en `AppRouter.jsx:51`.

L7 (evidence, observado):
- `backend: npm test` -> **96 tests, 96 pass, 0 fail** (85 del baseline `4e5031d` + 11 nuevos). Los
  tests nuevos se vieron en RED antes de implementar: primero `AccountLockedError` inexistente y cero
  escrituras persistidas, después por comportamiento.
- `npm run build` (prisma generate) y `prisma validate` -> OK con los campos nuevos.
- `frontend: npm run build` -> 124 módulos, exit 0.
- No corrido: `prisma db push` (no se agregó ningún índice, Mongo no necesita nada para escribir los
  campos) ni un login real contra la base desplegada.
- S4 no requirió cambios: ya estaba implementado. Verificado leyendo el camino completo
  (`RequireCaregiver` devuelve `<Navigate>` antes de montar el hijo; la sesión se lee sincrónicamente
  del storage; el único request del panel vive en un `useEffect` que nunca se alcanza).

L8 (verificación independiente `gentle-ai-verify`, con pruebas de mutación). Veredicto: S1-S4 PASS,
sin bypass del bloqueo, sin regresión en los otros callers de `Login`, y sin bloqueante de datos.
Hallazgos reales, todos corregidos:
- **Dos reglas de S3 no estaban pineadas**: borrando la limpieza del bloqueo vencido, o haciendo que
  `resolvePolicy` ignore la config, la suite seguía en 9/9 verde. Se agregaron dos tests
  ("un bloqueo vencido no se rearma con un fallo inmediato" y "LOCKOUT_MAX_ATTEMPTS y
  LOCKOUT_MINUTES configuran el bloqueo") y se comprobó la mutación a mano: desactivando la limpieza,
  el test nuevo falla; restaurado, 11/11.
- **Contradicción documental**: `skills/jwt-security.md` decía que el bloqueo no puede ser un oráculo
  y el código lo es a propósito (L4). Ahora la regla 2 registra la excepción aceptada y cómo revertirla
  si el producto cambia de prioridad. También se corrigió que `jsonwebtoken` agrega `iat`/`exp`.
- Faltaba documentar que una cuenta sin verificar acumula fallos y que un `403 EMAIL_NOT_VERIFIED` no
  limpia la racha; agregado en `docs/auth-api.md`. Y `docs/error-handling.md` no tenía los dos `429`
  (`TOO_MANY_REQUESTS`, `ACCOUNT_LOCKED`); agregados.

L9 (límite del entorno, reportado). `gentle-ai-worker` no se pudo usar para esta HU: el guard del
writer exige que la raíz del proyecto sea el cwd de la sesión, y acá el cwd es `/home/kali` con el
proyecto anidado en `Proyectos/`. Dos intentos con `workspace_root` explícito, mismo rechazo
("Writer bootstrap requires the original safe project root"). La implementación se hizo inline.

L10 (riesgo residual aceptado). Una base Mongo standalone (sin replica set) no soporta las
transacciones que Prisma necesita para un `update`: un login con contraseña incorrecta pasaría de
`401` a `500`. No es nuevo de esta HU —`docker-compose.yml` ya exige replica set de un nodo— pero
queda anotado porque ahora el camino de fallo escribe.
