# Despliegue: un backend para la web y la app

Documento de arquitectura para el despliegue futuro. **No describe algo que ya esté
desplegado**: hoy no hay ningún backend publicado con las 20 HU. Es el plano que hay que
seguir cuando se decida publicar.

## Principio rector

Hay **un solo backend** y **una sola base de datos**. La web y la app móvil son dos
clientes del mismo servicio:

- La cuenta creada en la web existe en la app y viceversa.
- Los perfiles de adulto mayor, las actividades y las marcas son los mismos registros.
- No hay endpoints "para móvil" ni un segundo `DATABASE_URL`.

Todo lo que sigue existe solo para que ambos clientes lleguen a ese único backend.

## Estado actual

| Pieza | Estado |
|---|---|
| `prod_local/backend` (hexagonal + Prisma, puerto 3500) | Implementado, 106 pruebas, sin desplegar |
| `prod_local/frontend` (Vite, 20 HU, puerto 3201) | Implementado, `build` OK, sin desplegar |
| `App Mobile/` (Expo SDK 58, 20 HU) | Implementado, `expo export` OK, sin publicar |
| `prod_local/docker-compose.yml` | Escribe el stack completo (mongo + backend + frontend) |
| CI/CD (`.github/workflows/prod.yml`) | Solo despliega la rama `prod` (arquitectura antigua de 5 rutas) |
| Backend antiguo `backend/` (Mongoose, 3701) | Legado; **no** es el objetivo de la app |

La rama `prod` desplegada **no** tiene `/api/older-adults`, `/api/linking`, `/api/app`,
`/api/activities`, `/api/sos` ni el modelo Prisma. Por eso la app no puede apuntar hoy a
ese despliegue: hace falta publicar `prod_local`.

## Topología objetivo

```
                        Internet
                           |
                 +---------+----------+
                 |                    |
          navegador (web)        Expo Go / build nativo
                 |                    |
                 |  HTTPS             |  HTTPS
                 v                    v
        +------------------+   +------------------+
        |  Nginx  :443     |   |  API pública     |
        |  - SPA estática  |   |  /api, /socket.io|
        |  - /api proxy    |   +--------+---------+
        +--------+---------+            |
                 |                      |
                 +----------+-----------+
                            |
                    +-------v--------+
                    |  backend :3500 |
                    |  Express + IO  |
                    +-------+--------+
                            |
                    +-------v-------------------+
                    |  Mongo 7, replica set rs0 |
                    |  volumen persistente      |
                    +---------------------------+

                 +-------------------+
                 | SMTP (verificación |
                 | y recuperación)    |
                 +-------------------+
```

El backend escucha en `0.0.0.0:3500` (`httpServer.listen(config.port)`, sin host), así
que sirve igual detrás de Nginx, en la red local o en un contenedor.

## Puertos y componentes

| Componente | Puerto interno | Puerto publicado (compose) | Notas |
|---|---|---|---|
| `backend` | 3500 | `BACKEND_PORT` (3500) | Express + Socket.IO en el mismo servidor |
| `frontend` (nginx) | 3201 | `FRONTEND_PORT` (3201) | SPA compilada + proxy `/api` y `/socket.io` |
| `mongo` | 27017 | 4301 | Solo para administración; no debe exponerse a Internet |
| `mongo-rs-init` | — | — | Inicia `rs0` de forma idempotente en cada `up` |

`mongo` **no** debe publicarse en producción. El `4301:27017` del compose es para
inspección local; en el VPS se quita ese `ports` o se restringe a `127.0.0.1:4301:27017`.

## Cómo resuelve la URL cada cliente

### Web

Se compila con `VITE_API_URL` (por defecto `/api`). Al servirse desde el mismo origen que
la API, el navegador no necesita CORS ni URL absoluta.

### App móvil

`App Mobile/src/config.ts` (`DEFAULT_API_BASE`) y `App Mobile/src/services/apiBase.ts`
resuelven en este orden:

1. `EXPO_PUBLIC_API_BASE`, si está definida en build o `.env`.
2. La IP del PC que sirve Expo (`Constants.expoConfig.hostUri`) + `:3500`.
3. `http://10.0.2.2:3500/api` en el emulador de Android; `localhost:3500` en web/iOS.

Y en tiempo de ejecución la URL guardada en la pantalla **Configurar servidor**
(`/conexion`, clave `gap_api_base` en AsyncStorage) tiene prioridad sobre
`DEFAULT_API_BASE`. Toda petición pasa por `getApiBase()`.

Consecuencia práctica: **la app no necesita recompilarse** para cambiar de backend, y la
web puede quedarse con `/api` relativo aunque la app use una URL absoluta.

## Variables de entorno por entorno

### Desarrollo en red local (probar con Expo Go sin desplegar)

| Variable | Valor |
|---|---|
| `DATABASE_URL` | `mongodb://localhost:4301/mearn_db?replicaSet=rs0` o un cluster Atlas `mongodb+srv://...` |
| `NODE_ENV` | `development` (habilita `/api/auth/dev/verify-email`) |
| `CORS_ORIGIN` | `*` |
| `APP_URL` | `http://localhost:3201` |
| `EXPO_PUBLIC_API_BASE` | `http://IP-DEL-PC:3500/api` (o dejar que se autodetecte) |

Requisitos del teléfono: misma red Wi-Fi, firewall de Windows abriendo `3500` y `8081`,
y el backend en marcha. Atlas sirve como base porque ya es replica set y evita montar
`rs0` a mano.

### Producción

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` — **desactiva** `/api/auth/dev/verify-email` |
| `JWT_SECRET` | `openssl rand -hex 32`; obligatorio, el backend no arranca sin él |
| `CORS_ORIGIN` | el origen exacto de la web (por ejemplo `https://acompanamiento.example`) |
| `APP_URL` | URL pública de la web; de ahí salen los enlaces de correo |
| `SMTP_*` | obligatorio para que verificación y recuperación lleguen de verdad |
| `MONGO_URL` / `DATABASE_URL` | `mongodb://mongo:27017/mearn_db?replicaSet=rs0` |

`DATABASE_URL` y `MONGO_URL` están fijados en `docker-compose.yml` a propósito: el stack
es dueño de `rs0` sobre el host `mongo`. Para usar Atlas hay que reemplazar **ambos**
valores en el compose.

Los enlaces de correo que se generan son:

- Verificación → `${APP_URL}/confirmar-correo?token=...`
- Recuperación → `${APP_URL}/restablecer-contrasena?token=...`

Si cambian las rutas del frontend hay que cambiar `buildVerificationLink` y
`PasswordRecovery`. Sin SMTP el enlace solo se imprime en la consola del backend, y por
eso el registro no sirve para usuarios reales.

## Nginx: dos formas válidas

**A. Un solo dominio con `/api` (recomendado para la web).** Es lo que ya hace
`prod_local/frontend/nginx.conf`: sirve la SPA y hace proxy de `/api/` y `/socket.io/` a
`backend:3500`, con `Upgrade`/`Connection` para Socket.IO y *fallback* a `index.html`
para React Router.

**B. Subdominio dedicado para la API.** `https://api.example.com` → `backend:3500`, y la
app usa `EXPO_PUBLIC_API_BASE=https://api.example.com/api`. Útil si se quiere escalar la
API aparte o servir la app web estática en un CDN.

En ambos casos hace falta TLS. Si el VPS ya tiene un proxy propio (Traefik, Caddy, Nginx
del sistema), el `nginx` del compose puede quedarse en HTTP interno y el TLS termina
afuera; hay que propagar `X-Forwarded-Proto` para que `req.ip` y los enlaces salgan bien.

## Datos

- **Replica set obligatorio.** Prisma envuelve las escrituras en transacciones y Mongo
  solo las ofrece en replica set; con `mongod` suelto toda escritura falla con `P2031`.
  En Docker lo resuelve `mongo-rs-init`; en Atlas viene incluido.
- **Esquema.** `prisma/schema.prisma` define `User`, `OlderAdult`, `Activity`,
  `ActivityCompletion`, `VerificationToken`, `PasswordResetToken`, `LinkAttempt`,
  `PairingCode`, `SosAlert`. Los cambios se aplican con `prisma db push` (el proyecto no
  usa migraciones versionadas todavía).
- **Campos ausentes.** El código filtra con
  `{ OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }` y `NOT: { active: false }`
  porque Mongo no distingue `null` de campo inexistente.
- **Respaldo.** `mongodump` programado sobre el volumen `mongo_data`, o el backup
  automático de Atlas si se usa la nube. Probar la restauración, no solo el respaldo.
- **Una sola base.** Si la web y la app apuntan a bases distintas, se rompe el requisito
  de cuenta compartida aunque el código sea correcto.

## Compose de producción (propuesta)

Partir del `docker-compose.yml` actual y añadir solo lo que falta:

```yaml
services:
  mongo:
    # quitar el "ports" o dejarlo en 127.0.0.1:4301:27017
    restart: always

  backend:
    restart: always
    # NODE_ENV=production viene del env_file
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3500/api/health"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 20s

  frontend:
    restart: always
```

Pendiente de decidir antes de publicar:

- **TLS**: ¿Nginx del compose con certificados, o un proxy del VPS por delante?
- **SMTP**: proveedor real (Brevo, Gmail con contraseña de aplicación, etc.). Ver
  `docs/smtp-setup.md`.
- **Secretos**: `JWT_SECRET` fuera del repositorio; idealmente variables del VPS o un
  gestor de secretos, nunca un `.env` versionado.
- **Web de Expo (opcional)**: `npx expo export --platform web` genera `dist/`. Hoy pesa
  ~1.1 MB de JS (300 KB gzip) frente a 261 KB de Vite, así que la web de producción
  debería seguir siendo Vite; la exportación de Expo sirve para probar, no para reemplazar
  la web.

## CI/CD (propuesta)

El workflow actual solo reacciona a `prod`:

```yaml
on:
  push:
    branches: [prod]
```

Para publicar `prod_local` hay dos caminos:

1. **Rama de despliegue dedicada** (`prod_local` o `deploy`): cambiar `on.push.branches`
   y el `PROD_BRANCH` del secreto. No mezclar con `prod` mientras la arquitectura vieja
   siga viva.
2. **Despliegue manual** en el VPS: `git fetch && git checkout <rama> && git pull &&
   docker compose up -d --build`.

En ambos casos, antes de reiniciar:

```bash
docker compose exec backend npx prisma db push
docker compose exec backend node -e "require('./src/config/database').connectDatabase()"
```

y después, comprobar `/api/health`.

## Checklist de despliegue

- [ ] `prod_local/.env` creado desde `env.sample`, con `NODE_ENV=production`.
- [ ] `JWT_SECRET` generado y fuera del repositorio.
- [ ] `APP_URL` con el dominio real (sin `localhost`).
- [ ] `CORS_ORIGIN` con el origen exacto de la web.
- [ ] SMTP configurado y probado con un registro real.
- [ ] `docker compose up -d --build` sin errores y `rs0` con primario.
- [ ] `npx prisma db push` aplicado.
- [ ] `/api/health` responde 200 desde fuera del servidor.
- [ ] Registro → correo → `/confirmar-correo` funciona en la web.
- [ ] La misma cuenta inicia sesión en la app (mismos datos).
- [ ] `/api/auth/dev/verify-email` responde **404** (prueba de que no quedó expuesta).
- [ ] Socket.IO conecta a través del proxy (avisos SOS del familiar).
- [ ] Respaldo programado y restauración probada.
- [ ] Puerto de Mongo no accesible desde Internet.

## Verificación post-despliegue

```bash
curl -sS https://DOMINIO/api/health
# {"status":"ok","db":"mongodb"}

curl -sS -o /dev/null -w "%{http_code}\n" https://DOMINIO/api/older-adults
# 401 (existe la ruta y exige sesión)

curl -sS -o /dev/null -w "%{http_code}\n" -X POST https://DOMINIO/api/auth/dev/verify-email
# 404 (la ruta de desarrollo NO está montada)
```

## Riesgos y decisiones abiertas

| Riesgo | Mitigación |
|---|---|
| Publicar `prod` (5 rutas) y creer que la app funciona | Desplegar `prod_local`; verificar `/api/older-adults` y `/api/app/consent` |
| Web y app con bases distintas | Un solo `DATABASE_URL`; comprobar con la misma cuenta |
| `dev/verify-email` expuesta en producción | `NODE_ENV=production` + prueba 404 en el checklist |
| Mongo sin replica set | `mongo-rs-init` o Atlas; nunca `mongod` suelto |
| Enlaces de correo a `localhost` | `APP_URL` público; el backend avisa por consola si no lo es |
| Sin SMTP | El registro queda inservible para usuarios reales; configurar antes de publicar |
| `CORS_ORIGIN=*` en producción | Restringir al dominio de la web |
| Datos de adultos mayores (Ley 1581) | TLS, backups cifrados, acceso mínimo, consentimiento versionado |

## Resumen en una frase

Un `docker compose` con Mongo en replica set, el backend de `prod_local` en 3500 y la SPA
en 3201 detrás de TLS; la web usa `/api` relativo y la app usa
`EXPO_PUBLIC_API_BASE=https://DOMINIO/api`. Ambos hablan con el mismo backend y la misma
base, que es lo que hace que la cuenta y los datos sean los mismos.
