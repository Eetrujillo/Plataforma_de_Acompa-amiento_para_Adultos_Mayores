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
cp .env.example .env          # ajustar valores
docker compose up -d --build
docker compose logs -f backend
```

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

- Mantener el comportamiento de **HU-001 a HU-015**. Un cambio no puede romper una HU anterior.
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

| HU | Alcance |
|---|---|
| HU-001 | Registro de familiar con aceptación de política de privacidad |
| HU-002 | Confirmación de correo y acceso restringido sin verificar |
| HU-003 | Inicio de sesión, bloqueo por intentos fallidos y vencimiento de sesión |
| HU-004 | Recuperación de contraseña con token de un solo uso |
| HU-005 | Perfiles de adultos mayores por cuenta familiar |
| HU-006 | Generación de código y QR de vinculación |
| HU-007 | Vinculación de la app del adulto mayor con el código |
| HU-008 | Consentimiento informado antes de compartir datos |
| HU-009 | Sesión persistente de la app del adulto mayor |
| HU-010 | Desvinculación del perfil |
| HU-011 | Cierre de sesión de la app con PIN |
| HU-012 | Creación de actividades |
| HU-013 | Repetición diaria y semanal |
| HU-014 | Edición de actividades con conservación del historial |
| HU-015 | Eliminación lógica de actividades |

## Endpoints

| Grupo | Rutas | Autenticación |
|---|---|---|
| Autenticación | `/api/auth/register`, `/login`, `/verify-email`, `/resend-verification`, `/forgot-password`, `/reset-password` | No |
| Cuenta | `GET /api/auth/me` | JWT |
| Perfiles | `GET/POST /api/older-adults`, `GET/PUT /api/older-adults/:id`, `POST /:id/unlink` | JWT + correo verificado |
| Vinculación | `POST /api/older-adults/:id/linking-code`, `POST /api/linking/redeem` | JWT / público |
| Actividades | `GET/POST /api/activities`, `GET/PUT/DELETE /api/activities/:id` | JWT + correo verificado |
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
- Definir si el historial se muestra tras una nueva vinculación.
- Añadir suite de pruebas automatizadas al repositorio.
