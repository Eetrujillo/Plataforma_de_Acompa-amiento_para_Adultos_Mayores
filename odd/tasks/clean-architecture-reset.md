# Clean architecture reset — MERN + Vertical Slice + Hexagonal

Rebuild backend and frontend from zero over the existing MERN skeleton, keeping delivery
config (docker, CI, env) intact. Branch: `feat/clean-architecture-reset`.

## Specs

S1. Preserve or create, never delete: `docker-compose.yml`, `backend/Dockerfile`,
`frontend/Dockerfile`, `frontend/nginx.conf`, `.github/workflows/prod.yml`, `.env`.

S2. Total cleanup: delete legacy code inside `backend/src/` and `frontend/src/`. Keep only base
config (`package.json`, `vite.config.mjs`, `capacitor.config.json`).

S3. Backend hierarchy exactly:
`backend/prisma/schema.prisma`; `backend/src/{config,shared/{middlewares,errors},modules/{auth,pairing,activities,sos_emergency}}`
with `domain/`, `application/`, `infrastructure/` inside each module. Slices: auth (User, Login,
RegisterCaregiver, Express controller, Prisma Mongo repository), pairing (6-digit code rules,
GeneratePairingCode, LinkSeniorApp, controller, repository, QR generator), activities (Activity,
CreateActivity, GetDailyRoutine, MarkCompleted, router, Prisma Mongo adapter), sos_emergency
(SosAlert + GPS coordinates, TriggerSosAlert, ResolveSosAlert, controller, socket/push adapter).

S4. `prisma/schema.prisma` datasource uses `provider = "mongodb"` and `url = env("DATABASE_URL")`.

S5. Entry point `backend/src/server.js` listens on port `3500`, CORS enabled, and
`GET /api/health` responds exactly `{"status":"ok","db":"mongodb"}`.

S6. Frontend hierarchy exactly:
`frontend/src/app/{routes,providers,config}`, `frontend/src/shared/{components,services,utils}`,
`frontend/src/features/{auth,pairing,activities,sos_emergency}` (activities and sos_emergency with
`ui/caregiver` and `ui/senior`), `frontend/src/pages/{caregiver/DashboardPage.jsx,senior/SeniorHomePage.jsx}`.

S7. `frontend/src/app/routes/AppRouter.jsx` uses React Router v6 and
`Capacitor.isNativePlatform()`: native default redirect `/senior`, web default redirect `/caregiver`.

S8. Minimal accessible `/senior` layout: large SOS button, body text 20px or larger. `/caregiver`
gets a basic dashboard.

S9. `frontend/src/shared/services/apiClient.js` is an Axios client to
`http://IP_VPS:3500/api` (VPS host configurable via env, web falls back to `/api` behind nginx).

S10. Final check: `npm run build` succeeds in both folders and no import is broken after the wipe.

## Tasks

| ID | Specs | Route | Commit |
|----|-------|-------|--------|
| T1 | S1,S2 | inline | chore: reset legacy sources |
| T2 | S3,S4 | inline | feat(backend): prisma schema, shared kernel, auth and pairing slices |
| T3 | S3 | inline | feat(backend): activities and sos emergency slices with socket adapter |
| T4 | S5,S10 | inline | feat(backend): server entrypoint on 3500 with health contract |
| T5 | S6,S7,S9 | inline | feat(frontend): app shell, router and shared services |
| T6 | S6,S8 | inline | feat(frontend): feature slices and accessible senior/caregiver pages |
| T7 | S1,S9,S10 | inline | chore: align docker, nginx and env for port 3500 |
| T8 | S10 | inline | verify: builds and health smoke test |

## Log

L1 (user, verbatim):

> vamos empezar casi de 0 Actúa como Arquitecto de Software Senior y Lead Full-Stack Developer. Vamos a reiniciar el proyecto desde cero para implementar una arquitectura limpia basada en **MERN Stack (MongoDB, Express, React, Node.js)** junto a **Vertical Slice Architecture + Arquitectura Hexagonal**.
>
> ### ARCHIVOS QUE DEBES PRESERVAR O CREAR (¡NO DESTRUIR!):
> - `docker-compose.yml` (Configurado para MongoDB en puerto 27017)
> - `backend/Dockerfile`
> - `frontend/Dockerfile`
> - `frontend/nginx.conf`
> - Archivos de CI/CD (`.github/workflows/` o `.gitlab-ci.yml`)
> - `.env`
>
> ### TAREA 1: LIMPIEZA TOTAL
> 1. Elimina todo el código heredado dentro de `backend/src/` y `frontend/src/`.
> 2. Conserva únicamente los archivos de configuración base (`package.json`, `vite.config.mjs`, `capacitor.config.json`).
>
> ### TAREA 2: ESTRUCTURA BACKEND (Vertical Slice + Hexagonal + Prisma MongoDB)
> Reconstruye `backend/src/` con la siguiente jerarquía: prisma/schema.prisma; src/config; src/shared/{middlewares,errors}; src/modules/{auth,pairing,activities,sos_emergency} con domain/application/infrastructure. Configura `prisma/schema.prisma` usando `provider = "mongodb"`. Crea un punto de entrada en `backend/src/server.js` (o `index.js`) escuchando en el puerto `3500`, con middleware CORS activado y un endpoint funcional `GET /api/health` que responda `{"status": "ok", "db": "mongodb"}`.
>
> ### TAREA 3: ESTRUCTURA FRONTEND (Vertical Slice + React Router + Capacitor)
> Reconstruye `frontend/src/` con app/{routes,providers,config}, shared/{components,services,utils}, features/{auth,pairing,activities,sos_emergency} y pages/{caregiver,senior}. En `AppRouter.jsx` implementá `Capacitor.isNativePlatform()`: nativo -> `/senior`, web -> `/caregiver`. Maquetación inicial mínima accesible de `/senior` (botón grande SOS, texto 20px+) y `/caregiver` (dashboard básico). `apiClient.js` (Axios a `http://IP_VPS:3500/api`).
>
> ### COMPROBACIÓN FINAL:
> Verifica que la aplicación compile sin fallos ejecutando `npm run build` en ambas carpetas y que no existan librerías o importaciones rotas tras el borrado.

L2 (evidence). Repository facts found before the wipe:
- `docker-compose.yml` maps Mongo `4301:27017` (spec note says 27017; internal port is 27017, host is 4301) and `frontend` port `3201:3201`; `backend` port comes from `${BACKEND_PORT}:${BACKEND_INTERNAL_PORT}`.
- `backend/Dockerfile` EXPOSE was `3505`; `frontend/Dockerfile` ran `node dist/main.js` (broken: Vite emits static assets, no node server); `frontend/nginx.conf` did not exist; `.env` did not exist; `frontend/capacitor.config.json` did not exist.
- Legacy `frontend/src` was TypeScript (`.tsx`) with no TS toolchain in `package.json`; legacy `backend/src/index.js` had a duplicated/corrupted body.

L3 (decision). Technical conflicts resolved without touching product scope:
- Backend listens on `3500` (S5 wins over the legacy `3505`); `EXPOSE`/compose/env realigned to 3500.
- `frontend/nginx.conf` created and `frontend/Dockerfile` turned into a build stage + nginx runtime, the only coherent way for that file to matter; nginx listens on `3201` to keep compose port mapping.
- Mongo host port stays `4301` (S1 preserve); flagged to the user.
- Prisma MongoDB does not support `enum`, so role/status fields are `String`; ids use `@id @default(auto()) @map("_id") @db.ObjectId`.
- Backend is CommonJS (matches legacy runtime, zero transpile risk); frontend is ESM/JSX.
