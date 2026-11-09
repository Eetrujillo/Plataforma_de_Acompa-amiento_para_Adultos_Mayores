# Errores diagnosticables y correo de verificación funcionando en local

Cierra dos huecos: el manejo de excepciones no deja rastro correlacionable (y algunas fallas
terminan como un 500 mudo), y el SMTP local no existe, así que el enlace de verificación solo se
imprime en el log. Rama: `dev-Esteban-Trujillo`.

## Specs

S1. Toda respuesta de error conserva el contrato `{ error: { code, message } }` y nunca incluye
    stack, ruta de archivo, query, ni mensaje interno de Prisma.
S2. Cada request recibe un id de correlación: se respeta `X-Request-Id` del cliente si es un valor
    seguro y, si no, se genera uno. El id vuelve en el header `X-Request-Id` y aparece en el payload
    de los 5xx como `error.requestId`, para que el usuario pueda reportarlo.
S3. Todo 5xx se loguea con id de request, método, ruta, status y código, más el error completo del
    lado servidor. Ningún 4xx operativo se loguea como error.
S4. Un cuerpo JSON inválido responde `400` código `INVALID_JSON`, no un 500.
S5. Un cuerpo mayor al límite de `100kb` responde `413` código `PAYLOAD_TOO_LARGE`, no un 500.
S6. Las fallas conocidas de Prisma mantienen su traducción actual (`P2031` y `P2010` de conexión a
    `503`); cualquier otro error de Prisma se enmascara como `500 INTERNAL_ERROR` y se loguea entero.
S7. `unhandledRejection` y `uncaughtException` se loguean con nombre y stack antes de apagar; el
    proceso no queda vivo en un estado indeterminado.
S8. En local hay un SMTP real que recibe correo: un contenedor `mailpit` en la red `mearn-net`, con
    el backend apuntándole por `SMTP_HOST`. El correo de verificación deja de ser "solo consola".
S9. `APP_URL` del `.env` local apunta al puerto en que el frontend realmente publica, para que el
    enlace del correo abra.
S10. El flujo completo de confirmación se prueba de punta a punta: registro, recepción del correo,
    link válido, un solo uso, token vencido y reenvío que invalida el anterior.

## Tasks

| ID | Specs | Route | Commit |
|----|-------|-------|--------|
| T1 | S1-S7 | gentle-ai-worker (código + tests) | slice 1 |
| T2 | S8-S9 | inline (contenedor + `.env` local) | sin commit (`.env` no está en git) |
| T3 | S10 | inline (prueba end-to-end contra el stack) | slice 2 (docs) |

## Log

L1 (user, verbatim):

> configura la expcion de erorres para que cada que pase algo se pueda resolver pero son mostrar
> info de mas que no deberia poder ver el cliente y tambien configura smpt en el local para el envio
> de confirmacion tabien cerifica esa parte de envio de confirmacion tiene errores realiza pruebas
> para que funcione como de deberia

L2 (evidence, estado inicial). `shared/middlewares/errorHandler.js` ya distingue errores operativos
(`AppError`) de los demás y traduce `P2031`/`P2010`. Lo que falta: cuerpo JSON inválido y cuerpo
demasiado grande caen hoy en el 500 enmascarado; no hay id de request que permita cruzar un fallo con
su log; los 5xx se loguean sin método, ruta ni status; no hay handlers de proceso.

L3 (evidence, correo). `.env` local tiene `SMTP_HOST` vacío → `EmailSender` usa el canal `console` y
el enlace solo aparece en `docker compose logs backend`. `APP_URL=http://localhost:3201`, pero el
contenedor del frontend publica en `3202` porque VS Code ocupa `3201`: el enlace del correo no abre
en el entorno local. `docs/smtp-setup.md` solo documenta Gmail y el VPS.

L4 (decision). Para local no se usan credenciales reales ni se toca `docker-compose.yml`
(despliegue): se levanta `mailpit` con `docker run` sobre la red `mearn-net`, se le apunta el `.env`
y se valida el correo con su API HTTP. El `.env` es local, no está en git.

L5 (evidence, observed):
- `backend: npm test` → 60 tests, 60 pass, 0 fail, exit 0.
- Las reglas de manejo de errores las implementó un worker delegado con RED primero (43 pass / 2
  fail antes de la implementación, 59 pass después). El ajuste de backstop en `server.js`
  (watchdog de 5s para la caída y salida inmediata ante una segunda caída durante el apagado) se
  agregó después.
- La verificación en vivo contra el stack encontró un defecto real que los tests unitarios no
  podían atrapar, porque su repositorio falso no reproduce la semántica del driver: después de
  `POST /api/auth/resend-verification`, el enlace de verificación anterior seguía vigente (respondía
  200 con JWT en lugar de 400). Causa: MongoDB no guarda un campo opcional solo porque el schema lo
  permita, y el `where: { usedAt: null }` de Prisma matchea únicamente un BSON null explícito, nunca
  un campo ausente; `findMany({ usedAt: null })` devolvía 0 mientras que `usedAt: { isSet: false }`
  devolvía 2. Se corrigió en `PrismaEmailVerificationRepository` escribiendo `usedAt: null` al crear
  e invalidando con `OR: [{ usedAt: null }, { usedAt: { isSet: false } }]`; se fijó con un test que
  imita la semántica de MongoDB (`tests/authEmailVerification.test.js`), visto RED contra el adapter
  viejo (10/11) y GREEN después (11/11).
- SMTP local: contenedor Mailpit en la red de compose, backend logueando
  `email delivery: smtp (mearn-mailpit:1025)`, `APP_URL` corregido a `http://localhost:3202`.
- De punta a punta, observado: registro → 201 con `verificationSent:true`; el mensaje llega con
  asunto `Verificá tu correo · Plataforma de Acompañamiento`; el enlace extraído apunta a
  `http://localhost:3202/verify-email?token=...`; `login` antes de verificar responde
  `403 EMAIL_NOT_VERIFIED`; la verificación responde 200 con JWT; reusar el token responde
  `400 VALIDATION_ERROR`; `login` después responde 200; un token con `expiresAt` movido al pasado
  responde `400`.
- No ejecutado: un proveedor SMTP externo real (Gmail o el VPS) y el click en el botón del correo
  desde el navegador.
