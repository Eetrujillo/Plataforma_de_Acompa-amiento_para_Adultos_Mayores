# Plataforma de Acompañamiento para Adultos Mayores

Aplicación web full stack para el acompañamiento de adultos mayores y sus familias.
El repositorio contiene el backend, el frontend y la configuración de despliegue.

## Stack

- **Backend:** Node.js 20, Express 4, Mongoose 8, MongoDB 7.
- **Frontend:** React 18, Vite 5, TypeScript, React Router 7.
- **Infraestructura:** Docker Compose, Nginx, GitHub Actions.
- **Autenticación:** bcrypt para contraseñas, JWT para el familiar y token propio para la app del adulto mayor.

## Estructura

```
backend/
  src/
    models/       # User, OlderAdult, LinkAttempt, Activity, ActivityCompletion
    routes/       # auth, olderAdult, link, app, activity
    services/     # correo, verificación, recuperación, perfiles, sesión, actividades
    middleware/   # auth, olderAdultAuth, requireVerifiedEmail, errorHandler
    constants/    # texto de consentimiento, íconos y tipos de repetición
    utils/        # fechas, zonas horarias, ocurrencias
frontend/
  src/
    components/   # auth, ui, app
    pages/        # panel familiar
    pages/app/    # app del adulto mayor
    context/      # AuthProvider
    hooks/
    services/     # apiClient, auth, perfiles, app, actividades
    styles/       # globals.css
mongo-init/init.js
docker-compose.yml
```

## Puesta en marcha

```bash
cp .env.example .env          # recomendado: ajustar JWT_SECRET antes de usar
docker compose up -d --build
docker compose logs -f backend
```

Docker Compose incluye valores locales por defecto para `MONGO_URL` y `JWT_SECRET`,
por lo que también puede arrancarse sin `.env`. El secreto por defecto es solo para
desarrollo local: configura un `JWT_SECRET` largo y aleatorio en `.env` antes de
desplegar o exponer la aplicación.

| Servicio | Puerto host | Puerto interno |
|---|---|---|
| Frontend (Nginx) | `3201` | `80` |
| Backend | `3505` | `3701` |
| MongoDB | `4301` | `27017` |

Nginx y el proxy de Vite apuntan siempre al puerto interno **3701** del backend.

Desarrollo sin Docker:

```bash
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

Sin `SMTP_HOST`, el backend imprime en consola los enlaces de confirmación y
recuperación. El contenedor corre con `NODE_ENV=production` y **no** los imprime.

Para crear una cuenta de familiar verificada (o verificar una cuenta existente) en un despliegue sin SMTP, ejecuta
`docker compose exec -it backend npm run user:create` en el servidor. El comando
solicita nombre y correo; si la cuenta ya existe sin verificar, pide confirmación
antes de marcarla verificada. Para cuentas nuevas también solicita contraseña y
confirmación de aceptación de privacidad; la contraseña no se muestra en pantalla.
Después inicia sesión desde `/login`. Úsalo solo para aprovisionar cuentas autorizadas:
no desactiva la autenticación.

## Variables de entorno

Ver `.env.example` para la lista completa. Las críticas:

| Variable | Descripción |
|---|---|
| `MONGO_URL` | Conexión a MongoDB. En Docker: `mongodb://mongo:27017/mearn_db`. |
| `JWT_SECRET` | Secreto de firma. Obligatorio en producción. |
| `APP_URL` | URL pública usada en los enlaces de correo. |
| `CORS_ORIGIN` | Origen permitido. Vacío permite cualquiera. |
| `SMTP_*` | Servidor de correo. Obligatorio en producción. |
| `LINK_QR_BASE_URL` | Prefijo del contenido del QR de vinculación. |

## Reglas del proyecto

Estas reglas son obligatorias para cualquier cambio. Un PR que las incumpla no se integra.

### Alcance y compatibilidad

- Mantener el comportamiento de **HU-001 a HU-020**. Un cambio no puede romper una HU anterior.
- Trabajar por módulo y por HU, de forma incremental.
- El stack es MongoDB + Express + React. No introducir otra base de datos ni otro framework sin decisión de equipo.
- Todo cambio debe funcionar con Docker Compose; es el entorno de despliegue.

### Autenticación y sesión

- El **familiar** se autentica con JWT en `Authorization: Bearer`. El registro público
  siempre crea rol `familiar`; `admin` y otros roles se asignan fuera del registro.
- El **adulto mayor** no tiene correo ni contraseña: usa un token propio en
  `X-Older-Adult-Token`, guardado en una clave de `localStorage` distinta a la del familiar.
  Nunca se usa el JWT del familiar para la app del adulto mayor.
- Las rutas de funciones se montan con `requireAuth` + `requireVerifiedEmail`; el panel usa
  `ProtectedRoute requireVerified`. Una cuenta sin correo confirmado solo accede a
  `/verificar-correo`.
- Los errores de credenciales no revelan cuál dato falló. Los mensajes genéricos se mantienen
  también en recuperación de contraseña.
- Las rutas de la app del adulto mayor exigen sesión vigente y consentimiento aceptado.
- Credenciales, tokens y PIN se guardan siempre hasheados y nunca se devuelven en respuestas.

### Aislamiento de datos

- Toda consulta de perfiles, actividades y cumplimientos se filtra por el familiar autenticado.
- Un recurso de otra cuenta responde `404`, no `403`: no se revela que existe.
- El registro público no permite elegir rol.

### Consentimiento y datos sensibles

- El texto y la versión del consentimiento viven en `backend/src/constants/consent.js`.
- Se registra versión y fecha de aceptación. Si la versión cambia, la app pide aceptarla de nuevo.
- Sin consentimiento vigente no se muestra ninguna actividad ni se comparte información.
- Los datos de salud y ubicación son datos sensibles (Ley 1581 de 2012, Colombia). **El texto del
  consentimiento es un borrador funcional y requiere validación de un asesor jurídico antes de
  publicarse.**

### Accesibilidad del adulto mayor

- Las pantallas de `/app` usan la clase `.senior-app`: letra base de **20 px**, textos que no
  bajan de `1em`, controles grandes, foco visible y contraste alto.
- No introducir texto pequeño ni depender del color como único indicador.
- El QR es opcional: el campo de texto para el código siempre debe estar disponible.

### Avisos de actividades (HU-016)

- El aviso se calcula desde `scheduledAt`, que ya es un instante absoluto: no se hacen cuentas
  de zona horaria en el cliente.
- El segundo aviso depende del estado real de la actividad. Si se marca como hecha antes, no se
  envía.
- El aviso en pantalla (`ActivityReminderHost`) funciona aunque las notificaciones del sistema
  estén bloqueadas. Es el canal de respaldo, no un extra.
- **Límite de la plataforma web:** los avisos se disparan con la app abierta. Con la pestaña
  cerrada el navegador no ejecuta temporizadores, y sin internet no hay Web Push. Cubrir ese caso
  requiere Web Push con servidor o una app nativa.

### Actividades del día (HU-017)

- **"Hoy" se calcula con la zona horaria del celular**, no con la del perfil. La pantalla envía
  el día como `GET /api/app/activities?date=YYYY-MM-DD` y el backend respeta esa fecha.
- La hora visible también se calcula desde `scheduledAt` en la zona del celular, para que la
  fecha y la hora de la lista no se contradigan si el perfil tiene otra zona.
- La lista se ordena por hora en el cliente además de venir ordenada del backend.
- El estado se escribe con texto (`Pendiente` / `Completada`), no solo con color.
- Sin conexión se muestra la última lista guardada con un aviso compacto, nunca una pantalla vacía.

### Marcar una actividad como hecha (HU-018)

- El cambio se ve **antes** de que responda el servidor.
- Si el servidor rechaza la marca (la actividad ya no existe o no corresponde al día), vuelve a
  "Pendiente" y se avisa del error. Si el fallo es de conexión, la marca queda en cola (HU-019).
- Después de marcar aparece **"Deshacer" durante 10 segundos**, con la cuenta atrás en el propio
  botón. Al vencer, la acción desaparece.
- Dos toques seguidos cuentan como una sola confirmación: el segundo toque se ignora mientras la
  primera llamada sigue en curso, y el backend guarda una sola marca por actividad y día.
- La hora que se muestra es la que guardó el servidor (`completedAt`), no la del reloj del
  celular. Un segundo toque no mueve esa hora.
- El botón de marcar ocupa todo el ancho de la tarjeta y mide **64 px de alto**, la misma medida
  del botón principal de la app. Es la medida mínima de diseño para esta pantalla.

### Completar actividades sin internet (HU-019)

- Cada marca se guarda primero en el celular (`localStorage`), antes de intentar el envío. Sin
  conexión, la actividad se ve completada igual y no se pierde.
- La cola se envía sola: al recuperar la conexión, al volver a la app y cada 15 segundos. El
  criterio de menos de un minuto se cumple con el evento `online` más ese ciclo.
- Se envía `completedAt` con la hora real del toque, no la del envío. El backend la valida (solo
  tolera 10 minutos de reloj adelantado) y la guarda en la marca.
- Un fallo pasajero no pierde la marca: se reintenta sin intervención. Solo se descarta si el
  servidor responde que la actividad ya no aplica (`400` o `404`).
- "Deshacer" funciona sin conexión mientras la marca siga en la cola.
- HU-028 (avisos de incumplimiento) todavía no existe. Lo que sí queda resuelto es el dato que
  necesita: la marca conserva la hora real del toque aunque llegue tarde.

### Estado de las actividades del día (HU-020)

- El familiar ve cada actividad de hoy como **Pendiente**, **Completada** o **Vencida**, siempre
  con el texto visible y no solo con color.
- El estado lo calcula el backend en `GET /api/activities/today`. El umbral de 30 minutos vive
  solo en `activity.service.js` (`EXPIRATION_GRACE_MINUTES`); el cliente recibe `expiresAt` y
  únicamente adelanta el paso a "Vencida" cuando ese instante ya pasó.
- La pantalla `/hoy` se refresca sola cada **8 segundos**, y también al volver a la pestaña o al
  recuperar el foco. Así una marca del adulto mayor se ve en menos de 10 segundos sin recargar.
- En las completadas se muestra la hora real de la marca (`completedAt`) en la zona del celular
  del familiar.
- Solo se consultan los perfiles del familiar autenticado: un perfil de otra cuenta responde
  `404`. Sin actividades hoy se muestra un acceso directo para crear una en ese perfil.
- El día por defecto es el "hoy" del adulto mayor, calculado con su zona horaria.

### Validación antes de commitear

```bash
# Backend
cd backend
Get-ChildItem src -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }

# Frontend
cd frontend
npm run typecheck
npm run build
```

- No commitear con `node --check`, `typecheck` o `build` en rojo.
- No commitear `.env`, credenciales, llaves ni artefactos de `dist/`.
- El push es manual y lo ejecuta la persona responsable de la rama.

## Historias de usuario

El alcance y el estado de cada historia viven en el tablero de Jira del proyecto:

<https://unimayor-team-qv3i018t.atlassian.net/jira/software/projects/SCRUM/boards/1/backlog?selectedIssue=SCRUM-30>

Este README documenta cómo está construida la plataforma y qué se puede verificar en el
código; Jira es la fuente única para el seguimiento de las HU.

## Endpoints

| Grupo | Rutas | Autenticación |
|---|---|---|
| Autenticación | `/api/auth/register`, `/login`, `/verify-email`, `/resend-verification`, `/forgot-password`, `/reset-password` | No |
| Cuenta | `GET /api/auth/me` | JWT |
| Perfiles | `GET/POST /api/older-adults`, `GET/PUT /api/older-adults/:id`, `POST /:id/unlink` | JWT + correo verificado |
| Vinculación | `POST /api/older-adults/:id/linking-code`, `POST /api/linking/redeem` | JWT / público |
| Actividades | `GET/POST /api/activities`, `GET /api/activities/today`, `GET/PUT/DELETE /api/activities/:id` | JWT + correo verificado |
| App del adulto mayor | `GET /api/app/session`, `POST /api/app/consent`, `POST /api/app/logout`, `GET /api/app/activities`, `POST/DELETE /api/app/activities/:id/complete` | `X-Older-Adult-Token` |
| Estado | `GET /api/health` | No |

Las respuestas de error usan `{ error, code }` con un `code` estable para que el frontend
pueda distinguir el caso sin comparar mensajes.

## Despliegue

```bash
docker compose up -d --build
```

El despliegue automático se dispara al hacer push a la rama `prod`: GitHub Actions se conecta
por SSH al servidor y ejecuta `docker compose up -d --build`.

## Notas de seguridad

- No subir `.env`. Rotar `JWT_SECRET` en el servidor.
- Configurar `CORS_ORIGIN` y `APP_URL` con el dominio real en producción.
- Usar credenciales SMTP de aplicación, no la contraseña principal del proveedor.
- El token del familiar vive en `localStorage`; para un entorno de mayor riesgo, evaluar cookies `httpOnly`.
- Los parámetros concretos de bloqueo, vigencia de tokens y algoritmos de hash se documentan en
  el código, no en este archivo.

## Skills del proyecto

OpenCode descubre estas skills locales en `.opencode/skills/`:

- `mern-fullstack-change`: orden de trabajo para implementar una HU de extremo a extremo.
- `mern-contract-audit`: compara cada llamada del frontend con su ruta, autenticación, payload,
  respuesta, validaciones y códigos de error del backend.
- `docker-local-validation`: validación estática y smoke tests de Compose, Nginx y MongoDB.

## Pendientes

- Validar el texto de consentimiento con un asesor jurídico.
- El texto menciona alertas de ayuda y ubicación al pedir ayuda; esas funciones no están
  implementadas. Decidir si se retiran del texto o se implementan en una HU posterior.
- Confirmar el uso del PIN para cerrar sesión (HU-011).
- Confirmar el segundo aviso a los 10 minutos y si ese plazo es el definitivo (HU-016).
- Definir si el historial se muestra tras una nueva vinculación.
- Añadir suite de pruebas automatizadas al repositorio.
