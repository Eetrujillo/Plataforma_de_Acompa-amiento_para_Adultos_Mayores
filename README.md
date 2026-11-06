# Plataforma de Acompañamiento para Adultos Mayores

MERN (MongoDB, Express, React, Node.js) con **Vertical Slice Architecture** y
**Arquitectura Hexagonal**. Cada feature es una slice independiente con su dominio,
sus casos de uso y sus adaptadores.

## Estructura

```
backend/
├── prisma/schema.prisma          # datasource mongodb
└── src/
    ├── config/                   # env, prisma client, socket.io
    ├── shared/{middlewares,errors}
    ├── modules/
    │   ├── auth/{domain,application,infrastructure}
    │   ├── pairing/{domain,application,infrastructure}
    │   ├── activities/{domain,application,infrastructure}
    │   └── sos_emergency/{domain,application,infrastructure}
    ├── app.js                    # ensambla routers, CORS, /api/health
    └── server.js                 # composition root, puerto 3500

frontend/src/
├── app/{routes,providers,config}
├── shared/{components,services,utils}
├── features/{auth,pairing,activities,sos_emergency}
└── pages/{caregiver,senior}
```

Regla de dependencia: `domain` no importa nada de `application` ni de
`infrastructure`. Los casos de uso reciben sus puertos (`userRepository`,
`tokenService`, `notifier`, ...) y la composition root de cada slice decide qué
adaptador concreto inyectar.

## Base de datos

Mongo corre como **replica set de un nodo** (`rs0`) y el servicio `mongo-rs-init` lo inicializa en
cada `up` (idempotente). No es capricho: Prisma envuelve las escrituras en una transacción y MongoDB
solo soporta transacciones sobre un replica set; en modo standalone todo `create` falla con `P2031`.

La URL queda fijada en `docker-compose.yml` (`mongodb://mongo:27017/mearn_db?replicaSet=rs0`), así que
un valor viejo en `.env` no puede romper el arranque.

## Puertos

| Servicio | Host | Contenedor |
|----------|------|------------|
| Frontend (nginx) | 3201 | 3201 |
| Backend (Express) | 3500 | 3500 |
| MongoDB | 4301 | 27017 |

El frontend web consume `/api` y nginx lo proxya al backend; el build nativo
(Capacitor) usa `VITE_API_URL`.

## Puesta en marcha con Docker

```bash
cp env.sample .env       # requerido por compose (env_file)
docker compose up -d --build
```

- Web: http://localhost:3201
- API: http://localhost:3500/api/health → `{"status":"ok","db":"mongodb"}`

## Desarrollo local

```bash
# backend
cd backend
cp env.sample .env       # MONGO en localhost:4301
npm install
npm run build            # prisma generate
npm run dev              # http://localhost:3500

# frontend
cd frontend
npm install
npm run dev              # http://localhost:3201 (proxy /api -> :3500)
```

## Correo de verificación

El registro manda un enlace por SMTP. Sin `SMTP_HOST` el enlace solo se imprime en el log del
backend: alcanza para probar, no para usuarios reales. Configuración paso a paso, con Gmail, SMTP
del dominio o un servicio transaccional: **[docs/smtp-setup.md](docs/smtp-setup.md)**.

## Endpoints

| Método | Ruta | Rol |
|--------|------|-----|
| GET | `/api/health` | público |
| POST | `/api/auth/register` | público |
| POST | `/api/auth/login` | público |
| POST | `/api/auth/verify-email` | público (token del correo) |
| POST | `/api/auth/resend-verification` | público (202; 429 si se excede el límite) |
| POST | `/api/auth/forgot-password` | público (202; 429 si se excede el límite) |
| POST | `/api/auth/reset-password` | público (token del correo) |
| GET | `/api/auth/me` | autenticado |
| POST | `/api/seniors` | cuidador (perfil del adulto mayor con PIN y zona horaria) |
| GET | `/api/seniors` | cuidador (solo los perfiles propios) |
| GET | `/api/seniors/:id` | cuidador (404 si no es propio) |
| POST | `/api/pairing/codes` | cuidador |
| GET | `/api/pairing/seniors` | cuidador |
| POST | `/api/pairing/link` | público (código de 6 dígitos) |
| POST | `/api/activities` | cuidador |
| GET | `/api/activities/daily?seniorId=&date=` | cuidador / adulto mayor |
| PATCH | `/api/activities/:id/complete` | adulto mayor |
| POST | `/api/sos` | adulto mayor |
| GET | `/api/sos/active` | cuidador |
| PATCH | `/api/sos/:id/resolve` | cuidador |

Socket.IO: el cuidador se une a su room con
`io(url, { query: { caregiverId } })` y recibe `sos:triggered` / `sos:resolved`.

## Verificación

```bash
cd backend && npm run build && npm test   # prisma generate + node:test
cd frontend && npm run build              # vite build
```

## Accesibilidad

- Tipografía base de 20px y botón SOS de 14rem de alto.
- Contraste alto, foco visible de 4px y estados anunciados con `aria-live`.
- Toda la rutina se opera con botones grandes; el código de vinculación es
  numérico y acepta `inputMode="numeric"`.
