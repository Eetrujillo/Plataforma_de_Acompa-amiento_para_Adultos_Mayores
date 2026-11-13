# Landing Page + Auth — Acompañamiento de Adulto Mayor

Expo universal (web + móvil) con expo-router. Primer entregable: landing page adaptada por plataforma y pantalla de autenticación de solo diseño.

## Specs

S1: "vamos a empezar un proyecto en React native, voy autilizar tanto web como movil, debe ser compatible en ambos servicios pero personalizado para cada uno"
S2: 'el proyecto se llama "Acompañamiento de Adulto Mayor", el proyecto se encarga de recordar dosificaciones asignadas por un medico, esta información la da un encargado del agulto mayor, la web es mas tecnica para una persona capacitada, la app es para el adulto mayor, osea mas simple y facil'
S3: Visión y misión como placeholders profesionales (decisión del usuario en cuestionario); textos coherentes con el rubro, fáceles de reemplazar, en un módulo de contenido único.
S4: "empecemos con una landing page, con vision, mision, informacion, navbar con estos modulos" — navbar con secciones Visión, Misión, Información.
S5: "un loggin/register en una esquina que rediriga a una nueva pertaña" — botón Log in/Sign up en una esquina del navbar que redirige a una página aparte (ruta /auth).
S6: Línea visual colorida/energética: colores saturados contrastados, secciones con bloques de color.
S7: Auth "solo diseño funcional": pantalla /auth con decisión Log in / Sign up, campos con validación visual, navegación de vuelta a la landing; lista para conectar backend después. Sin backend real en esta entrega.

## Tasks

T1 [S1,S2] ✅ Scaffold: app Expo universal + TypeScript + expo-router en `acompanamiento-adulto-mayor`; git init; rutas `/` y `/auth`. Ruta: inline. Commit: 4ed9aa1.
T2 [S3] ✅ Módulo `src/content.ts` + `src/constants/theme.ts` (tokens coloridos/energéticos, S6). Ruta: inline. Commit: b3ef530.
T3 [S4,S5,S6] ✅ Landing web `src/app/index.web.tsx`: navbar Visión/Misión/Información, botón Log in/Sign up en esquina → /auth, bloques de color. Ruta: inline. Commit: 6fec638.
T4 [S2,S6] ✅ Landing móvil `src/app/index.tsx`: tipografía grande, chips grandes de sección con scroll. Ruta: inline. Commit: d7f9259.
T5 [S7] ✅ `src/app/auth.tsx`: toggle Ingresar/Crear cuenta, validación visual, volver a la landing, solo diseño. Ruta: inline. Commit: 4213634.
T6 [S1] ✅ Verificación: `tsc --noEmit` exit 0; `expo lint` exit 0 (1 error de plantilla corregido); `expo export --platform web` exit 0 con rutas `/`, `/auth`, `/_sitemap`, `/+not-found`. Ruta: inline.

## Log

L1: "vamos a empezar un proyecto en React native, voy autilizar tanto web como movil, debe ser compatible en ambos servicios pero personalizado para cada uno, empecemos con una landing page, con vision, mision, informacion, navbar con estos modulos y un loggin/register en una esquina que rediriga a una nueva pertaña"
L2: 'el proyecto se llama "Acompañamiento de Adulto Mayor", el proyecto se encarga de recordar dosificaciones asignadas por un medico, esta información la da un encargado del agulto mayor, la web es mas tecnica para una persona capacitada, la app es para el adulto mayor, osea mas simple y facil'
L3: Cuestionario: placeholders profesionales para visión/misión; estilo colorido/energético; auth solo diseño funcional.
L4: Stack decidido por el arquitecto: Expo universal + expo-router (web y móvil desde un mismo código, personalización por plataforma con extensiones .web).
L5: Verificación (2025-11-13): tsc exit 0 tras corregir 4 errores de tipos (ref ScrollViewInstance, hitSlop, Partial offsets, declarar *.css); expo lint exit 0 tras corregir set-state-in-effect de la plantilla con useSyncExternalStore; expo export --platform web exit 0 (rutas /, /auth). Commits en rama feat/landing: 4ed9aa1, b3ef530, 6fec638, d7f9259, 4213634. Total ~1100 líneas escritas.
L6: Incidencia T1: `create-expo-app` falló con EPERM al renombrar app.json dentro de OneDrive; reintento con --no-install extractor funcionó. Observación pendiente: OneDrive puede ralentizar npm/expo (lint tardó >30s).

Delivery strategy: ask-on-risk. Forecast ~900 authored lines.
