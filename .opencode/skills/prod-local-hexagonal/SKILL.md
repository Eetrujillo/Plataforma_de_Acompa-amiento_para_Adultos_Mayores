# Skill: prod_local (hexagonal + Prisma)

# prod_local: arquitectura de `prod` con las 20 HU

Usar esta skill al tocar `prod_local/` (backend hexagonal, frontend de 20 HU, app móvil
conectada). No confundir con el backend antiguo de `backend/src` (Mongoose por capas).

## Puertos y arranque

| Servicio | Puerto |
|---|---|
| Backend (`prod_local/backend`) | 3500 |
| Frontend Vite | 3201 |
| Mongo del compose | 4301 |

```bash
cd prod_local/backend
npm install
$env:DATABASE_URL="mongodb://localhost:4301/mearn_db?directConnection=true"
npx prisma generate
npm run dev

cd ../frontend && npm install && npm run dev
```

Sin Mongo el backend arranca; las rutas que consultan devuelven `503 DATABASE_UNAVAILABLE`.
Las escrituras necesitan el replica set `rs0` (Prisma usa transacciones).

## Estructura de un slice

```
modules/<slice>/
├── domain/            reglas puras (sin Prisma, sin Express)
├── application/       casos de uso; reciben puertos por constructor
├── infrastructure/    Prisma*Repository, Controller, Routes
└── index.js           composition root: arma el router y expone puertos
```

Regla: `domain` no importa `application` ni `infrastructure`. El repositorio nunca
habla HTTP y el controlador nunca habla Prisma.

## Contratos que no se deben romper

- **Errores:** `{ error: { code, message, details } }`. `details.field` para resaltar un
  campo; `details.retryAfterSeconds` para bloqueos. Los clientes aceptan además la
  forma plana antigua.
- **Usuario público:** incluye `id` y `_id`, `fullName` y `name`, `emailVerified`,
  `privacyPolicy`. `role` interno es `CAREGIVER` o `SENIOR`.
- **App del adulto mayor:** token JWT en `X-Older-Adult-Token` (o `Bearer`), claims
  `{ sub, role: 'SENIOR', sessionVersion }`.
- **Rutas del familiar:** `/api/older-adults`, `/api/activities`, `/api/linking`.
- **App:** `/api/app/{consent,session,activities,logout}`.

## Trampas resueltas

1. **Mongo no distingue null de ausente.** `deletedAt: null` no encuentra documentos
   sin el campo. Filtrar con
   `{ OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }`.
   Para `active`, usar `NOT: { active: false }`.
2. **`sessionVersion`.** Se incrementa al desvincular, cerrar sesión con PIN o cambiar
   contraseña. El middleware del adulto mayor y el guard del familiar lo comparan;
   sin eso, un token viejo sigue sirviendo.
3. **Marca idempotente.** `ActivityCompletion` tiene
   `@@unique([activityId, occurrenceDate])`. `upsertCompletion` devuelve la marca
   existente: dos toques no mueven la hora de la primera.
4. **Un solo cálculo del día.** `SeniorAppService.buildDay` alimenta
   `/api/app/activities` y `/api/activities/today`. El umbral de 30 minutos está en
   `activityRules.js` (`dayStatus`), no en los controladores.
5. **Enlaces de correo.** Verificación → `/confirmar-correo?token=...`;
   recuperación → `/restablecer-contrasena?token=...`. Si cambian las rutas del
   frontend, cambiar `buildVerificationLink` y `PasswordRecovery`.
6. **Registro.** Acepta `name`/`fullName` y `acceptPrivacyPolicy`/`acceptedTerms`.
   `fullName` es obligatorio (mínimo 3) y el registro no emite JWT.

## Validación

```bash
cd prod_local/backend
node --check src  # por archivo, en PowerShell se recorre con Get-ChildItem
$env:DATABASE_URL="mongodb://localhost:27017/mearn_db"; npm test
npx prisma validate

cd ../frontend
npm run typecheck && npm run build

cd "../../App Mobile"
npx tsc --noEmit && npx expo export --platform web
```

## Checklist al añadir una HU

- [ ] Regla en `domain` con prueba en `tests/` (sin base de datos).
- [ ] Caso de uso en `application`, puertos por constructor.
- [ ] Repositorio Prisma con filtros tolerantes a campos ausentes.
- [ ] Controlador + ruta con el rol correcto.
- [ ] Montaje en `server.js` y, si es del familiar, `verifiedEmailGuard`.
- [ ] Contrato verificado contra el frontend y la app móvil.
