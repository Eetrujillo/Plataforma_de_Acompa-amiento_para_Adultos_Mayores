# Estado de sesión — Acompañamiento de Adulto Mayor

_Fecha: 2025-11-13 (hora local)._(1) _Origen: sesión de desarrollo con el Gentleman/ODD en `C:/Users/carli/OneDrive/Escritorio/Prueba`._

## Proyecto

- **Nombre**: Acompañamiento de Adulto Mayor — recordatorios de dosificaciones indicadas por un médico, cargadas por un encargado.
- **Audiencia**: web = encargado capacitado (interfaz técnica); app móvil = adulto mayor (simple, tipografía grande).
- **Stack**: Expo SDK 58 + expo-router + TypeScript estricto (app universal web+móvil), AsyncStorage (localStorage en web) como capa única de persistencia local.
- **Carpeta de la app**: `acompanamiento-adulto-mayor/` (local) = `mobile-app/` en el repo remoto.
- **UI copy en español**; identificadores y commits en inglés.

## Estado del repositorio

- Remoto: `https://github.com/Eetrujillo/Plataforma_de_Acompa-amiento_para_Adultos_Mayores.git`
- Rama de trabajo: **`dev-kevin`** (creada desde `origin/main`, push autorizado — SOLO a esta rama).
- `main` del equipo tiene: `backend/` (Node + Prisma + Socket.io), `frontend/` (solo Docker/nginx), `docker-compose.yml`, `mongo-init/`.
- Nuestra app vive en **`mobile-app/`** dentro del repo (integrada por merge de subárbol; historial de 13+ commits progresivos e independientes preservado).
- IMPORTANTE: push solo a `dev-kevin`. `main`/`dev`/`prod` son decisiones del equipo vía PR.

## Funcionalidades implementadas

1. **Landing page** con navbar (Visión/Misión/Información) y botón Log in/Sign up en la esquina → `/auth`.
   - Variante web técnica (`src/app/index.web.tsx`) y móvil simple (`src/app/index.tsx`).
2. **Autenticación local** (sin backend): register/login/logout/getSession en `src/services/auth.ts`, contraseñas con SHA-256 + salt, correo único. Mismo API en web y móvil.
3. **Dashboard** con guardia de sesión y 4 módulos CRUD sobre `src/services/collections.ts` (almacén externo `useSyncExternalStore`): 💊 Dosificación, 🔔 Alertas, 📝 Tareas (toggle), 📅 Citas.
4. **Roles**: `admin`, `adulto_mayor`, `cuidador`, `familiar` (badge en dashboard; selector de rol solo en web).
5. **Usuarios demo sembrados** idempotentemente en cada arranque (`ensureDemoUsers`):
   - `admin@aam.demo` / `admin123` — ⭐ super usuario (rol admin no se modifica jamás)
   - `prueba@aam.demo` / `prueba123` — cuidador (usuario de prueba)
   - `adulto@aam.demo` / `adulto123` — adulto mayor (Don José Pérez)
   - `familiar@aam.demo` / `familiar123` — familiar (María)
6. **Vinculación por QR**:
   - Código único derivado del email del familiar (SHA-256 hex 16 chars) — autoverificable en cualquier dispositivo, sin red.
   - `/mi-qr`: el familiar muestra su QR (web y móvil). Código de María Familiar: `113232101e904ed4`.
   - `/escanear` (solo nativo, expo-camera): invitado → sesión local **adulto_mayor** con `vinculo`; logueado → rol pasa a **cuidador** (salvo admin). Web muestra aviso "El escaneo está solo en la aplicación" (S6).
   - Login en móvil fuerza rol **familiar** en la sesión (salvo admin); registro desde móvil también fija familiar.

## Verificación

- ✅ `tsc --noEmit`, `expo lint`, `expo export --platform web` en verde antes de cada cierre.
- ✅ E2E en Chromium (ego-browser) contra build estático: landing → auth → registro → dashboard → CRUD → persistencia post-reload → borrado en 2 pasos → logout; login de los 4 usuarios demo; Mi QR con SVG visible; aviso S6 en web.
- ⚠️ **Pendiente en dispositivo físico**: escaneo con cámara (invitado → adulto mayor; logueado → cuidador) — implementado y tipado, requiere Expo Go en el teléfono.

## Archivos clave

- `mobile-app/src/content.ts` — textos de la landing (placeholders a reemplazar).
- `mobile-app/src/constants/theme.ts` — paleta colorida/energética.
- `mobile-app/src/services/{storage,auth,collections,vinculos}.ts` — persistencia, auth, almacén compartido, vínculos.
- `mobile-app/src/modules/{registry,models}.ts` — módulos del dashboard.
- `mobile-app/src/components/module-screen.tsx` — fábrica CRUD genérica.
- `mobile-app/src/app/` — rutas: `_layout`, `index`(+`.web`), `auth`, `escanear`, `(dashboard)/{dashboard,dosificaciones,alertas,tareas,citas,mi-qr}`.
- Documentos ODD: `odd/tasks/landing-page.md`, `odd/tasks/auth-dashboard.md`, `odd/tasks/vinculacion-qr.md` (en carpeta local del proyecto, fuera del repo).

## Cómo correr

```bash
cd acompanamiento-adulto-mayor
npm run web      # versión web (no escanea)
npm start        # Expo Go en el teléfono (apretar "r" para recargar tras cambios)
```

 pairing de la verificación: frenar cualquier `serve` de `dist/` antes de `expo export` (EBUSY por OneDrive).

## Pendientes / próximos pasos

1. Prueba del escaneo QR en teléfono (Expo Go) — el usuario debe validarla.
2. Filtrar los datos del dashboard por `vinculo` (hoy son globales locales).
3. Definir con el equipo: rol-by-flow final, qué ve cada rol, y si la app Expo pasa a ser el `frontend` del repo o coexiste.
4. Reemplazar placeholders de visión/misión/content cuando el cliente los defina.
5. Backend real para auth + sincronización (el repo ya tiene backend/Prisma: conectar la capa de servicios a API).
6. Crear el PR `dev-kevin` → `dev` cuando el equipo lo decida.

## Commits

Serie progresiva en `dev-kevin` (push hecho): `4ed9aa1` scaffold → `b3ef530` contenido → `6fec638` landing web → `d7f9259` landing móvil → `4213634` auth diseño → `3f9cb2c` fix botón web → `18eeab5` servicios → `f3c4217` auth real → `2f73624` dashboard → `4805f5c` módulos → `9c34f83` deps → `1faff6b` roles → `41b6869` gitignore → `7b3c567` vínculos → `754604a` pantallas QR → `dbe2a9b` entradas QR → `069007b` fix entrada escaneo → `7f289f2` escaneo en landing → `49e4934` fix QR autoverificable → `feb8de1` integración en `mobile-app/`.
