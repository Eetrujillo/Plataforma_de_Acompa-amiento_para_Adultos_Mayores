# prod_local · arquitectura de `prod` + las 20 HU

Copia local de la rama `prod` (Vertical Slice + Arquitectura Hexagonal + Prisma) con
**las 20 historias de usuario de la aplicación anterior portadas a esa arquitectura**.

La diferencia con un merge directo: `prod` reemplaza el backend y el frontend y deja
fuera HU-004 a HU-020. Aquí se conservan las URLs, los contratos y las pantallas de
esas HU, y se reescriben sobre los módulos de `prod`.

```
prod_local/
├── backend/            Express + Prisma + módulos hexagonales (puerto 3500)
├── frontend/           React + Vite con las 17 pantallas (puerto 3201)
├── docker-compose.yml  Mongo replica set rs0 + backend + nginx
├── docs/               Contratos de auth, SMTP, errores, Google
└── env.sample          Variables de Compose
```

## Qué se adaptó de las 20 HU

| HU | Módulo nuevo | Endpoint |
|---|---|---|
| HU-001 Registro | `auth` (extendido) | `POST /api/auth/register` |
| HU-002 Confirmación | `auth` | `POST /api/auth/verify-email`, `POST /api/auth/resend-verification` |
| HU-003 Login | `auth` | `POST /api/auth/login` (bloqueo tras 5 fallos) |
| HU-004 Recuperación | `auth` | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` |
| HU-005 Perfiles | `older_adults` | `GET/POST/PUT /api/older-adults` |
| HU-006 Código | `older_adults` + `pairing` | `POST /api/older-adults/:id/linking-code` |
| HU-007 Canje | `linking` | `POST /api/linking/redeem` |
| HU-008 Consentimiento | `senior_app` | `GET/POST /api/app/consent` |
| HU-009 Sesión persistente | `senior_app` | `GET /api/app/session` |
| HU-010 Desvinculación | `older_adults` | `POST /api/older-adults/:id/unlink` |
| HU-011 Cierre con PIN | `senior_app` | `POST /api/app/logout` |
| HU-012 a HU-015 CRUD | `activities` (extendido) | `GET/POST/PUT/DELETE /api/activities` |
| HU-016 Avisos | cliente (sin cambios) | — |
| HU-017 Rutina del día | `senior_app` | `GET /api/app/activities?date=` |
| HU-018 Marcar hecha | `senior_app` | `POST /api/app/activities/:id/complete` |
| HU-019 Sin internet | `senior_app` + cola del cliente | mismo endpoint, acepta `completedAt` |
| HU-020 Estado del día | `activities` | `GET /api/activities/today?olderAdultId=` |

Se conservan además los módulos que ya traía `prod`: **pairing** (`/api/pairing`) y
**SOS** (`/api/sos`), y el login con Google (`/api/auth/google`).

## Modelo de datos (Prisma)

`User` representa a los dos actores:

- `CAREGIVER`: familiar con correo y contraseña.
- `SENIOR`: adulto mayor. Se crea al registrar el perfil (HU-005) con `caregiverId`,
  `pinHash`, `timeZone` y `linkStatus`. No tiene correo real: usa uno sintético
  `senior+…@seniors.local` para respetar el índice único.

Modelos añadidos:

| Modelo | Para qué |
|---|---|
| `PasswordResetToken` | HU-004, solo se guarda el hash |
| `ActivityCompletion` | marca por actividad y día; `@@unique([activityId, occurrenceDate])` |
| `LinkAttempt` | bloqueo del canje tras 3 fallos por IP |

`Activity` se extendió con `icon`, `timeZone`, `repeatType`, `weekdays`, `active` y
`deletedAt`. La fecha/hora de la primera ocurrencia sigue en `scheduledDate` +
`scheduledTime`, como en `prod`.

## Decisiones de integración

1. **Contrato de error único.** Todo responde
   `{ error: { code, message, details } }`. El frontend y la app móvil leen también la
   forma plana anterior, para no romper clientes viejos.
2. **Compatibilidad de nombres.** El registro acepta `name` o `fullName` y
   `acceptPrivacyPolicy` o `acceptedTerms`. El usuario público incluye `_id`, `name`
   y `emailVerified` además de los campos de `prod`.
3. **Token del adulto mayor.** Se emite un JWT con rol `SENIOR` y `sessionVersion`.
   La app móvil lo envía en `X-Older-Adult-Token` (también se acepta `Bearer`).
4. **Invalidación de sesión.** `sessionVersion` se incrementa al desvincular, cerrar
   sesión con PIN o cambiar la contraseña; el token anterior deja de servir.
5. **Un solo cálculo del día.** La vista del familiar (`/activities/today`) y la app
   (`/app/activities`) usan `SeniorAppService.buildDay`, con el umbral de 30 minutos
   en `activityRules.js`.
6. **Idempotencia de la marca.** `upsertCompletion` no mueve la hora de la primera
   confirmación; dos toques seguidos no crean dos marcas.

## Ejecución con Docker

```bash
cd prod_local
cp env.sample .env
docker compose up -d --build
```

- Web: http://localhost:3201
- API: http://localhost:3500/api/health
- Mongo: `localhost:4301`

## Ejecución local

```bash
# Backend
cd backend
npm install
$env:DATABASE_URL="mongodb://localhost:4301/mearn_db?directConnection=true"   # PowerShell
npx prisma generate
npm run dev       # :3500

# Frontend
cd frontend
npm install
npm run dev       # :3201 (proxy /api -> :3500)
```

Sin Mongo, el backend arranca y responde `/api/health`, `/api/app/consent` y los
401/400 que no tocan la base; cualquier consulta falla con `503
DATABASE_UNAVAILABLE`. Para escribir hace falta el replica set (`rs0`): Prisma
necesita transacciones y Mongo solo las da en replica set.

### Sin Docker y sin Mongo instalado (MongoDB Atlas)

Atlas entrega un replica set, así que Prisma funciona sin montar `rs0` a mano:

1. Crear un cluster M0 gratuito en <https://cloud.mongodb.com>.
2. Copiar la cadena `mongodb+srv://...` en `DATABASE_URL`.
3. Permitir la IP del equipo en *Network Access*.
4. `cd backend && npx prisma db push && npm run dev`.

```powershell
$env:DATABASE_URL="mongodb+srv://usuario:clave@cluster.mongodb.net/mearn_db"
npx prisma db push
npm run dev
```

## Conectar la app móvil (Expo Go)

**La app y la web deben apuntar al mismo backend.** Si cada una usa un servidor
distinto, la cuenta creada en la web no existe en la app y los datos no se
comparten.

La app resuelve la URL así (`App Mobile/src/config.ts`):

1. `EXPO_PUBLIC_API_BASE`, si está definida.
2. La IP del PC que sirve Expo (`Constants.expoConfig.hostUri`) + puerto `3500`.
   En un teléfono con Expo Go esto basta: `localhost` sería el propio teléfono.
3. `10.0.2.2:3500` en el emulador de Android; `localhost:3500` en web/iOS.

Si hace falta otra URL (backend desplegado, otra máquina), se cambia en la app
desde **«Configurar servidor»** (`/conexion`) y queda guardada en el dispositivo
bajo `gap_api_base`. También se puede fijar antes de arrancar:

```
# App Mobile/.env
EXPO_PUBLIC_API_BASE=http://192.168.1.20:3500/api
```

Requisitos para que el teléfono llegue al backend:

- Backend escuchando en `0.0.0.0` (por defecto `httpServer.listen(port)`).
- Teléfono y PC en la misma red Wi-Fi.
- Firewall de Windows permitiendo el puerto `3500` (y `8081` para Expo).
- `CORS_ORIGIN=*` o el origen exacto de la web de Expo.

### Cuenta compartida entre web y app

- El registro (`POST /api/auth/register`) ya devuelve `token`, así que la cuenta
  abre sesión de inmediato; `verifiedEmailGuard` sigue exigiendo el correo
  confirmado antes de operar.
- Sin SMTP, el enlace de confirmación se imprime en la consola del backend. Para
  no depender de la consola, en desarrollo existe
  `POST /api/auth/dev/verify-email` (`{ email }`): la ruta **no se monta** con
  `NODE_ENV=production` y los botones «Confirmar correo ahora (desarrollo)» solo
  aparecen en modo dev (web: `import.meta.env.DEV`, app: `__DEV__`).

## Validación ejecutada

| Comprobación | Resultado |
|---|---|
| `npx prisma validate` | Esquema válido |
| `npm test` (backend) | 106 pruebas (96 de `prod` + HU-012/013/017/019/020 + registro con token) |
| `node --check` (93 archivos) | Sin errores de sintaxis |
| Arranque sin Mongo | `/api/health` 200, `/api/app/consent` 200, rutas protegidas 401 |
| `npm run typecheck` (frontend) | Sin errores |
| `npm run build` (frontend) | 261 KB JS + 23 KB CSS |
| `npx tsc --noEmit` (App Mobile) | Sin errores |
| `npx expo export --platform web` | Exporta sin errores |

## Pendiente

- **Prueba end-to-end con Mongo**: no hay Docker en este entorno; falta registrar,
  verificar, vincular y marcar una actividad contra la base real.
- **HU-016** sigue siendo un aviso del cliente (pantalla + vibración). Notificaciones
  con la app cerrada requieren `expo-notifications` y un build nativo.
- **Escaneo de QR**: la vinculación funciona escribiendo el código.
- **Pruebas de integración** de los módulos nuevos contra Prisma (las actuales son de
  dominio, sin base de datos).
