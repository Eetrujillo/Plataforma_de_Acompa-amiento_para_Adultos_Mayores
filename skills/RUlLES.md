# 🏛️ Reglas Globales y Estándares del Proyecto

## 1. Stack Tecnológico Base
- **Backend:** Node.js con Express en el puerto `3500`, estructurado en Vertical Slice + Arquitectura Hexagonal y aplicando principios SOLID.
- **Base de Datos:** MongoDB utilizando el ODM Prisma (`provider = "mongodb"`).
- **Frontend Unificado (Web & Móvil):** React + Vite en el puerto `3201`, con enrutamiento dinámico guiado por `react-router-dom`.
- **Estrategia Móvil:** Capacitor (`@capacitor/core`, `@capacitor/android`) empaquetando el código de React en un ejecutable nativo `.apk` para Android.
- **Estilo de Código:** JavaScript (ES6+) moderno o TypeScript estricto (prohibido el uso indiscriminado de `any`).

## 2. Definición del Dual-Interface (Web vs. Móvil)
Todo el código de cliente convive dentro del directorio `/frontend`, pero se deben separar estrictamente los componentes, vistas y comportamiento de ambas interfaces:

### 🖥️ Interfaz 1: Web del Cuidador (`pages/caregiver/` y `features/*/ui/caregiver/`)
- **Público objetivo:** Cuidadores, familiares o administradores desde PC, Laptop o navegador móvil.
- **Plataforma:** Aplicación Web servida por Nginx.
- **Funcionalidades clave:**
  - Registro, inicio de sesión (JWT) y recuperación de contraseña.
  - Creación, edición, eliminación y programación de rutinas/actividades.
  - Dashboard de monitoreo en tiempo real (porcentaje de avance diario y actividades vencidas).
  - Generador de códigos de vinculación de 6 dígitos y códigos QR.
  - Centro de alertas SOS y mapa interactivo con la ubicación GPS del adulto mayor.

### 📱 Interfaz 2: App Móvil del Adulto Mayor (`pages/senior/` y `features/*/ui/senior/`)
- **Público objetivo:** Adultos mayores (instalada en el dispositivo mediante el ejecutable `.apk` generado con Capacitor).
- **Estándares Obligatorios de Accesibilidad (WCAG 2.1 AAA):**
  - **Tipografía:** Tamaño de fuente mínimo de 20px / 20sp para títulos y textos de tareas.
  - **Áreas de Toque:** Botones con un tamaño táctil mínimo de 48x48dp (fáciles de presionar).
  - **Contraste:** Colores de alto contraste e íconos descriptivos para cada tipo de actividad.
  - **Cero Credenciales:** El adulto mayor nunca escribe correo ni contraseña. Se vincula una sola vez con código/QR (HU-007) y mantiene la sesión persistente.
- **Comportamiento Táctil y Hardware:**
  - Botón SOS rojo siempre visible en pantalla con temporizador modal de cuenta regresiva de 5 segundos.
  - Acceso a permisos nativos de GPS y audio de alarma sin restricciones de navegador.
- **Arquitectura Offline-First:**
  - Si el teléfono no tiene internet, las actividades marcadas o las alertas SOS deben guardarse localmente (`IndexedDB` / `Capacitor Preferences`) y sincronizarse automáticamente con el backend en cuanto se restablezca la conexión.

### 🔀 Enrutamiento Dinámico en el Frontend
En `frontend/src/app/routes/AppRouter.jsx`, la aplicación debe detectar el entorno mediante `@capacitor/core`:
```javascript
import { Capacitor } from '@capacitor/core';

// Si corre dentro del APK nativo -> Redirige por defecto a la vista del Adulto Mayor (/senior)
// Si corre en un navegador web -> Redirige al Login/Dashboard del Cuidador (/caregiver)
const isNative = Capacitor.isNativePlatform();

## 3. Flujo de Ramas y Promoción a Producción

Cada tarea vive en su propia rama y solo llega a producción con las pruebas en verde.

### 🎋 Creación de la rama de trabajo
- Toda tarea nueva (HU del backlog o corrección pedida) arranca en una rama propia, creada **desde `dev-Esteban-Trujillo`**:
  - HU del backlog: `hu-00X-<slug-corto>` (ej. `hu-002-verificacion-correo`).
  - Corrección o tarea técnica: `fix/<slug-corto>` o `feat/<slug-corto>`.
- Si la rama de la tarea ya existe, se retoma; no se crea otra.
- **Prohibido** commitear directo en `dev-Esteban-Trujillo` o en `prod`.

### 🧪 Pruebas antes de integrar
Ninguna rama se integra si esto no está en verde, con la salida real observada:
1. `cd backend && npm test` sin fallos.
2. `cd frontend && npm run build` sin errores.
3. Los criterios de aceptación de la HU verificados uno por uno (no "debería andar": prueba observable).
4. Si el cambio toca despliegue, datos o contratos consumidos, el chequeo diferencial o la verificación independiente que corresponda.

### 🔀 Integración a la rama personal
- Con las pruebas en verde, la rama de la tarea se integra por merge a `dev-Esteban-Trujillo`.
- Si el merge produce conflictos, se resuelven **en la rama de la tarea**, se vuelven a correr las pruebas y después se reintenta.
- `dev-Esteban-Trujillo` es la rama de integración: no se publica desde ahí.

### 🚀 Promoción a producción (`prod`)
- `prod` es producción: un push a `prod` dispara `.github/workflows/prod.yml`, que entra por SSH al VPS y ejecuta `docker compose up -d --build`. No hay paso intermedio de revisión.
- Solo se promueve desde `dev-Esteban-Trujillo` ya integrado y verificado, con las pruebas del punto anterior corriendo de nuevo sobre el resultado del merge.
- Si una prueba falla, no hay promoción: se corrige en la rama de la tarea.
- El push final a `prod` (el deploy) se confirma con el humano antes de ejecutarlo.

### 🗄️ Base de Datos de Trabajo
- La base de datos de los contenedores es la desplegada en el VPS (fuente de verdad única).
- Cualquier prueba que escriba datos contra esa base usa cuentas con prefijo identificable (`chk-`, `e2e-`, `smoke-`) y las borra al terminar.
- Nunca se corre una prueba destructiva (borrados masivos, `db drop`, `prisma db push` sobre colecciones existentes) contra la base desplegada.
