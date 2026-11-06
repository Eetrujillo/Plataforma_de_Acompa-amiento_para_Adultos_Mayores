# Skill: React Native App (Expo)

# App Mobile con Expo y React Native

Portar o ampliar `App Mobile/` (Expo SDK 58). Usar esta skill cuando haya que migrar una
pantalla de la web, añadir una ruta, tocar almacenamiento, conectividad o avisos.

## Stack exacto

| Pieza | Versión |
|---|---|
| Expo | `~58.0.21` |
| React Native | `0.88.1` |
| React | `19.3.0` |
| Expo Router | `~58.0.28` |
| AsyncStorage | `2.2.0` |
| NetInfo | `12.0.1` (usar `npx expo install`, no `npm install`) |

Validar siempre con:

```bash
cd "App Mobile"
npx tsc --noEmit
npx expo-doctor          # debe dar 20/20
npx expo export --platform web
```

## Equivalencias web → React Native

| Web (Vite) | App Mobile |
|---|---|
| `react-router-dom` | Expo Router en `src/app/` |
| `<div>`, `<p>`, `<button>` | `View`, `Text`, `Pressable` |
| `index.html` / `main.jsx` | `src/app/_layout.tsx` |
| `globals.css` | `src/theme/` + `StyleSheet` |
| `localStorage` | `AsyncStorage` con caché en memoria (`services/storage.ts`) |
| `navigator.onLine` | NetInfo (`services/connectivity.ts`) |
| `visibilitychange` | `AppState` |
| `ProtectedRoute` | `RequireFamily` / `RequireSenior` |
| `<input type="date">` | `DateField` (listas en modal) |
| `<select>` | `SelectField` + `OptionPicker` |
| `Notification` del navegador | `reminderService` (aviso en pantalla + vibración) |

## Reglas de arquitectura

1. **Nada de lecturas asíncronas en render.** `hydrateStorage()` corre una vez en
   `app/_layout.tsx`; después `getCached` / `readJson` son síncronos.
2. **Un tema por grupo.** `ThemeProvider` en el layout raíz usa `familyTheme`;
   `src/app/app/_layout.tsx` lo cambia a `seniorTheme`. Los componentes leen `useTheme()`.
3. **Rutas con URLs de la web.** `/panel`, `/hoy`, `/actividades`, `/adultos-mayores`,
   `/app`, `/app/vincular`, `/app/ajustes`, `/conexion`. `app/index.tsx` es la puerta.
4. **Accesibilidad del adulto mayor.** Texto ≥ 20, controles ≥ 64, `accessibilityRole`
   en todo lo tocable, `accessibilityLiveRegion` en errores.
5. **Errores del backend sin traducir.** Mostrar `err.message` y usar `err.code` para el
   flujo (`LINK_ATTEMPTS_LOCKED`, `PIN_ATTEMPTS_LOCKED`, `CONSENT_VERSION_OUTDATED`).
6. **La hora del toque manda.** HU-019 envía `completedAt` del dispositivo; la cola se
   hidrata en memoria y se persiste con `writeJson`.
7. **Nunca hardcodear `API_BASE`.** Toda petición pasa por `getApiBase()`
   (`services/apiBase.ts`); si se importa `API_BASE` de `config.ts` el override de
   `/conexion` deja de funcionar.
8. **Sin modo demostración.** Se descartó `DISABLE_AUTH` / `EXPO_PUBLIC_DISABLE_AUTH`:
   toda ruta exige cuenta verificada. No reintroducir usuarios mock ni banners de
   prueba; para ver pantallas hay que registrar y confirmar una cuenta real.

## Backend compartido con la web

`localhost` en un teléfono es el teléfono, no el PC. `DEFAULT_API_BASE` resuelve:

1. `EXPO_PUBLIC_API_BASE` (build o `.env`).
2. `Constants.expoConfig.hostUri` (IP del PC que sirve Metro) + `:3500`.
3. `10.0.2.2:3500` en Android; `localhost:3500` en web/iOS.

`/conexion` permite probar (`checkBackend` → `/health`) y guardar otra URL en
`gap_api_base`. Requisitos: misma Wi-Fi, backend en `0.0.0.0:3500`, firewall
abierto. Misma cuenta en web y app ⇒ mismo `DATABASE_URL` en ambos clientes.

Registro: el backend ya devuelve `token`, y en dev existe
`POST /auth/dev/verify-email`; el botón se muestra solo con `__DEV__`.

## Al añadir una pantalla

1. Crear `src/app/<ruta>.tsx` con un `default function`.
2. Envolver el contenido en `RequireFamily` o `RequireSenior` y separar el contenido en
   un componente interno (los hooks se llaman después del guard).
3. Usar `Screen`, `ScreenHeader`, `Card`, `Button`, `FormField`; no crear estilos sueltos
   si ya existe un componente.
4. Añadir la navegación con `router.push` / `router.replace`; no usar `window.history`.
5. Registrar la pantalla en el mapa de HU de `App Mobile/README.md`.

## Trampas ya resueltas

- **`app.json`:** SDK 58 rechaza `newArchEnabled` y `splash`. Usar solo las claves del
  esquema; `expo-doctor` falla si sobran.
- **Versiones:** cualquier dependencia nativa se instala con `npx expo install`, nunca
  `npm install` directo.
- **`expo-notifications`:** no incluir. Rompe la exportación web y exige build nativo.
  Para avisos con la app cerrada haría falta un development build.
- **QR:** el backend ya entrega `qrDataUrl`; se muestra con `<Image source={{ uri }}>`.
  El escaneo con cámara requiere `expo-camera` y una cámara real.
- **Rutas duplicadas:** no usar grupos `(family)` y `(senior)` con el mismo `index`;
  producen colisión. Usar `app/` para el familiar y `app/app/` para el adulto mayor.
- **Path con espacios:** `App Mobile/` funciona con Metro y `expo export` (probado).

## Checklist

- [ ] `npx tsc --noEmit` sin errores (incluye `noUnusedLocals`).
- [ ] `npx expo-doctor` 20/20.
- [ ] `npx expo export --platform web` genera `dist/`.
- [ ] Prueba headless de la ruta nueva (Chrome `--dump-dom`) si no hay navegador manual.
- [ ] HU mapeada en `App Mobile/README.md`.
- [ ] Nada de `expo-notifications`, `localStorage`, `navigator.onLine` ni `document.*`.
