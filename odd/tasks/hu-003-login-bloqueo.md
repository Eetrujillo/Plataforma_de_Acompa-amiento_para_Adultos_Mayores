# HU-003 · Inicio de sesión con bloqueo por intentos

Autentica al familiar con correo y contraseña, emite el JWT de sesión y bloquea la cuenta por
intentos fallidos. Es la primera HU que firma tokens y la primera que expone una ruta privada.

Fuente de requisitos: `docs/backlog.md` (HU-003, L10), `docs/auth-api.md` (§login, §sesión),
`docs/error-handling.md`, y las skills `jwt-security`, `rate-limiting` y `secure-code-guardian`.

## Specs

Texto entre comillas = criterio literal de `docs/backlog.md` (HU-003).

- **S1.** "Credenciales correctas responden HTTP 200 con el token JWT de sesión."
  `POST /api/auth/login` con correo y contraseña válidos de una cuenta **verificada** responde `200`
  con `{ token, user: { id, email, fullName, role } }`.
- **S2.** "Credenciales incorrectas responden HTTP 401 **sin especificar qué campo falló**."
  Correo inexistente y contraseña incorrecta responden **byte a byte lo mismo**: `401`
  `UNAUTHORIZED`, mensaje `Credenciales inválidas`, sin `details`.
- **S3.** "Bloquea la cuenta 15 minutos tras 5 intentos fallidos consecutivos."
  Con `LOCKOUT_MAX_ATTEMPTS=5` y `LOCKOUT_MINUTES=15`: los intentos 1 a 4 responden `401`; el 5.º
  **fallo** ya responde `429`. El bloqueo corre desde el último fallo y vence por reloj del servidor.
- **S4.** "El bloqueo se persiste en el usuario: un reinicio del backend no desbloquea."
  `failedLoginAttempts` y `lockedUntil` viven en el documento `User`; un proceso nuevo con el mismo
  reloj sigue viendo la cuenta bloqueada.
- **S5.** "Un login correcto limpia el contador."
  Un `200` deja `failedLoginAttempts` en `0` y `lockedUntil` en `null`.
- **S6.** "El token lleva exactamente los claims `sub`, `role`, `email` y `sv`; ningún dato personal
  más." El JWT lleva `sub` (id), `role`, `email`, `sv` (número, `sessionVersion` leído como `0` si es
  `null`) más los `iat`/`exp` que agrega la librería. Sin nombre, sin teléfono, sin `emailVerified`.
  Vigencia `JWT_EXPIRES_IN` (default `7d`); no hay refresh token.
- **S7.** "Cada request autenticado compara el claim `sv` contra `sessionVersion` del usuario: subir
  la versión cierra todas las sesiones." Un token con `sv` viejo responde `401 UNAUTHORIZED` en
  cualquier ruta privada.
- **S8.** "El contador de intentos se lleva por correo normalizado." `Ana@X.com` y `ana@x.com`
  comparten racha y bloqueo. **Decisión D1:** el bloqueo **sólo aplica a cuentas reales** — un correo
  sin cuenta nunca se bloquea ni escribe estado (ver §Decisions).
- **S9.** "Además del contador por correo, se limita por IP para que nadie bloquee a otra persona
  usando su correo." Pasados `LOGIN_IP_MAX_ATTEMPTS` fallos desde una misma IP dentro de
  `LOGIN_IP_WINDOW_MINUTES`, la respuesta es `429` `TOO_MANY_REQUESTS` (código distinto del bloqueo
  de cuenta, D2), con `details.retryAfterSeconds`. El límite por IP **no** escribe estado en la base.
- **S10.** "Acceder a una ruta privada sin token redirige al login sin pedir el recurso."
  En la API: sin `Authorization: Bearer <token>`, con token malformado, vencido o con `sv` viejo,
  cualquier ruta privada responde `401` `UNAUTHORIZED` sin ejecutar el caso de uso. Se materializa
  con `GET /api/auth/me` (ejemplo de la skill `jwt-security`), que devuelve el usuario del token.
- **S11.** Una cuenta **sin verificar** acumula fallos con contraseña incorrecta; con contraseña
  correcta responde `403` `EMAIL_NOT_VERIFIED` y **no** limpia la racha.
- **S12.** Estando la cuenta bloqueada, **la contraseña correcta también** se rechaza con el mismo
  `429 ACCOUNT_LOCKED` (`docs/auth-api.md:165-166`), sin emitir token.
- **S13.** El cuerpo del `429` de bloqueo es exactamente el de `docs/auth-api.md:154-159`:
  `message: "Bloqueamos tu cuenta por demasiados intentos fallidos. Esperá unos minutos antes de volver a intentar."`,
  `details.retryAfterSeconds` = segundos que faltan para que venza el bloqueo (900 al bloquear).

## Contrato

- `POST /api/auth/login` — `{ email, password }`
  - `200` → `{ token, user: { id, email, fullName, role } }`
  - `400` `INVALID_BODY` si falta `email`/`password` o no son texto (no consume intentos)
  - `401` `UNAUTHORIZED` · `Credenciales inválidas` (D2: mismo cuerpo para correo inexistente y
    contraseña incorrecta)
  - `403` `EMAIL_NOT_VERIFIED` cuando la contraseña es correcta y el correo no está confirmado
  - `429` `ACCOUNT_LOCKED` con `details.retryAfterSeconds` (cuenta bloqueada)
  - `429` `TOO_MANY_REQUESTS` con `details.retryAfterSeconds` (demasiados fallos desde esa IP)
- `GET /api/auth/me` — requiere `Authorization: Bearer <token>`
  - `200` → `{ user: { id, email, fullName, role } }`
  - `401` `UNAUTHORIZED` · `Falta el token de sesión` o `La sesión no es válida`
- Claims del JWT: `sub`, `role`, `email`, `sv`, más `iat`/`exp`.

## Decisions

- **D1.** El bloqueo por correo **no** cuenta correos sin cuenta. El backlog (:80) y `L10` pedían lo
  contrario para no crear un oráculo de existencia, pero `docs/auth-api.md:172-173` y la excepción
  registrada en la skill `jwt-security` ya documentaban lo opuesto, y el humano eligió esa rama:
  **un correo inexistente nunca responde 429**. Consecuencia asumida y documentada: el `429` del
  sexto intento revela que la cuenta existe. Se reconcilia `docs/backlog.md` con una decisión nueva
  y no se toca el resto de `L10` (el límite por IP sigue vigente).
- **D2.** El límite por IP usa `429 TOO_MANY_REQUESTS`, distinto de `ACCOUNT_LOCKED`: el cliente
  distingue "esta cuenta está bloqueada" de "esta red hizo demasiados intentos". Parámetros propios
  (`LOGIN_IP_MAX_ATTEMPTS`, default `20`; `LOGIN_IP_WINDOW_MINUTES`, default `15`), en memoria por
  proceso, con la misma ventana móvil y el mismo reloj inyectable que `ResendThrottle`.
- **D3.** El `429` por IP se evalúa **antes** de tocar la base: no escribe estado y no depende de que
  el correo exista (así el propio límite no se vuelve oráculo).
- **D4.** El token lo firma un único `JwtTokenService` en `infrastructure/` (`jwt-security` regla 1);
  el caso de uso pide `sign(claims)` a un puerto. Claims armados por un helper puro
  (`sessionClaims`) reutilizable por HU-004/HU-008 cuando también firmen.
- **D5.** `jsonwebtoken` es la dependencia nueva (la que la skill nombra). `JWT_SECRET` ya es
  obligatorio en producción; `JWT_EXPIRES_IN` y las dos variables de bloqueo se agregan a `config/env.ts`.

## Tasks

- **T1** · Dominio del bloqueo y de los claims · S3, S6, S8, S12, S13
  `backend/src/modules/auth/domain/loginLockout.ts` (reglas puras: estado de bloqueo desde
  `failedLoginAttempts`/`lockedUntil`/reloj, cuándo bloquea el fallo N, `retryAfterSeconds`,
  limpiar racha) y `backend/src/modules/auth/domain/sessionClaims.ts` (claims exactos, `sv` con
  `null` leído como 0).
- **T2** · Caso de uso del login · S1, S2, S3, S5, S8, S11, S12
  `backend/src/modules/auth/application/Login.ts` con puertos: credenciales por correo
  (`passwordHash`, `emailVerifiedAt`, `sessionVersion`, `failedLoginAttempts`, `lockedUntil`),
  `registerFailedLogin`, `clearFailedLogins`, `PasswordHasherPort.compare`, `SessionTokenPort.sign`
  y el throttle por IP.
- **T3** · Adaptadores y sesión · S4, S6, S7, S10
  `backend/src/modules/auth/infrastructure/JwtTokenService.ts`, ampliación de
  `BcryptPasswordHasher.ts` (`compare`), `MongooseUserRepository.ts` (métodos nuevos y atómicos,
  con el patrón de proyección explícita), `backend/src/shared/middlewares/authMiddleware.ts` y la
  ruta `GET /api/auth/me`.
- **T4** · HTTP, configuración y composición · contrato completo
  `backend/src/modules/auth/infrastructure/AuthController.ts`, `authRoutes.ts`, `index.ts`,
  `backend/src/config/env.ts` (`JWT_EXPIRES_IN`, `LOCKOUT_MAX_ATTEMPTS`, `LOCKOUT_MINUTES`,
  `LOGIN_IP_MAX_ATTEMPTS`, `LOGIN_IP_WINDOW_MINUTES`), `backend/src/server.ts`,
  `backend/package.json` (`jsonwebtoken`), `backend/env.sample`, `env.sample`,
  `docs/auth-api.md`, `docs/backlog.md`, `docs/error-handling.md`.
- **T5** · Tests · S1-S13
  `backend/tests/authLogin.test.ts` y `backend/tests/loginLockout.test.ts` (reglas puras), un caso
  por spec contra HTTP real con dobles, sin Mongo. El arnés `backend/tests/support/registerHarness.ts`
  se amplía (hash verificable, estado de bloqueo por usuario, `sessionVersion`, `emailVerifiedAt`,
  reloj movible, secreto JWT de test). Los 50 tests existentes siguen verdes y `typecheck` limpio.

## Reglas de la casa que aplican

- **Hexagonal**: `domain/` no importa Express, Mongoose, `jsonwebtoken` ni bcrypt.
- **Un solo 401 idéntico** para credenciales inválidas; el `429` de bloqueo es el único que revela
  existencia, y está documentado como excepción (D1).
- **El bloqueo se persiste**; nunca en memoria. El límite por IP sí es en memoria (D2).
- **El bloqueo sólo frena la contraseña**: no borra la cuenta ni invalida sesiones ya emitidas.
- **Ningún controlador firma tokens**: sólo `JwtTokenService`.
- **La contraseña nunca se compara en el dominio**: `compare` es del puerto hasher.
- **Sin `any`**. TypeScript estricto. `node --test`.

## Corrections after independent verification

La verificación independiente pasó las 13 specs pero encontró un **MAJOR** y cinco menores. Estas
correcciones son parte de la misma HU.

- **C1 (S9, MAJOR — disponibilidad).** Con `TRUST_PROXY_HOPS=0` (el default) y el backend detrás de
  nginx, todos los pedidos traen la IP del proxy: el límite por IP se vuelve **una sola bolsa
  global** y 20 fallos de cualquier persona bloquean el login de todo el mundo durante 15 minutos.
  El límite tiene que quedar **alcancable pero no global**: el arranque avisa fuerte cuando
  `NODE_ENV=production` y `TRUST_PROXY_HOPS=0` (`console.warn` con la consecuencia escrita), y
  `docs/auth-api.md` + los dos `env.sample` documentan la dependencia. No se hace fallar el arranque
  acá: esa decisión de deploy es del humano.
- **C2 (S3/S4, MINOR pero bypass de fuerza bruta).** El incremento del contador usa un CAS sobre los
  valores leídos: 20 contraseñas incorrectas en paralelo persisten `failedLoginAttempts=5` y devuelven
  11 `401`, o sea que se puede adivinar en paralelo sin llegar nunca al bloqueo. El contador debe
  incrementarse de forma **atómica e incondicional** (`$inc`) y el `lockedUntil` fijarse en la misma
  operación cuando la racha alcanza el umbral; ningún fallo puede perderse. Hay que probarlo contra
  el Mongo local: N fallos concurrentes deben persistir exactamente N (hasta el umbral).
- **C3 (MINOR).** `JWT_EXPIRES_IN` se lee sin validar: un valor malformado hace que **todo login**
  responda `500`. Acepta sólo `^\d+[smhd]$`; cualquier otra cosa cae a `7d`.
- **C4 (MINOR, regresión de arranque).** `buildAuthRouter` lanza si `jwtSecret` es `null`, así que un
  backend de desarrollo sin `JWT_SECRET` ya no sirve `register`/`verify-email`. Se mantiene el fail
  closed (login sin secreto no puede firmar) pero se corrige el comentario de `config/env.ts` que
  todavía dice "Solo en producción" y se documenta en `env.sample`.
- **C5 (NIT).** Consistencia documental: `docs/auth-api.md` mezcla `Invalid credentials` con
  `Credenciales inválidas` (el mensaje real es el segundo), errores de tipeo (`identico`, `Es lo
  impide`) y citas de línea viejas en esta spec. Se agregan además los tests que la verificación
  dejó listos (S2 con headers idénticos, D1 sin 429 ni escrituras, S3 desde el último fallo, S9 sin
  acceso a la base, S10 un solo 401 de dos textos, S6 `exp` según `JWT_EXPIRES_IN`).

Diferido, con razón: el oráculo por latencia (correo inexistente ~1 ms vs contraseña incorrecta
~82 ms) — lo subsume el oráculo de existencia que D1 ya asumió, y cerrarlo exige comparar contra un
hash señuelo; y la decisión de deploy de los dos canales (SMTP `console` en producción y
`TRUST_PROXY_HOPS` obligatorio), que es del humano.

## Log

- **L1.** Pedido del humano, literal: *"dale continua con esa HU"*, sobre la propuesta previa de
  seguir con HU-003 (login con bloqueo, `jwt-security` y `EMAIL_NOT_VERIFIED`).
- **L2.** Dos contradicciones entre fuentes resueltas por el humano antes de escribir código:
  (a) **el contador no cuenta correos sin cuenta** — se elige `docs/auth-api.md` + la excepción
  registrada de `jwt-security` por sobre `docs/backlog.md:80`/`L10`, asumiendo el oráculo de
  existencia que eso implica; (b) **el límite por IP responde `429 TOO_MANY_REQUESTS`**, distinto de
  `ACCOUNT_LOCKED`, para que el cliente sepa si el bloqueo es de la cuenta o de la red.
- **L3.** `pinHash` sigue en el modelo pese a `L3` del backlog ("sin PIN"): fuera de alcance de esta
  HU, se retira cuando se toque el alta del adulto mayor.
- **L4.** El backlog (:82) dice que una ruta privada "redirige al login": eso es comportamiento del
  cliente RN; en la API se materializa como `401 UNAUTHORIZED` y se agrega `GET /api/auth/me` como
  ejemplo verificable, siguiendo la skill `jwt-security`.
- **L5.** Implementación delegada a `gentle-ai-worker` con handoff por referencia
  (`Spec: odd/tasks/hu-003-login-bloqueo.md, T1-T5`). Verificado por el padre: **82/82 tests**,
  `typecheck` y `build` verdes, y los 50 tests de HU-001/HU-002 intactos (sólo se amplió el arnés de
  forma aditiva). Claims del token decodificados en un test real: `sub`, `role`, `email`, `sv`,
  `iat`, `exp` (`exp - iat = 604800` = 7d).
- **L6.** Verificación independiente sobre el adaptador real (Mongo local, base descartable, tres
  ciclos de sonda): S1-S13 **PASS**, con un **MAJOR** y cinco menores. El MAJOR: con
  `TRUST_PROXY_HOPS=0` el límite por IP es una sola bolsa global (20 fallos de cualquiera bloquean a
  todos). El más grave de los menores era un bypass de fuerza bruta: el CAS del contador perdía
  incrementos (20 fallos en paralelo persistían 5).
- **L7.** Correcciones C1-C5 aplicadas con sonda propia contra Mongo local: contador atómico
  (`$inc` vía update pipeline) que persiste **20 de 20** fallos concurrentes y fija `lockedUntil` en
  la misma operación; `JWT_EXPIRES_IN` validado (`^\d+[smhd]$`, `0d` se trata como degenerado y cae a
  `7d`); aviso fuerte en el arranque cuando producción corre con `TRUST_PROXY_HOPS=0` (sin cortar el
  proceso: la decisión de deploy es del humano); comentario obsoleto de `JWT_SECRET` corregido; seis
  tests pinza agregados y documentación unificada en `Credenciales inválidas`.
- **L8.** Estado de la unidad: **94/94 tests**, `typecheck` y `build` verdes. Queda una regla pura
  (`registerFailure` en `domain/loginLockout.ts`) que el caso de uso ya no invoca porque el adaptador
  espeja su pipeline: se conserva probada y documentada, con el drift posible anotado en el adaptador.
  Diferidos: el oráculo por latencia (subsumido por D1) y las dos decisiones de deploy (canal `console`
  de SMTP en producción y `TRUST_PROXY_HOPS` obligatorio).
