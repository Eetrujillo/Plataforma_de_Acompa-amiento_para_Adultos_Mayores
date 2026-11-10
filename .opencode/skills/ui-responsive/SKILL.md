---
name: ui-responsive
description: Checklist responsive para el frontend de la plataforma (navbar, hero, grids, timeline). Trigger: rediseñar o implementar pantallas UI, o corregir desbordes responsive.
---

# UI responsive — checklist del frontend

Aplica a `frontend/src` (React 18 + Vite, estilos globales BEM en `src/styles/globals.css`, base 20px).

## Disparadores

- Implementar un artboard de `design/` en el stack real.
- Reporte de desborde o navbar roto en mobile/tablet.

## Reglas (aprendidas en el lobby post-login, commit f03ab96)

1. **Navbar compacto**: paddings `0.45rem 0.9rem`, links `font-size 0.85rem`,
   `min-height 44px` (touch), `white-space: nowrap` en brand y links.
2. **Pestañas**: envolver el texto en `.topbar__link-label` y poner `aria-label`
   completo en el `<a>` — permite modo solo-iconos sin perder accesibilidad.
3. **Breakpoints del lobby**: `60rem` (paneles a 1 columna), `48rem` (pestañas en
   una fila `overflow-x: auto` + `scrollbar-width: none`, stats a ancho completo,
   timeline con `flex-wrap`), `30rem` (solo iconos, sin nombre de marca).
4. **Grids que nunca desbordan**: `repeat(auto-fill, minmax(min(100%, 320px), 1fr))`
   — `min(100%, Npx)` evita el desborde en viewports < N.
5. **Stats/tiles flexibles**: `flex: 1 1 7.5rem; min-width: 0` en vez de
   `min-width` fijo grande.
6. **Anclas bajo navbar sticky**: `scroll-margin-top: 5.5rem` en cada sección.
7. **Animaciones**: revelado con IntersectionObserver + clase `is-visible`;
   siempre cancelar en `@media (prefers-reduced-motion: reduce)`.

## Checklist antes de cerrar

- [ ] Probar a 375px, 768px y 1280px (devtools responsive).
- [ ] `npm run build` OK.
- [ ] Foco visible y touch targets ≥ 44px.
