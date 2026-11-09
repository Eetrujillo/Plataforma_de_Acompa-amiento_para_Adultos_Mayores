# HU-001 — Registro de familiar/cuidador con consentimiento Ley 1581

Cierra el registro de `POST /api/auth/register` contra los criterios de aceptación de
`skills/ACTIVE_TASK`, que ya tenía la verificación de correo (HU-002) implementada pero no el
consentimiento ni la regla alfanumérica. Rama: `dev-Esteban-Trujillo`.

## Specs

S1. Con correo y contraseña válidos, crea la cuenta y responde con status `201` y datos de sesión.
S2. Si el correo tiene formato inválido, retorna `HTTP 400` con mensaje claro.
S3. Si el correo ya existe (case-insensitive), retorna `HTTP 400` con "Este correo ya tiene una cuenta".
S4. Rechaza contraseñas de menos de 8 caracteres o sin combinación alfanumérica.
S5. Retorna error si no se adjunta la aceptación de términos (Ley 1581).
S6. `skills/ley-1581.md` obliga a persistir `acceptedTermsAt`, `termsVersion` e `ipAddress`
    (este último, cuando el transporte lo conoce).
S7. Al cerrar: marcar `HU-001` en `skills/backlog_del_proyecto.md` y recargar `skills/ACTIVE_TASK`
    con `HU-002`.

## Tasks

| ID | Specs | Route | Commit |
|----|-------|-------|--------|
| T1 | S1-S5 | inline | slice 1 |
| T2 | S6 | inline | slice 1 |
| T3 | S7 | inline | slice 1 (sin commit, archivos del usuario) |

## Log

L1 (user, verbatim):

> vamos a trabajar sobre la rama de dev_Esteban_Trujillo en la parte de skills tengo las HU que
> necesito que hagas por cada prompt que te haga necesito que hagas solo una a menos que te diga
> algo diferente tienes que seguir las reglas que se definieron dentro de RULES.md iniciemos con la
> primera pero entonces necesito que inicies por la primera y tienes permiso de modificar lo que hay
> actualmente a excepción de la parte de despliegue e investiga sobre como debe de ir bien cada
> modulo en este caso si es el login todos los campos que debe de tener

L2 (evidence). `skills/ACTIVE_TASK` apunta a HU-001; `skills/backlog_del_proyecto.md` la lista como
siguiente. Existe ya `backend/src/modules/auth/` con registro + verificación de correo
(`odd/tasks/email-auth.md`), pero sin consentimiento, sin regla alfanumérica y con el duplicado
respondiendo `409`.

L3 (investigación, campos que el módulo debe tener). Fuentes: Ley 1581 art. 3/9 y boletín de la SIC
(silencio y casillas premarcadas no son consentimiento), NIST SP 800-63B (mínimo 8 caracteres,
contraseñas largas permitidas), web.dev sign-up best practices, docs de MongoDB sobre unicidad
case-insensitive.

- `email` obligatorio, normalizado a minúsculas antes de guardar y de buscar: la unicidad
  case-insensitive se resuelve normalizando en escritura, no con un índice con collation (Prisma no
  lo expone y exigiría migrar el índice existente).
- `password` obligatorio, mínimo 8 y con letra + dígito.
- `fullName` obligatorio (el cuidador es quien responde por el adulto mayor).
- `phone` opcional, formato validado.
- `acceptedTerms` debe ser exactamente el booleano `true`; ausente, `false` o cualquier otro valor
  deja el consentimiento inválido. El servidor *no* lo deduce de la ausencia de datos.
- `acceptedTermsAt`, `termsVersion`, `ipAddress` los fija el servidor (nunca el cliente), porque son
  la evidencia auditable del consentimiento.
- El rol (`CAREGIVER`) y `emailVerifiedAt = null` los fija el servidor.
- La versión de los términos es del servidor (`TERMS_VERSION`, default `1.0`): el cliente no puede
  elegir qué política aceptó.

L4 (decisión, S1 "datos de sesión"). El registro **no** emite JWT. `odd/tasks/email-auth.md` S4 ya
bloquea el login hasta verificar el correo, y HU-002 (siguiente en el sprint) depende de ese gate:
emitir una sesión en el registro lo volvería decorativo y dejaría un token válido para cuentas sin
verificar. La respuesta 201 entrega la cuenta creada (id, email, nombre, rol, estado de
verificación) más `verificationSent`, que es lo que la pantalla de registro usa. Si el producto
quiere auto-login en el registro, se implementa junto con una claim de verificación en el
middleware compartido, no acá.

L5 (evidence, observed):
- `backend: npm test` -> 48 tests, 48 pass, 0 fail. Los 6 tests nuevos de `tests/authRegister.test.js`
  se vieron en RED antes de implementar (S2-S6 fallando, S1 ya pasaba); después se sumaron el caso de
  carrera contra el índice único, el intento de falsificar la evidencia desde el cuerpo, y dos pines
  de no-regresión.
- `backend: npm run build` -> `Generated Prisma Client (v6.19.3)`; `prisma validate` -> schema válido.
- `frontend: npm run build` -> 122 modules, exit 0.
- Chequeo diferencial contra el commit base `ee9a134` (worktree en `mktemp -d`, no commiteado, ya
  borrado) sobre todos los comandos que comparten `domain/User.js` y `PrismaUserRepository.create`:
  `POST /api/auth/login`, `POST /api/auth/resend-verification` y `LinkSeniorApp` (nombre/teléfono/
  código inválidos). Status, `error.code` y mensajes idénticos en los 10 casos; la única diferencia es
  que el `data` de Prisma agrega las tres claves nullable nuevas.
- Verificación independiente (`gentle-ai-verify`) encontró dos defectos reales que este diff ya
  corrige: mi primera versión tradujo los mensajes de los helpers compartidos y con eso cambió las
  respuestas de `login`, `resend-verification` y de la vinculación de adultos mayores. Ahora los
  textos en español entran solo por `REGISTER_MESSAGES`, y los dos flujos ajenos quedaron pinneados
  por tests. También señaló que `skills/ley-1581.md` prescribe el nombre `ipAddress`: el campo se
  llama así, no `consentIp`.
- Pendiente conocido (no es parte de HU-001): `app.js` no configura `trust proxy`, así que detrás de
  nginx `req.ip` es la IP del proxy. Es una decisión de topología de despliegue: confiar en el proxy
  exige que el puerto 3500 no esté expuesto directamente.
- No corrido: `prisma db push` contra Mongo (no hay base levantada en esta sesión), ni un envío real
  de SMTP. El schema agrega solo campos nullable al documento `User`: no requiere migración de datos.
