# Plataforma de Acompañamiento para Adultos Mayores

Aplicación web full stack para el acompañamiento de adultos mayores y sus familias. El repositorio contiene el backend, el frontend y la configuración de despliegue con Docker.

## Stack

- **Backend:** Node.js 20, Express 4, Mongoose 8 y MongoDB 7.
- **Frontend:** React 18, Vite 5, TypeScript y React Router 7.
- **Infraestructura:** Docker Compose, Nginx y GitHub Actions.
- **Autenticación:** contraseñas con bcrypt y sesiones con JWT.

## Estructura

```
backend/
  src/
    index.js                 # Punto de entrada del servidor
    models/User.js           # Modelo de usuario y datos de verificación
    models/OlderAdult.js     # Perfil, PIN, vinculación, consentimiento y sesión de la app
    models/LinkAttempt.js    # Intentos fallidos de vinculación por IP
    models/Activity.js       # Plantilla de actividad y repetición
    models/ActivityCompletion.js # Historial de cumplimiento con instantáneas
    constants/consent.js     # Texto y versión del consentimiento
    constants/activity.js    # Íconos y tipos de repetición
    routes/auth.routes.js    # Registro, login, confirmación, reenvío y recuperación
    routes/olderAdult.routes.js # CRUD de perfiles, código de vinculación y desvinculación
    routes/link.routes.js    # Canje público del código de vinculación
    routes/app.routes.js     # Sesión, consentimiento y actividades de la app
    routes/activity.routes.js # CRUD de actividades del familiar
    services/email.service.js        # Envío SMTP y fallback de desarrollo
    services/verification.service.js # Tokens, expiración y límite de reenvíos
    services/passwordReset.service.js # Tokens de recuperación, un solo uso
    services/olderAdult.service.js   # Validación, PIN, códigos, sesión y desvinculación
    services/olderAdultSession.service.js # Sesión de la app, consentimiento y PIN
    services/linkAttempt.service.js  # Bloqueo de intentos de vinculación
    services/activity.service.js     # Validación, repetición y cumplimiento
    utils/dateTime.js        # Zona horaria, fechas, ocurrencias y resúmenes
    migrations/ensure-familiar-role.js
    scripts/migrate-familiar-role.js
    middleware/auth.js       # Verificación del token JWT
    middleware/olderAdultAuth.js # Token de la app y consentimiento vigente
    middleware/requireVerifiedEmail.js # Bloquea funciones sin correo confirmado
    middleware/errorHandler.js
frontend/
  src/
    components/app/ConsentContent.tsx # Texto del consentimiento en letra grande
    components/auth/         # LoginForm, RegisterForm, ProtectedRoute, SessionExpiredModal
    components/ui/           # FormField, SelectField, Notification, ConfirmDialog
    context/AuthProvider.tsx # Estado global de la sesión y vencimiento
    hooks/useAuth.ts
    hooks/useLoginFeedback.ts
    hooks/useResendVerification.ts
    pages/                   # Login, Register, ConfirmEmail, ForgotPassword, ResetPassword, VerificationRequired, Privacy, Dashboard, OlderAdults, Activities
    pages/app/               # OlderAdultLinkPage, OlderAdultHomePage, OlderAdultSettingsPage
    routes/AppRoutes.tsx
    services/apiClient.ts    # Cliente HTTP con token del familiar
    services/authService.ts
    services/olderAdultService.ts
    services/olderAdultAppService.ts # Cliente de la app con X-Older-Adult-Token
    services/activityService.ts
    styles/globals.css
    utils/activity.ts
    utils/time.ts
    utils/timeZones.ts
    types/index.d.ts
mongo-init/init.js
docker-compose.yml
```

## Variables de entorno

Copia `.env.example` como `.env` en la raíz y ajusta los valores:

| Variable | Descripción |
|---|---|
| `MONGO_URL` | Cadena de conexión a MongoDB. En Docker: `mongodb://mongo:27017/mearn_db`. |
| `BACKEND_PORT` | Puerto del backend publicado en el host. Por defecto `3505`. |
| `JWT_SECRET` | Secreto para firmar los tokens. Debe ser largo y aleatorio. |
| `JWT_EXPIRES_IN` | Duración del token. Por defecto `7d`. |
| `CORS_ORIGIN` | Origen permitido. Vacío permite cualquiera; en producción usa el dominio real. |
| `APP_URL` | URL pública del frontend usada en los enlaces de confirmación y recuperación. En producción debe ser el dominio real. |
| `SMTP_HOST` | Host del servidor SMTP. Obligatorio en producción para enviar correos. |
| `SMTP_PORT` | Puerto SMTP. Por defecto `587`. |
| `SMTP_SECURE` | `true` para conexión TLS directa (por ejemplo, puerto 465). |
| `SMTP_USER` | Usuario SMTP, si el proveedor lo requiere. |
| `SMTP_PASS` | Contraseña o clave de aplicación SMTP. |
| `SMTP_FROM` | Remitente que verán los usuarios. |
| `LINK_QR_BASE_URL` | Prefijo del contenido del QR de vinculación. Por defecto `acompanamiento://vincular`. |

El backend escucha siempre en el puerto interno **3701**. Nginx y el proxy de Vite apuntan a ese puerto.

En desarrollo, si `SMTP_HOST` está vacío, el backend no envía un correo real: imprime en consola los enlaces de confirmación y recuperación para poder probar el flujo. En producción, `SMTP_HOST` es obligatorio; sin él, el registro crea la cuenta pero el correo no se envía y el reenvío responde con error de configuración.

## Endpoints de autenticación

| Método | Ruta | Descripción | Autenticación |
|---|---|---|---|
| `POST` | `/api/auth/register` | Crea una cuenta de familiar, envía el enlace de confirmación y devuelve token + datos. | No |
| `POST` | `/api/auth/login` | Valida correo y contraseña contra MongoDB. | No |
| `POST` | `/api/auth/verify-email` | Confirma el correo a partir del token del enlace. | No |
| `POST` | `/api/auth/resend-verification` | Reenvía el enlace de confirmación (máximo 3 por hora). | No |
| `POST` | `/api/auth/forgot-password` | Solicita un enlace de restablecimiento; la respuesta es genérica. | No |
| `POST` | `/api/auth/reset-password` | Define una nueva contraseña con el token del enlace. | No |
| `GET` | `/api/auth/me` | Devuelve el usuario del token actual. | `Bearer <token>` |
| `GET` | `/api/health` | Estado del backend. | No |

Ejemplo de registro:

```json
{
  "email": "kevin@example.com",
  "password": "unaClaveSegura123",
  "acceptPrivacyPolicy": true
}
```

La contraseña debe tener mínimo 8 caracteres, con al menos una letra y un número. El correo se
normaliza a minúsculas y solo puede tener una cuenta. Al registrarse se guarda la versión de la
política aceptada y la fecha de aceptación.

Ejemplo de login:

```json
{
  "email": "kevin@example.com",
  "password": "unaClaveSegura123"
}
```

La respuesta tiene la forma:

```json
{
  "token": "eyJhbGciOi...",
  "user": {
    "_id": "...",
    "name": "Kevin",
    "email": "kevin@example.com",
    "role": "familiar",
    "emailVerified": false,
    "privacyPolicy": {
      "version": "1.0",
      "acceptedAt": "..."
    },
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

El registro público siempre crea usuarios con rol `familiar`. Los roles `admin` y `teacher`
deben asignarse desde la base de datos o desde un módulo administrativo.

Los usuarios creados antes de la unificación del rol se migran automáticamente al iniciar el
backend (`family` → `familiar`). También se puede ejecutar la migración manualmente:

```bash
docker compose exec backend npm run migrate:familiar-role
```

## Confirmación de correo (HU-002)

Al registrarse se genera un token aleatorio, se guarda su hash SHA-256 en MongoDB y se envía un
correo con un enlace a `APP_URL/confirmar-correo?token=...`. El enlace:

- vence a las **24 horas**;
- sólo puede usarse una vez;
- se reemplaza cuando el usuario solicita uno nuevo;
- se envía dentro del mismo flujo de registro, por lo que no requiere una acción adicional.

La página pública `/confirmar-correo` confirma el token, muestra el resultado y, si el enlace
venció, ya fue usado o no es válido, permite solicitar uno nuevo. Mientras `emailVerified` sea
`false`, el familiar puede iniciar sesión, pero solo accede a `/verificar-correo`, donde puede
reenviar el enlace, actualizar el estado o cerrar sesión. El panel usa
`ProtectedRoute requireVerified` en el frontend.

La respuesta del registro incluye `emailVerificationSent` para indicar si el correo inicial se
pudo enviar. Aunque falle el envío, la cuenta se crea y el usuario puede pedir un nuevo enlace
desde la página de verificación.

El reenvío acepta como máximo **3 solicitudes por hora** por cuenta. Al superar el límite, la API
responde `429` con `retryAfterSeconds` y el frontend muestra el tiempo de espera restante.

**Decisión de negocio:** una cuenta sin correo confirmado tiene acceso limitado. Puede iniciar
sesión, pero no entra al panel ni a las funciones protegidas; solo puede reenviar el enlace,
actualizar el estado y cerrar sesión. Esto responde al cuidado de un adulto mayor: la información
de la persona acompañada no debe quedar expuesta a una cuenta cuyo correo no se ha validado.

Del lado del backend, cualquier ruta de funciones debe montarse después de `requireAuth` y
`requireVerifiedEmail`. Si el correo no está confirmado, la API responde `403` con
`code: "EMAIL_NOT_VERIFIED"`; así la restricción no depende únicamente de la interfaz. `/api/auth/me`
queda accesible para que el frontend pueda conocer el estado de la cuenta.

### Probar el correo en desarrollo

Sin SMTP configurado, el backend en modo desarrollo imprime el enlace en su consola:

```bash
cd backend
npm run dev
```

El contenedor de Docker usa `NODE_ENV=production`, por lo que **no imprime el enlace**: para que
el flujo funcione en el servidor configura `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y
`SMTP_FROM` antes de desplegar. Si falta SMTP, el registro sigue creando la cuenta, pero el
reenvío responde con un error de configuración.

## Inicio de sesión (HU-003)

El familiar inicia sesión con `POST /api/auth/login`. Si las credenciales son correctas, la API
devuelve el token y los datos públicos de la cuenta; el frontend guarda el token y entra al panel.
El adulto mayor no usa esta pantalla: la cuenta y la sesión pertenecen al familiar. Las cuentas con
correo sin confirmar siguen la restricción de HU-002: pueden iniciar sesión, pero solo acceden a
`/verificar-correo`.

### Error de credenciales

Un correo inexistente y una contraseña incorrecta responden exactamente con el mismo `401`:

```json
{ "error": "Correo o contraseña incorrectos." }
```

La respuesta no indica cuál de los dos datos falló. Además, cuando el correo no existe se
ejecuta una comparación bcrypt ficticia con el mismo costo que una contraseña real, para reducir
la enumeración de cuentas por diferencias de tiempo.

### Bloqueo por intentos fallidos

El bloqueo es **por cuenta** y se guarda en MongoDB (`failedLoginAttempts` y `loginLockedUntil`,
ambos ocultos en las respuestas JSON). Después de **5 intentos fallidos consecutivos**:

- la cuenta queda bloqueada durante **15 minutos**;
- la API responde `429` con `code: "LOGIN_LOCKED"`, `retryAfterSeconds` y la cabecera
  `Retry-After`;
- el frontend muestra el mensaje y una cuenta regresiva con el tiempo restante;
- un inicio de sesión correcto reinicia el contador;
- al vencer el bloqueo, el siguiente intento vuelve a contar desde cero.

La verificación se hace antes de comparar la contraseña, por lo que una cuenta bloqueada no puede
entrar ni siquiera con la contraseña correcta hasta que termine el plazo.

### Rutas protegidas y vencimiento de sesión

`ProtectedRoute` redirige a `/login` cuando no hay sesión y guarda la ruta solicitada para volver a
ella después de autenticarse. El backend protege las rutas de funciones con `requireAuth` y
`requireVerifiedEmail`; `/api/auth/me` queda disponible para consultar el estado de la cuenta.

Si el JWT vence mientras el panel está abierto, el cliente de API emite el evento
`gap:session-expired` ante un `401` autenticado. `AuthProvider` conserva la página montada y abre
`SessionExpiredModal`, que pide la contraseña de la **misma cuenta** y vuelve a iniciar sesión sin
descartar el formulario que se estaba llenando. Para cambiar de cuenta se debe cerrar sesión desde
el modal; así no se mezclan datos de dos familiares en la misma pantalla. Los `401` de login y
registro no abren este modal.

### Aislamiento de datos

Con HU-005 ya existe el modelo `OlderAdult` y sus rutas. Todas las consultas de
`/api/older-adults` filtran por el familiar autenticado (`familiar: req.user._id`) y las rutas se
montan con `requireAuth` + `requireVerifiedEmail`. La página `/adultos-mayores` solo lista y
edita los perfiles creados desde la cuenta actual. La vinculación con la app del adulto mayor se
implementa en HU-006 a HU-011; el aislamiento por cuenta familiar se mantiene en todas esas rutas.

### Validación de HU-003

Además de `npm run typecheck` y `npm run build`, se validaron con pruebas aisladas:

- login correcto y respuesta sin campos sensibles;
- mensaje genérico idéntico para correo inexistente y contraseña incorrecta;
- cuatro fallos consecutivos y bloqueo en el quinto, con `Retry-After` y tiempo restante;
- rechazo mientras está bloqueado, incluso con la contraseña correcta;
- reinicio del contador al vencer el bloqueo y al iniciar sesión correctamente;
- `/api/auth/me` con dos cuentas distintas y token JWT vencido;
- emisión de `gap:session-expired` solo para `401` autenticados;
- aislamiento de los perfiles del adulto mayor por familiar (se valida en HU-005).

Para probar el vencimiento en local se puede iniciar el backend con un JWT corto, por ejemplo
`JWT_EXPIRES_IN=1m`, y esperar a que venza mientras el panel está abierto.

## Recuperación de contraseña (HU-004)

`POST /api/auth/forgot-password` recibe `{ "email": "..." }`. Para un correo con formato válido
responde siempre, exista o no la cuenta:

```json
{
  "message": "Si existe una cuenta, te enviamos un enlace.",
  "code": "PASSWORD_RESET_REQUESTED"
}
```

Si la cuenta existe, se genera un token aleatorio de 32 bytes, se guarda su hash SHA-256 en
MongoDB y se envía un enlace a `APP_URL/restablecer-contrasena?token=...`. El token:

- vence a los **60 minutos**;
- sólo puede usarse **una vez**;
- se reemplaza al solicitar otro enlace;
- no se guarda en texto plano.

La página pública `/recuperar-contrasena` envía la solicitud y muestra siempre el mismo mensaje.
La página `/restablecer-contrasena` muestra las reglas de HU-001, valida la confirmación y permite
definir la nueva contraseña. Si el enlace venció, ya fue usado o no es válido, muestra el mensaje y
un enlace para solicitar otro.

`POST /api/auth/reset-password` recibe `{ "token": "...", "password": "..." }`. La contraseña se
valida antes de consumir el token: si no cumple `^(?=.*\p{L})(?=.*\d).{8,}$` responde `400` con
`code: "WEAK_PASSWORD"` y **no** guarda el cambio ni quema el enlace. Un token vencido responde
`410` (`RESET_TOKEN_EXPIRED`), uno ya usado `409` (`RESET_TOKEN_USED`) y uno inválido `400`
(`RESET_TOKEN_INVALID`).

Al cambiar la contraseña, el backend incrementa `tokenVersion` en la cuenta y limpia el bloqueo
por intentos fallidos. Los JWT incluyen esa versión; `requireAuth` rechaza los tokens de versiones
anteriores. Así se cierran las sesiones abiertas antes del cambio. La sesión actual del navegador
también se elimina al terminar el flujo.

En desarrollo, si `SMTP_HOST` no está configurado, el enlace de restablecimiento se imprime en la
consola del backend. En producción el envío requiere SMTP; si falla, la API mantiene la respuesta
genérica para no revelar si la cuenta existe y registra el error en el servidor.

## Perfil del adulto mayor (HU-005)

La página protegida `/adultos-mayores` permite registrar, listar y editar los perfiles de los
adultos mayores de la cuenta familiar. El panel incluye el acceso directo **Gestionar perfiles**.
Cada perfil se crea con estado `pending` (**Pendiente de vincular**) y queda listo para generar su
código de vinculación (HU-006).

### Endpoints

| Método | Ruta | Descripción | Autenticación |
|---|---|---|---|
| `GET` | `/api/older-adults` | Lista solo los perfiles del familiar autenticado. | `Bearer <token>` + correo verificado |
| `POST` | `/api/older-adults` | Crea un perfil con nombre, PIN y zona horaria. | `Bearer <token>` + correo verificado |
| `GET` | `/api/older-adults/:id` | Devuelve un perfil propio. | `Bearer <token>` + correo verificado |
| `PUT` | `/api/older-adults/:id` | Actualiza nombre, zona horaria y, opcionalmente, el PIN. | `Bearer <token>` + correo verificado |

Ejemplo de creación:

```json
{
  "name": "María",
  "pin": "4821",
  "timeZone": "America/Bogota"
}
```

La respuesta `201` incluye el perfil y el mensaje `Perfil creado. Queda pendiente de vincular.`
El objeto público devuelve `_id`, `name`, `timeZone`, `linkStatus`, `pinConfigured`, `createdAt` y
`updatedAt`; **nunca** devuelve el PIN ni su hash.

### Validaciones y reglas

- El **nombre** es obligatorio, se recorta y debe tener entre 2 y 80 caracteres.
- El **PIN** debe tener exactamente 4 números (`^\d{4}$`). Se guarda como hash bcrypt con costo 12
  en el campo oculto `pinHash` y se usa para cerrar la sesión de la app (HU-011).
- Si se omite la **zona horaria** al crear, se guarda `America/Bogota` y la interfaz muestra
  `America/Bogota (Colombia)`. El backend valida que sea una zona IANA válida.
- Los errores de validación responden `400` con `field` (`name`, `pin` o `timeZone`), `code` y un
  mensaje explicativo. El formulario asocia el error al campo correspondiente.
- Al editar, dejar el PIN vacío conserva el PIN actual. Si se envía uno nuevo, se valida y se
  reemplaza el hash.
- `linkStatus` empieza en `pending`; el familiar lo cambia a `linked` al canjear el código y vuelve
  a `pending` al desvincular. No se puede cambiar desde el formulario de perfil.
- Todas las consultas usan `familiar: req.user._id`. Un perfil de otra cuenta responde `404` tanto
  al consultarlo como al intentar editarlo, sin revelar que existe.
- Las rutas se montan con `requireAuth` + `requireVerifiedEmail`; la página usa
  `ProtectedRoute requireVerified`.

### Decisiones de negocio pendientes

- **Uso del PIN:** se almacena hasheado y se solicita para cerrar la sesión de la app (HU-011).
  Falta confirmar con negocio que este sea el uso definitivo.
- **Cantidad de adultos mayores por familiar:** no se impone un límite mientras no se defina la
  regla de negocio. La implementación permite varios perfiles por cuenta.
- **Historial tras desvincular:** se conserva en la base de datos, pero falta definir si debe
  mostrarse después de una nueva vinculación.

## Vinculación de la app del adulto mayor (HU-006 a HU-011)

La app del adulto mayor es una superficie web pública dentro del mismo frontend, en `/app`. No
requiere correo ni contraseña: el adulto mayor solo escribe o escanea un código que le entrega su
familiar. El panel familiar sigue usando JWT; la app usa un token propio y separado.

### HU-006: generar el código de vinculación

La página `/adultos-mayores` muestra el botón **Generar código de vinculación** únicamente para
perfiles con `linkStatus: "pending"`. Al generarlo se muestran:

- el código en formato `XXXX-XXXX`;
- el QR equivalente;
- la fecha y hora de vencimiento (24 horas después, en la zona horaria del adulto mayor);
- un botón para copiar el código.

El código usa el alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sin `I`, `O`, `0` ni `1` para evitar
confusiones), tiene 8 caracteres y se guarda **solo como hash SHA-256** en `linkCodeHash`. Generar
un código nuevo reemplaza el hash anterior, por lo que el código viejo deja de servir de inmediato.
El canje es atómico: un código usado no se puede reutilizar y un perfil ya vinculado no permite
generar otro código.

El QR contiene `acompanamiento://vincular?codigo=XXXX-XXXX`. El prefijo se puede cambiar con
`LINK_QR_BASE_URL`. La imagen PNG se genera en el backend y se entrega como data URL.

| Método | Ruta | Descripción | Autenticación |
|---|---|---|---|
| `POST` | `/api/older-adults/:id/linking-code` | Genera código y QR para un perfil propio pendiente. | `Bearer <token>` + correo verificado |
| `POST` | `/api/linking/redeem` | Canjea el código desde la app del adulto mayor. | No |

Estados de error del canje: `LINK_CODE_REQUIRED` (`400`), `LINK_CODE_INVALID` (`400`),
`LINK_CODE_EXPIRED` (`410`), `LINK_CODE_USED` (`409`), `CONSENT_REQUIRED` (`400`),
`CONSENT_VERSION_OUTDATED` (`409`) y `LINK_ATTEMPTS_LOCKED` (`429`).

### HU-007: vincular la app con el código

La pantalla `/app/vincular` permite escribir el código o escanear el QR con la cámara. Si el
navegador no soporta la lectura de QR o el usuario no da permiso a la cámara, el campo de texto
sigue disponible como alternativa. La pantalla avisa cuando no hay conexión y no intenta canjear el
código en ese estado.

Con un código válido, vigente y con el consentimiento aceptado, el backend vincula el perfil,
devuelve un token de sesión y la app entra a `/app`. Si el código es incorrecto, venció o ya fue
usado, la app muestra el mensaje sencillo **“Pídele a tu familiar un código nuevo.”**

Los intentos fallidos se cuentan por IP (hash SHA-256, sin guardar la IP en texto plano) en la
colección `LinkAttempt`. Después de **5 intentos fallidos**, la IP queda bloqueada **15 minutos** y
la API responde `429` con `code: "LINK_ATTEMPTS_LOCKED"` y `Retry-After`. Un canje correcto limpia
el contador. Como el frontend se sirve detrás de Nginx, el backend usa `trust proxy` para leer la IP
real desde `X-Forwarded-For`.

La sesión de la app se guarda en `localStorage` bajo una clave distinta a la del familiar. El token
tiene 32 bytes aleatorios, se guarda hasheado (SHA-256) en `OlderAdult.appSessionHash`, vence a los
**180 días** y viaja en la cabecera `X-Older-Adult-Token`. Nunca se usa el JWT del familiar para la
app del adulto mayor. Cuando la sesión vence, el perfil vuelve a `pending` y se limpia el
consentimiento, de modo que el familiar pueda generar un código nuevo.

### HU-008: consentimiento

Antes de completar la vinculación, la app muestra en letra grande y lenguaje sencillo qué
información se comparte:

- si el adulto mayor cumplió sus actividades;
- sus alertas de ayuda;
- su ubicación cuando pide ayuda.

El texto y su versión viven en `backend/src/constants/consent.js` (versión actual `1.0`) y se
sirven desde `GET /api/app/consent`. Si el adulto mayor no acepta, la vinculación no se completa y
la app muestra que **no se compartirá nada**. Si acepta, se guardan `consent.version` y
`consent.acceptedAt` en el perfil.

Si en el futuro cambia la versión del texto, la app detecta `consent.required` y pide aceptarlo de
nuevo antes de seguir; las rutas de actividades responden `403` con
`code: "CONSENT_VERSION_OUTDATED"` mientras el consentimiento no esté vigente. El texto se puede
volver a leer desde `/app/ajustes`. Si el adulto mayor rechaza el texto nuevo, la sesión se mantiene
pero no se muestra ninguna actividad hasta que lo acepte; así no se comparte nada y no se obliga a
pedir un código nuevo.

> **Validación legal pendiente:** los datos de salud y ubicación son datos sensibles según la Ley
> 1581 de 2012 (Colombia). El texto incluido es un borrador funcional y debe ser revisado y validado
> por un asesor jurídico antes de publicarse.

### HU-009: mantener la sesión abierta

Mientras el token de la app exista y no haya sido revocado, abrir `/app` lleva directamente a las
actividades, sin pedir correo ni contraseña. La rutina del día se guarda en `localStorage`; si no
hay internet, la app muestra la última rutina guardada y avisa que está en modo sin conexión. Al
recuperar la conexión vuelve a consultar el servidor. Si el familiar desvinculó el perfil, la
siguiente consulta recibe `401`, la app borra el token y muestra un aviso con el enlace para
vincularse de nuevo. Esto también cubre el caso de una desvinculación ocurrida mientras el celular
estaba sin internet.

### HU-010: desvincular

La página `/adultos-mayores` muestra el botón **Desvincular** para perfiles vinculados. Antes de
ejecutar la acción se abre un diálogo que explica que la app dejará de mostrar actividades y
alertas, que el adulto mayor verá un aviso y que el historial de actividades se conserva. Solo el
familiar dueño del perfil puede desvincular; cualquier otra cuenta recibe `404`.

Al confirmar:

- `linkStatus` vuelve a `pending`;
- se limpian el código, la sesión de la app y el consentimiento;
- la app del adulto mayor deja de poder consultar actividades;
- se puede generar un código nuevo para vincular otro celular.

El historial de actividades y cumplimientos **no se borra**. La decisión de negocio sobre si ese
historial debe verse después de una nueva vinculación sigue pendiente.

| Método | Ruta | Descripción | Autenticación |
|---|---|---|---|
| `POST` | `/api/older-adults/:id/unlink` | Desvincula un perfil propio. | `Bearer <token>` + correo verificado |

### HU-011: cerrar sesión con el PIN

Desde `/app/ajustes` el adulto mayor puede pulsar **Cerrar sesión con mi PIN**. El diálogo pide el
PIN de 4 números y se puede cancelar en cualquier momento para volver a las actividades.

- PIN correcto: se borra la sesión de la app, el perfil vuelve a `pending` y se vuelve a
  `/app/vincular`. El familiar puede generar un código nuevo para que el adulto mayor entre otra vez.
- PIN incorrecto: se muestra **“PIN incorrecto.”** y la sesión sigue activa.
- Después de **5 PIN incorrectos consecutivos**, el perfil queda bloqueado **5 minutos** y la API
  responde `429` con `code: "PIN_ATTEMPTS_LOCKED"` y `Retry-After`.
- Un PIN correcto reinicia el contador de intentos.

| Método | Ruta | Descripción | Autenticación |
|---|---|---|---|
| `GET` | `/api/app/session` | Devuelve el perfil y el estado del consentimiento. | `X-Older-Adult-Token` |
| `POST` | `/api/app/consent` | Acepta o rechaza el consentimiento vigente. | `X-Older-Adult-Token` |
| `POST` | `/api/app/logout` | Cierra la sesión con PIN. | `X-Older-Adult-Token` |

**Decisión de negocio pendiente:** confirmar que el PIN se usa para cerrar sesión. Si no se
confirma, HU-011 debe retirarse.

## Actividades y rutina (HU-012 a HU-015)

La página protegida `/actividades` permite al familiar seleccionar uno de sus adultos mayores y
gestionar sus actividades. El formulario muestra siempre la zona horaria del adulto mayor y guarda
la fecha y la hora interpretadas en esa zona.

### Crear una actividad (HU-012)

Campos obligatorios: título, ícono, fecha y hora. El título tiene un máximo de **60 caracteres**; la
interfaz muestra el contador y el aviso al superar el límite. Los íconos disponibles son
`medicina`, `comida`, `ejercicio`, `cita`, `paseo` y `otro`.

Si la fecha y hora ya pasaron, la API responde `409` con
`code: "ACTIVITY_PAST_REQUIRES_CONFIRMATION"` y el panel pide confirmar o corregir. Solo se pueden
crear actividades para un perfil propio; un `olderAdultId` de otra cuenta responde `404`.

La app del adulto mayor consulta sus actividades cada 30 segundos mientras la pestaña está visible,
por lo que un cambio aparece en menos de 1 minuto con conexión.

### Repetición (HU-013)

Tipos disponibles:

- `once`: una sola vez, en la fecha indicada;
- `daily`: todos los días desde la fecha inicial;
- `weekly`: solo en los días de la semana marcados.

Para `weekly` se debe marcar al menos un día; si no, la API responde
`code: "ACTIVITY_WEEKDAYS_REQUIRED"`. El panel muestra un resumen como **“Lunes, miércoles y
viernes”**. Las actividades recurrentes no tienen fecha de finalización en esta versión.

### Editar (HU-014)

Al guardar, la plantilla se actualiza para las ocurrencias desde hoy en adelante. Las ocurrencias
ya completadas conservan una **instantánea** con el título, ícono, hora y repetición que tenían al
marcarse; por eso los días anteriores no cambian y la actividad de hoy sigue marcada como completada
si ya lo estaba. Se aplican las mismas validaciones de HU-012.

### Eliminar (HU-015)

Antes de eliminar se pide confirmación. La actividad se marca como inactiva (`active: false`) y
deja de aparecer y de generar ocurrencias desde hoy; el historial de cumplimientos se conserva. Si
el celular del adulto mayor estaba sin internet, la actividad desaparece en la siguiente consulta
al reconectarse. Una actividad eliminada no genera avisos de incumplimiento.

| Método | Ruta | Descripción | Autenticación |
|---|---|---|---|
| `GET` | `/api/activities` | Lista actividades propias; acepta `?olderAdultId=`. | `Bearer <token>` + correo verificado |
| `POST` | `/api/activities` | Crea una actividad. | `Bearer <token>` + correo verificado |
| `GET` | `/api/activities/:id` | Devuelve una actividad propia. | `Bearer <token>` + correo verificado |
| `PUT` | `/api/activities/:id` | Actualiza una actividad propia. | `Bearer <token>` + correo verificado |
| `DELETE` | `/api/activities/:id` | Elimina lógicamente una actividad propia. | `Bearer <token>` + correo verificado |
| `GET` | `/api/app/activities?date=YYYY-MM-DD` | Ocurrencias del día para la app. | `X-Older-Adult-Token` + consentimiento vigente |
| `POST` | `/api/app/activities/:id/complete` | Marca una ocurrencia como hecha. | `X-Older-Adult-Token` + consentimiento vigente |
| `DELETE` | `/api/app/activities/:id/complete?date=YYYY-MM-DD` | Retira la marca de una ocurrencia. | `X-Older-Adult-Token` + consentimiento vigente |

Ejemplo de creación:

```json
{
  "olderAdultId": "665f...",
  "title": "Tomar la medicina de la mañana",
  "icon": "medicina",
  "date": "2026-10-26",
  "time": "08:30",
  "repeatType": "weekly",
  "weekdays": [1, 3, 5],
  "confirmPast": false
}
```

### Accesibilidad de la app del adulto mayor

Las pantallas `/app`, `/app/vincular` y `/app/ajustes` usan la clase `.senior-app`: letra base de
**20 px**, textos que no bajan de `1em`, botones e inputs grandes, foco visible y contraste alto.
El objetivo es que el adulto mayor pueda leer y tocar los controles sin depender de texto pequeño.

### Decisiones de negocio pendientes

- Validar el texto del consentimiento con un asesor jurídico (Ley 1581 de 2012).
- Definir si el historial de actividades se conserva visible después de una nueva vinculación.
- Confirmar el uso del PIN para cerrar sesión (HU-011).
- Confirmar las opciones definitivas de repetición y si se necesita fecha de finalización.
- Definir la lista final de íconos con diseño.

## Despliegue con Docker

```bash
docker compose up -d --build
docker compose logs -f backend
docker compose logs -f frontend
```

El frontend se sirve con Nginx en el puerto `3201` y hace proxy de `/api` hacia `http://backend:3701`. MongoDB queda disponible en el puerto `4301` del host y persiste en el volumen `mongo_data`.

El despliegue automático se dispara al hacer push a la rama `prod`; GitHub Actions se conecta por SSH al servidor y ejecuta `docker compose up -d --build`.

## Validación local

```bash
# Backend
cd backend
npm install
node --check src/index.js
node --check src/routes/auth.routes.js
node --check src/routes/olderAdult.routes.js
node --check src/routes/link.routes.js
node --check src/routes/app.routes.js
node --check src/routes/activity.routes.js
node --check src/models/User.js
node --check src/models/OlderAdult.js
node --check src/models/LinkAttempt.js
node --check src/models/Activity.js
node --check src/models/ActivityCompletion.js
node --check src/services/olderAdult.service.js
node --check src/services/olderAdultSession.service.js
node --check src/services/linkAttempt.service.js
node --check src/services/activity.service.js
node --check src/utils/dateTime.js
node --check src/middleware/auth.js
node --check src/middleware/olderAdultAuth.js
node --check src/middleware/requireVerifiedEmail.js
node --check src/services/verification.service.js
node --check src/services/passwordReset.service.js
node --check src/services/email.service.js

# Frontend
cd frontend
npm ci
npm run typecheck
npm run build
```

Las pruebas aisladas de las historias HU-006 a HU-015 cubren, sin necesidad de MongoDB:

- formato, hash, vencimiento de 24 horas, invalidación y un solo uso del código de vinculación;
- QR, guardia de perfil ya vinculado y bloqueo de 5 intentos por 15 minutos;
- consentimiento obligatorio, versión, fecha de aceptación y reaceptación;
- sesión de la app, token hasheado, desvinculación y detección de sesión inválida;
- PIN correcto, PIN incorrecto, bloqueo de 5 intentos por 5 minutos y cancelación;
- validaciones de actividades, fecha pasada, repetición diaria/semanal, ocurrencias por zona
  horaria, instantáneas de cumplimiento y eliminación lógica.

> Las pruebas de navegador y de Docker no se pudieron ejecutar en el entorno de desarrollo porque
> Docker no está instalado. La compilación de producción del frontend sí se validó con
> `npm run build`.

## Notas de seguridad

- No subas `.env` al repositorio.
- Cambia `JWT_SECRET` en el servidor.
- En producción, configura `CORS_ORIGIN` con el dominio real.
- Configura `APP_URL` con el dominio público; si no, los enlaces apuntarán a `localhost`.
- Usa credenciales SMTP de aplicación y no la contraseña principal del proveedor.
- Los tokens de confirmación se guardan hasheados, vencen a las 24 horas y no se reutilizan.
- Los tokens de recuperación se guardan hasheados, vencen a los 60 minutos y no se reutilizan; al cambiar la contraseña se invalidan las sesiones anteriores.
- El PIN del adulto mayor se guarda como hash bcrypt y nunca se devuelve en las respuestas; se usa para cerrar la sesión de la app (HU-011).
- Los códigos de vinculación se guardan como hash SHA-256, vencen a las 24 horas, sirven una sola vez y se invalidan al generar uno nuevo.
- Los intentos fallidos de vinculación se limitan por IP (hash) a 5 intentos y 15 minutos; los de PIN a 5 intentos y 5 minutos por perfil.
- El token de la app se guarda hasheado, vence a los 180 días y viaja en `X-Older-Adult-Token`; no se mezcla con el JWT del familiar.
- Las rutas de la app del adulto mayor exigen sesión y consentimiento vigente; al desvincular, al cerrar sesión con PIN o al vencer la sesión se revoca el acceso y se limpia el consentimiento.
- El consentimiento registra versión y fecha de aceptación. El texto legal debe validarse antes de publicarse.
- Los perfiles, actividades y cumplimientos se filtran siempre por el familiar autenticado; no se puede consultar ni modificar datos de otra cuenta.
- Las rutas de funciones deben usar `requireAuth` + `requireVerifiedEmail`; el panel usa `ProtectedRoute requireVerified`.
- El token del familiar se guarda en `localStorage`; para un entorno de mayor riesgo considera cookies `httpOnly`.
- El registro público no permite elegir rol para evitar escaladas de privilegios.

## Skills del proyecto

OpenCode descubre estas skills locales en `.opencode/skills/`:

- `mern-contract-audit`: compara cada llamada del frontend con su ruta, autenticación, payload,
  respuesta, validaciones y códigos de error del backend. Incluye la matriz vigente en
  `references/contract-matrix.md`.
- `mern-fullstack-change`: orden de trabajo para implementar una HU de extremo a extremo sin
  romper las anteriores.
- `docker-local-validation`: validación estática y smoke tests de Docker Compose, Nginx y MongoDB.

## Auditoría de contrato pendiente

La revisión de HU-006 a HU-015 confirmó que todas las llamadas del frontend tienen ruta y
validación en el backend. Queda una decisión de producto/legal: el texto del consentimiento
menciona **alertas de ayuda** y **ubicación al pedir ayuda**, pero esas funciones todavía no están
implementadas. Antes de publicar, el asesor jurídico debe decidir si se retiran del texto o si se
implementan en una HU posterior.
