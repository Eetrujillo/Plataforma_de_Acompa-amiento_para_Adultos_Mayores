---
name: hexagonal-module
description: "Trigger: crear un módulo, dominio, slice o endpoint nuevo en el backend hexagonal (HU nueva, caso de uso nuevo). Plantilla exacta de módulo de prod: CommonJS, composition root, tests sobre HTTP real."
---

# Módulo hexagonal (backend de prod)

Arquitectura canónica. Cada dominio vive en `backend/src/modules/<dominio>/` con esta forma exacta:

```
backend/src/modules/<dominio>/
├── domain/
│   └── <Entidad>.js          # Entidad + validaciones + errores de dominio (ValidationError de src/shared/errors)
├── application/
│   └── <CasoDeUso>.js        # Un caso de uso por archivo; clase con constructor({ repositorio, ... })
├── infrastructure/
│   ├── <Entidad>Repository.js      # Prisma<Entidad>Repository: la ÚNICA capa que toca Prisma
│   ├── <Entidad>Controller.js      # create<Entity>Controller({ casoDeUso1, ... }) → handlers Express
│   └── <entidad>Routes.js          # create<Entity>Router({ controller, authMiddleware })
└── index.js                  # Composition root: create<Entity>Module({ prisma, userRepository, authMiddleware })
```

## Reglas

- **CommonJS** (`require`/`module.exports`), `'use strict';` arriba. No ESM en backend.
- **domain** no importa Express ni Prisma. Errores: `throw new ValidationError(...)` / `new AppError(msg, { statusCode, code })` de `src/shared/errors`.
- **application** recibe sus dependencias por constructor, nunca las importa. Retorna DTOs simples.
- **infrastructure** es la única capa que conoce Express y Prisma. El controller traduce req/res ↔ casos de uso; el repositorio implementa la interfaz que la capa application espera.
- **index.js** (composition root) inyecta todo y exporta `{ router, <entidad>Repository }`. Ejemplo real: `src/modules/activities/index.js`.

## Wiring

1. En `src/app.js` hay un `if (modules.<dominio>)` por módulo montando su router en `${API_PREFIX}/<dominio>`. Agregar el propio siguiendo el patrón exacto de `activities`.
2. En el server entrypoint que construye la app, crear el módulo con sus dependencias reales (`new PrismaXRepository({ prisma })`) y pasarlo en `modules`.

## Tests (obligatorios, sobre HTTP real)

- Archivo: `backend/tests/<dominio>.test.js` con **`node:test` + `node:assert/strict`**. Runner: `npm test` (glob `tests/*.test.js`).
- Patrón de prod: levantar la app con un repositorio en memoria (fake que implementa la interfaz del repositorio), llamar endpoints reales con `fetch` y asertar status + cuerpo + efecto persistido. Ejemplos: `tests/activity.test.js`, `tests/authLogin.test.js`.
- Testear validaciones de dominio puro (`Activity.create`) y errores (`assert.throws` + `ValidationError`) sin HTTP cuando el caso sea de dominio.

## Checklist antes de cerrar

- [ ] `node --test tests/<dominio>.test.js` en verde
- [ ] `npm test` completo en verde
- [ ] Sin imports de Express/Prisma en domain/application
- [ ] Rutas montadas con `authMiddleware` cuando el recurso es privado
- [ ] README actualizado solo si agregás endpoints públicos nuevos
