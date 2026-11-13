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

## Backlog funcional (fuente única)

- La funcionalidad está desglosada en **22 historias de usuario** en `docs/historias-de-usuario.md` (commit `d6f682e`), numeradas en el **orden en que deben desarrollarse**: dependencias técnicas primero, luego riesgo de retrabajo, después valor clínico y por último presentación.
- Siete fases: 1) fundaciones de datos (HU-01 crear base externa, HU-02 conectar backend), 2) identidad y visibilidad (HU-03 a HU-08), 3) capa de datos externa (HU-09), 4) núcleo del cuidado (HU-10 a HU-14), 5) vinculación familiar (HU-15 a HU-18), 6) entrada y presentación (HU-19, HU-20), 7) soporte y cierre (HU-21, HU-22).
- Camino crítico: `HU-01 → HU-02 → HU-03 → HU-09 → HU-10 → HU-11 → HU-18`.
- Los parámetros de arquitectura P1–P4 (base de datos externa independiente, persistencia local no definitiva, contrato único de servicios, acceso exclusivo vía backend) condicionan todas las historias.
- **Advertencia de alcance**: todo el núcleo ya implementado corre sobre almacenamiento local; hasta cerrar HU-01, HU-02 y HU-09 los datos solo existen en el dispositivo donde se crearon.

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
- Documentos ODD: `docs/odd/tasks/landing-page.md`, `docs/odd/tasks/auth-dashboard.md`, `docs/odd/tasks/vinculacion-qr.md` (versionados en el repo).
- Backlog de historias de usuario: `docs/historias-de-usuario.md`.
- Plan de entrega por slices (S0 a S8, PRs encadenados): `docs/plan-de-slices.md`.

## Cómo correr

```bash
cd acompanamiento-adulto-mayor
npm run web      # versión web (no escanea)
npm start        # Expo Go en el teléfono (apretar "r" para recargar tras cambios)
```

 pairing de la verificación: frenar cualquier `serve` de `dist/` antes de `expo export` (EBUSY por OneDrive).

## Pendientes / próximos pasos

Ordenados según el backlog de `docs/historias-de-usuario.md`:

1. **HU-01 — Crear y aprovisionar la base de datos externa** (P0, bloqueante): instancia dedicada, esquema versionado, migraciones reproducibles, usuario de aplicación con permisos mínimos y entornos separados.
2. **HU-02 — Conectar el backend con la base externa** (P0): credenciales por variables de entorno, verificación de salud de la conexión, errores sin exponer credenciales.
3. **HU-09 — Persistir y sincronizar contra la base externa** (P0): sustituir AsyncStorage/localStorage como fuente de verdad; hacerlo antes de ampliar los módulos evita reescribir los cuatro CRUD.
4. **HU-08 — Definir la política de roles y la integración con el repositorio del equipo** (P1): qué ve cada rol y si la app Expo sustituye al `frontend/` o coexiste.
5. **HU-18 — Ver solo la información del vínculo** (P1): hoy los datos son globales y locales.
6. **HU-17 — Validar el escaneo QR en dispositivo físico** (P1, pendiente de validación): es la historia que cierra HU-16.
7. **HU-22 — Contar con contenidos definitivos** (P3): reemplazar los placeholders de visión/misión/content cuando el cliente los defina.
8. **PR `dev-kevin` → `dev`** cuando el equipo lo decida. La rama acumula ~3.900 líneas autoradas en 22 commits, muy por encima del slice revisable de ~400 líneas: conviene entregar en PRs encadenados por fase del backlog.

## Commits

Serie progresiva en `dev-kevin` (push hecho): `4ed9aa1` scaffold → `b3ef530` contenido → `6fec638` landing web → `d7f9259` landing móvil → `4213634` auth diseño → `3f9cb2c` fix botón web → `18eeab5` servicios → `f3c4217` auth real → `2f73624` dashboard → `4805f5c` módulos → `9c34f83` deps → `1faff6b` roles → `41b6869` gitignore → `7b3c567` vínculos → `754604a` pantallas QR → `dbe2a9b` entradas QR → `069007b` fix entrada escaneo → `7f289f2` escaneo en landing → `49e4934` fix QR autoverificable → `feb8de1` integración en `mobile-app/` → `8b01c43` documentos ODD y estado de sesión → `d6f682e` historias de usuario ordenadas por prioridad de desarrollo.

Pendiente de push: `d6f682e` y el commit que actualiza este documento (locales en `dev-kevin`; `8b01c43` ya está en `origin/dev-kevin`).
