---
name: hu-port
description: "Trigger: portar una HU del código legacy (dev-kevin pre-realineación, HU-001..020) a la arquitectura hexagonal de prod. Checklist de rescate de comportamiento, no de código."
---

# Port de una HU del legacy a prod (hexagonal)

El código legacy de las HU-001..020 existe solo en el historial de git (antes del merge `5ea0426`). Se rescata **comportamiento y contratos**, nunca se copia código.

## Procedimiento

1. **Leer la HU en el legacy (solo lectura, acotado):**
   - `git show 5ea0426^:frontend/src/pages/<Pagina>.tsx` y `git show 5ea0426^:backend/src/...` (el `^` apunta al mundo pre-merge).
   - Extraer: casos de uso, validaciones con sus mensajes EXACTOS en español, estados vacíos, y qué ve cada rol (familiar vs adulto mayor).
   - Presupuesto: 2-3 lecturas máximo. Si la HU necesita más, anotar los hallazgos en la nota de PR y seguir.

2. **Verificar qué ya existe en prod** (`git ls-tree -r --name-only origin/prod -- <area>`): a veces la HU ya está parcialmente cubierta (ej. actividades ya tiene módulo completo).

3. **Backend:** seguir la skill `hexagonal-module`. Dominio con las validaciones del legacy (mismos mensajes de error). Tests en `tests/<dominio>.test.js` con los casos del punto 1.

4. **Frontend:** features por dominio, espejando el backend:
   ```
   frontend/src/features/<dominio>/
   ├── application/<dominio>Api.js     # fetch wrappers (patrón: src/features/auth/application/authApi.js)
   ├── domain/<entidad>.js             # validaciones compartidas cliente (opcional)
   └── ui/
       ├── caregiver/<Componente>.jsx  # vistas del familiar
       └── senior/<Componente>.jsx     # vistas del adulto mayor (letra grande, alto contraste)
   ```
   - JSX, no TS. Componentes con clases BEM (`.<dominio>__elemento`), estilos en `src/styles/globals.css`.
   - Iconos: emoji inline (convención del proyecto). Rutas: registrar en `src/app/routes/AppRouter.jsx`.

5. **Verificación:** `npm test` (backend) + `npm run build` (frontend) + probar el flujo real si la HU toca UX.

## Checklist de port fiel

- [ ] Mensajes de error y textos de UI idénticos al legacy (son contrato de la HU)
- [ ] Comportamiento offline/cola (si la HU del senior lo tenía, ver legacy `completionQueue.ts`) → en prod decidir según HU
- [ ] Accesibilidad senior: base 20px, targets 64px, foco visible (tokens `--color-login-*` de prod son el ejemplo)
- [ ] Un PR por HU, ≤400 líneas. Más de eso: dividir por caso de uso

## Anti-patrones (prohibido)

- Copiar archivos TSX legacy y renombrarlos
- Importar React Router v7 / librerías que prod no tiene
- Crear carpetas fuera de `features/` y `modules/`
- Saltarse los tests HTTP "porque ya funcionaba en el legacy"
