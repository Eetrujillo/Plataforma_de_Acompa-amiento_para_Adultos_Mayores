# Design System — Plataforma de Acompañamiento para Adultos Mayores (rama prod, hexagonal)

Fuente única: `frontend/src/styles/globals.css` del árbol de prod/dev-kevin alineado (post merge `5ea0426`). Valores tomados tal cual del código; nada inventado. Reemplaza la versión anterior (que documentaba el frontend TSX legacy, hoy eliminado).

Reverificado el 2026-11-11 contra `frontend/src/styles/globals.css` (896 líneas): los 30 tokens de `:root` coinciden 1:1 con esta tabla; sin valores nuevos.

## Colores

| Token | Valor | Uso | Fuente |
| --- | --- | --- | --- |
| `--color-bg` | `#f4f7fa` | Fondo de página | globals.css `:root` |
| `--color-surface` | `#ffffff` | Tarjetas, formularios | globals.css `:root` |
| `--color-ink` | `#10202b` | Texto principal | globals.css `:root` |
| `--color-ink-soft` | `#3d5262` | Texto secundario | globals.css `:root` |
| `--color-primary` | `#0f3d5c` | Azul petróleo principal | globals.css `:root` |
| `--color-primary-strong` | `#0a2b42` | Hover/énfasis primario | globals.css `:root` |
| `--color-accent` | `#1f7a8c` | Acento (focos de input) | globals.css `:root` |
| `--color-accent-strong` | `#17616f` | Acento fuerte | globals.css `:root` |
| `--color-danger` / `--color-danger-strong` | `#b3261e` / `#8c1c16` | Errores | globals.css `:root` |
| `--color-success` | `#1e6b3a` | Éxito | globals.css `:root` |
| `--color-border` | `#c8d6e0` | Bordes | globals.css `:root` |

### Tokens cálidos del login (rediseño aceptado)

| Token | Valor | Uso |
| --- | --- | --- |
| `--color-login-sky` | `#fbeed7` | Fondo crema del área de login y cabecera de tarjeta |
| `--color-login-sky-soft` | `#fdf6e9` | Crema más claro (degradados) |
| `--color-login-heading` | `#123a5a` | Títulos del login |
| `--color-login-muted` | `#5f7486` | Texto secundario del login |
| `--color-login-field-bg` / `--color-login-field-border` | `#fdfcf9` / `#ece2cf` | Inputs del login (crema) |
| `--color-login-heart` | `#f2b134` | Dorado de marca (corazón, acentos cálidos) |
| `--color-login-leaf` | `#bfe0ea` | Hojas decorativas (ilustración) |
| `--color-login-skin/hair/glasses/cheek/shirt-a/shirt-b` | `#f3c9a8` `#d7dbe0` `#4a3b2f` `#e88f8f` `#2f6f5e` `#9a7bc4` | Paleta de personajes (ilustración) |

## Tipografía

- Familia: `system-ui` stack (globals.css `body`); sin webfonts.
- Base: `--font-base: 20px` (`html { font-size: var(--font-base) }`) — el proyecto entero usa base 20px, mayor que el estándar, por la audiencia senior.
- Iconos: emoji inline en UI; SVG inline para iconos de formulario (Person/Lock/Eye de LoginScreen).

## Espaciado y forma

- Radios: `--radius-md: 12px` (inputs, botones), `--radius-lg: 20px` (tarjetas), `--radius-xl: 28px` (tarjeta de login).
- Sombra: `--shadow-md: 0 6px 18px rgba(16, 32, 43, 0.12)`.
- Inputs de login: `min-height 3.4rem`, borde 1.5px crema, foco con `--color-accent`.

## Reglas de componentes (de globals.css y los componentes de prod)

- Clases BEM por feature: `.login__card`, `.login__field`, etc. Estilos globales en `globals.css`, nada de CSS modules.
- Botones: `shared/components/PrimaryButton.jsx` con variantes (primary/secondary), prop `block` para ancho completo.
- Alertas: `.alert .alert--error` / `.alert--success` con `role="alert"`/`role="status"`.
- Ilustración del login: imagen 3D del usuario (`/abuelitos-abrazados.jpeg`) en `LoginIllustration.jsx`, marco crema redondeado.
- Accesibilidad: labels `sr-only` con iconos decorativos, foco visible, contraste AA.

## Estructura de vistas (para nuevos diseños)

- `frontend/src/features/<dominio>/ui/caregiver/` — vistas del familiar.
- `frontend/src/features/<dominio>/ui/senior/` — vistas del adulto mayor.
- Rutas en `frontend/src/app/routes/AppRouter.jsx`; estilos solo en `globals.css`.

## Nota

Diseño aceptado vigente: login cálido "Tarjeta centrada refinada" (`design/login/`, artboard 02). Próximas pantallas candidatas: dashboard del familiar (`/caregiver`), rutina diaria del senior, composer de actividades.
