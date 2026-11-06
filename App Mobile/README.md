# App Mobile · React Native (Expo)

Versión React Native del proyecto **Plataforma de Acompañamiento para Adultos Mayores**.
Consume el backend de `prod_local` (arquitectura hexagonal + Prisma, puerto 3500)
con **Expo SDK 58**, **React Native 0.88**, **Expo Router** y
**react-native-web** para que la misma base corra en Android, iOS y web.

> Rama de trabajo: `prueba-sin-auth`. Esta carpeta **no se ha subido al remoto**.

---

## Requisitos

- Node.js 20 o superior (probado con 24).
- Backend de `prod_local` en marcha en `http://localhost:3500` (o la IP de tu equipo).
  También funciona contra el backend anterior (puerto 3701): solo cambia la URL.
- Para móvil: Expo Go en el teléfono, o un emulador de Android / simulador de iOS.

## Instalación

```bash
cd "App Mobile"
npm install
```

## Ejecutar

```bash
npm run web        # navegador (http://localhost:8081)
npm start          # QR para Expo Go
npm run android    # emulador de Android
npm run ios        # simulador de iOS (solo macOS)
```

El backend debe estar en marcha. Sin él, la app abre pero las peticiones fallan
con el mensaje de conexión.

## Variables de entorno

Se leen en tiempo de build; crea un `.env` en esta carpeta (hay un `.env.example`).
La URL también se puede cambiar en caliente desde la pantalla **Configurar
servidor** (`/conexion`), que la guarda en el dispositivo.

| Variable | Efecto | Valor por defecto |
|---|---|---|
| `EXPO_PUBLIC_API_BASE` | URL base del backend | autodetectada (ver abajo) |

### Cómo se resuelve la URL del backend

`src/config.ts` (`DEFAULT_API_BASE`) y `src/services/apiBase.ts`:

1. `EXPO_PUBLIC_API_BASE`, si está definida.
2. La IP del PC que sirve Expo (`Constants.expoConfig.hostUri`) + `:3500`.
   En un teléfono con Expo Go esto ya funciona: `localhost` sería el teléfono.
3. `http://10.0.2.2:3500/api` en el emulador de Android; `localhost:3500` en web/iOS.

Precedencia en tiempo de ejecución: URL guardada en `/conexion`
(`gap_api_base`) → `DEFAULT_API_BASE`. Toda petición pasa por `getApiBase()`.

Direcciones según el entorno:

| Entorno | `EXPO_PUBLIC_API_BASE` |
|---|---|
| Web en desarrollo | `http://localhost:3500/api` |
| Simulador iOS | `http://localhost:3500/api` |
| Emulador Android | `http://10.0.2.2:3500/api` |
| Teléfono físico (Expo Go) | `http://IP-DE-TU-EQUIPO:3500/api` (o automático) |
| Web detrás de Nginx | `/api` |

### Misma cuenta que la web

La app **no** tiene backend propio: usa el mismo `prod_local/backend` (puerto
3500) y la misma base Mongo que la web, así que la cuenta creada en una aparece
en la otra.

Requisitos para el teléfono:

- PC y teléfono en la misma red Wi-Fi.
- Backend escuchando en `0.0.0.0:3500` (por defecto).
- Firewall de Windows permitiendo `3500` y `8081`.
- `CORS_ORIGIN=*` en `prod_local/.env` (o el origen exacto).

Para comprobarlo: **Configurar servidor → Probar conexión** llama a `/health`.

### Cuenta real

El backend exige una cuenta verificada, así que se prueba así:

1. `POST /api/auth/register` (la app lo hace desde **Registrarse**). El backend ya
   devuelve `token`, así que la cuenta abre sesión de inmediato pero queda sin
   verificar.
2. Confirmar el correo. Sin SMTP el enlace solo aparece en la consola del backend;
   para no depender de ella, en desarrollo la pantalla de verificación tiene el
   botón **Confirmar correo ahora (desarrollo)**, que llama a
   `POST /api/auth/dev/verify-email`. Esa ruta no existe con `NODE_ENV=production`
   y el botón solo se pinta con `__DEV__`.
3. Crear el perfil del adulto mayor y vincular la app del adulto con el código.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run doctor` | `expo-doctor` (20 comprobaciones) |
| `npm run build:web` | Exportación estática web en `dist/` |
| `npm run build:native` | Exportación de bundles Android e iOS |

## Estructura

```
src/
├── app/                     Rutas de Expo Router (cada archivo es una pantalla)
│   ├── _layout.tsx          Arranque: hidratación, conectividad, providers globales
│   ├── index.tsx            Puerta: decide login, verificación o panel
│   ├── login.tsx            HU-003
│   ├── register.tsx         HU-001
│   ├── forgot-password.tsx  HU-004
│   ├── reset-password.tsx   HU-004
│   ├── confirm-email.tsx    HU-002
│   ├── verification-required.tsx  HU-002
│   ├── privacy.tsx          Política de privacidad
│   ├── panel.tsx            Panel del familiar
│   ├── adultos-mayores.tsx  HU-005, HU-006, HU-010
│   ├── actividades.tsx      HU-012 a HU-015
│   ├── hoy.tsx              HU-020
│   ├── conexion.tsx         Servidor: URL del backend y prueba de conexión
│   └── app/                 App del adulto mayor (tema senior)
│       ├── index.tsx        HU-017, HU-018, HU-019
│       ├── vincular.tsx     HU-006, HU-007, HU-008
│       └── ajustes.tsx      HU-008, HU-011, HU-016
├── components/
│   ├── ui/                  Texto, botón, tarjeta, campos, selectores, diálogos
│   ├── auth/                Protección de rutas y modal de sesión vencida
│   └── app/                 Consentimiento, avisos, cola offline, banner demo
├── context/AuthProvider.tsx Sesión del familiar
├── hooks/                   Sesión, feedback de login, reenvíos, conectividad, cola
├── services/                Clientes HTTP, almacenamiento, cola, recordatorios
├── theme/                   Tokens del familiar y del adulto mayor
├── types/                   Contratos del backend
└── utils/                   Fechas, zonas horarias, validaciones, iconos
```

## Mapa de historias de usuario

| HU | Dónde está |
|---|---|
| HU-001 Registro | `app/register.tsx` |
| HU-002 Confirmación de correo | `app/confirm-email.tsx`, `app/verification-required.tsx` |
| HU-003 Inicio de sesión | `app/login.tsx` |
| HU-004 Recuperación de contraseña | `app/forgot-password.tsx`, `app/reset-password.tsx` |
| HU-005 Perfiles | `app/adultos-mayores.tsx` |
| HU-006 Código de vinculación | `app/adultos-mayores.tsx`, `app/app/vincular.tsx` |
| HU-007 Canje del código | `app/app/vincular.tsx` |
| HU-008 Consentimiento | `components/app/ConsentContent.tsx`, `app/app/vincular.tsx`, `app/app/ajustes.tsx` |
| HU-009 Sesión persistente | `services/storage.ts`, `services/olderAdultAppService.ts` |
| HU-010 Desvinculación | `app/adultos-mayores.tsx` |
| HU-011 Cierre con PIN | `app/app/ajustes.tsx` |
| HU-012 Creación de actividades | `app/actividades.tsx` |
| HU-013 Repetición | `app/actividades.tsx`, `utils/activity.ts` |
| HU-014 Edición | `app/actividades.tsx` |
| HU-015 Eliminación | `app/actividades.tsx` |
| HU-016 Avisos | `services/reminderService.ts`, `components/app/ReminderHost.tsx`, `ReminderSettings.tsx` |
| HU-017 Actividades del día | `app/app/index.tsx`, `utils/activity.ts` |
| HU-018 Marcar como hecha | `app/app/index.tsx` |
| HU-019 Sin internet | `services/completionQueue.ts`, `hooks/useCompletionQueue.ts` |
| HU-020 Estado del día | `app/hoy.tsx` |

## Decisiones de la migración

Estas son las diferencias reales frente a la versión web y el motivo de cada una.

### 1. Almacenamiento asíncrono con caché en memoria

`localStorage` es síncrono; `AsyncStorage` no. `services/storage.ts` hidrata una
sola vez al arrancar (`app/_layout.tsx`) y después las lecturas salen de memoria.
Así los `useState` iniciales siguen funcionando y la pantalla del adulto mayor no
parpadea. Las escrituras actualizan la memoria y persisten en segundo plano.

### 2. Conectividad con NetInfo

`navigator.onLine` y los eventos `online`/`offline` no existen en nativo.
`services/connectivity.ts` mantiene un único listener de NetInfo y lo reparte a
la cola de marcas (HU-019) y a las pantallas.

### 3. Visibilidad con AppState

`document.visibilitychange` se reemplaza por `AppState`. Se usa para refrescar
el estado del día (HU-020), los avisos (HU-016) y la cola offline (HU-019) al
volver del segundo plano.

### 4. Fecha y hora sin dependencias nativas

`<input type="date">` y `<input type="time">` no existen en React Native.
`DateField` y `TimeField` usan listas táctiles dentro de un modal
(`OptionPicker`), con el mismo comportamiento en web, Android e iOS y controles
grandes para el adulto mayor. Evita depender de `@react-native-community/datetimepicker`,
que tiene implementaciones distintas por plataforma.

### 5. Navegación con Expo Router

Las rutas conservan las URLs de la web (`/login`, `/hoy`, `/app`,
`/app/vincular`, `/app/ajustes`). `app/index.tsx` es la puerta que decide a dónde
entrar. `RequireFamily` y `RequireSenior` reemplazan a `ProtectedRoute`.

### 6. Tema por contexto

`ThemeProvider` aplica los tokens del familiar o del adulto mayor según el grupo
de rutas. El adulto mayor conserva texto base 20, controles de 64 puntos y
contraste alto; el familiar usa texto base 18.

### 7. Avisos sin `expo-notifications`

El aviso en pantalla y la vibración funcionan en todas las plataformas y no
requieren un build nativo. En web se intenta además la notificación del sistema.
Para notificaciones con la app cerrada haría falta `expo-notifications` y un
development build; se documenta abajo como pendiente.

## Validación ejecutada

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | Sin errores |
| `npx expo-doctor` | **20/20** |
| `npx expo export --platform web` | Exportación correcta (20 bundles por ruta) |
| Prueba en navegador headless | `/` renderiza el login; `/panel` y `/actividades` redirigen a login; `/app` redirige a la vinculación con el tema del adulto mayor (texto 20 px, controles 64 px) |

## Limitaciones conocidas

1. **Escaneo de QR pendiente.** La vinculación funciona escribiendo el código.
   Para escanear hace falta `expo-camera` y una cámara real; no se incluyó para
   no dejar una función a medias.
2. **Avisos con la app cerrada.** Requieren `expo-notifications` y un build
   nativo (EAS). Hoy el aviso aparece en pantalla y vibra con la app abierta.
3. **Sin validación en dispositivo ni contra MongoDB.** No hay Docker ni
   teléfono en el entorno donde se generó el proyecto; la validación fue
   typecheck, doctor, exportación y navegador headless con el bundle estático.

## Web estática y Docker

`expo export --platform web` genera `dist/` con `index.html`, un `favicon` y los
bundles. Es un SPA: Nginx debe devolver `index.html` en rutas desconocidas
(`try_files $uri $uri/ /index.html`), igual que con la versión Vite.

Si la web se sirve detrás del mismo Nginx que el backend, define
`EXPO_PUBLIC_API_BASE=/api` para usar el proxy existente.

## Convenciones

- Comentarios en español, sin tildes en el código heredado y con tildes en lo
  nuevo, siguiendo el estilo del repositorio.
- Ningún texto por debajo de 18 px (familiar) o 20 px (adulto mayor).
- Toda acción destructiva pasa por `ConfirmDialog`.
- Los errores del backend se muestran con el mensaje y el `code` que envía; no
  se traducen ni se reinterpretan en el cliente.
