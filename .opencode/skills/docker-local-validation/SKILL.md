---
name: Docker Local Validation
description: Validate this project's Docker Compose stack, Dockerfiles, Nginx proxy, health checks, and environment wiring. Use when changing compose services, Dockerfiles, ports, env vars, MongoDB init, or when running local smoke tests.
---

# Docker Local Validation

Validate the three-service stack: `frontend` (Nginx), `backend` (Express), `mongo`.

## Static checks first

```bash
docker compose config
docker compose build
```

Inspect before running:

- Frontend is served by Nginx on host `3201`; `/api` proxies to `http://backend:3701`.
- Backend listens on `0.0.0.0:${BACKEND_INTERNAL_PORT:-3701}`.
- MongoDB is `mongo:27017` inside the network and `${MONGO_PORT:-4301}` on the host.
- `MONGO_URL` uses the service name `mongo`, never `localhost`.
- Required env: `JWT_SECRET`, `APP_URL`, `CORS_ORIGIN`, `SMTP_*`, `LINK_QR_BASE_URL`.
- `.env` is not committed; `.env.example` documents every variable.

## Run and smoke test

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

```bash
curl http://localhost:3201/api/health
curl -i http://localhost:3201/
```

Check:

- `GET /api/health` returns `{"status":"ok"}` through Nginx.
- The SPA loads and deep links such as `/app/vincular` do not 404.
- `POST /api/linking/redeem` reaches the backend and returns a JSON error, not a proxy error.
- MongoDB persists after `docker compose restart`.
- Logs show no missing env, Mongoose, or QR/SMTP warnings that block startup.

## Cleanup

```bash
docker compose down
docker compose down -v   # only when a clean database is intended
```

## If Docker is unavailable

Do not claim the stack was tested. Run the fallback checks instead:

```bash
cd backend && node --check src/index.js
cd ../frontend && npm run typecheck && npm run build
docker compose config   # if the Docker CLI exists without a daemon
```

Report the missing Docker daemon as a blocked validation, not as a pass.
