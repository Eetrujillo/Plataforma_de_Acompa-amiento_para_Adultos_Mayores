# Auditoría de estructura y SOLID

**Fecha:** 13 de noviembre de 2025 · **Rama:** `dev-kevin` · **Alcance:** `mobile-app/src/` y `backend/`.
**Método:** revisión estática de responsabilidades, acoplamiento y puntos de extensión. Cada hallazgo cita el archivo y la línea aproximada.

## Veredicto en una línea

El proyecto **no es código espagueti**: hay tres decisiones estructurales correctas que sostienen el diseño (puerto de almacenamiento, almacén externo con suscripción, panel dirigido por registro). Pero hay **tres violaciones de SRP reales** y **una violación de OCP con costo concreto**: agregar un módulo obliga a tocar cinco archivos, y agregar una regla de rol obliga a tocar cuatro. Eso es lo que hay que corregir para que siga siendo mantenible.

## 1. Inventario de responsabilidades

| Archivo | ~Líneas | Responsabilidad real |
| --- | --- | --- |
| `mobile-app/src/app/_layout.tsx` | 27 | Pila de navegación + siembra de usuarios demo al arrancar |
| `app/index.tsx` / `index.web.tsx` | 225 / 275 | Landing móvil y web; la web usa `document.getElementById` para el desplazamiento |
| `app/auth.tsx` | 350 | Formulario de acceso **y** decisión de rol por plataforma |
| `app/escanear.tsx` | 235 | Escaneo de QR **y** orquestación del resultado de vinculación |
| `app/(dashboard)/_layout.tsx` | 48 | Guardia de sesión |
| `app/(dashboard)/dashboard.tsx` | 205 | Panel: bienvenida, tarjetas, cierre de sesión, reglas de visibilidad |
| `app/(dashboard)/{dosificaciones,alertas,tareas,citas}.tsx` | 28–45 | Configuración delgada de `ModuleScreen` |
| `app/(dashboard)/mi-qr.tsx` | 95 | Presentación del QR + `ensureVinculo` en efecto |
| `components/module-screen.tsx` | 310 | CRUD genérico **+** estado de formulario **+** validación **+** llamadas de persistencia |
| `services/auth.ts` | 245 | Registro, login, sesión, hashing, validación, siembra demo, sesión invitado y mutación de rol por vinculación |
| `services/collections.ts` | 165 | CRUD genérico con caché de módulo, suscriptores e hidratación |
| `services/storage.ts` | 38 | Envoltorio delgado de AsyncStorage + claves |
| `services/vinculos.ts` | 120 | Derivación de código, carga útil QR y registros de vínculo |
| `modules/{models,registry}.ts` | 36 / 38 | Interfaces de registro y registro de módulos del panel |

## 2. Hallazgos estructurales

1. **Validación duplicada.** Reglas de correo y contraseña en `services/auth.ts:44-49` y otra vez en `app/auth.tsx:22-37`, con mensajes distintos. Dos verdades para la misma regla.
2. **Tema evadido.** `components/module-screen.tsx:226-309` y `(dashboard)/dashboard.tsx:129-205` escriben ~40 literales hexadecimales que `constants/theme.ts` ya exporta. Cambiar la paleta hoy no cambia la app.
3. **Persistencia dentro de la UI.** `module-screen.tsx` valida (`:74-86`, `:117-123`), orquesta persistencia (`:124-140`) y renderiza: tres razones para cambiar en un archivo.
4. **Estado global oculto.** `services/collections.ts:34-36` mantiene `listeners/cache/hydrated` a nivel de módulo: singletons de proceso. Correcto para `useSyncExternalStore`, pero no aislable en pruebas y **sin alcance por usuario**, lo que impide filtrar por vínculo más adelante.
5. **Decisiones de plataforma dispersas.** Ramas `Platform.OS` en `auth.tsx:96-104`, `dashboard.tsx:35/44/79/91` y `escanear.tsx:44-52`, mientras el resto del proyecto usa variantes `.web`/`.native` (`index.web.tsx`).
6. **Configuración incrustada.** Largo del código 16 en `vinculos.ts:28`, etiqueta `aam-vinculo` en `:46`, prefijo de sal en `auth.ts:31`, credenciales demo en `auth.ts:222-227`.
7. **Guardia de sesión duplicada.** `(dashboard)/_layout.tsx:19-29` y `dashboard.tsx:26-34` consultan `getSession()` por separado; no hay hook ni contexto compartido.

## 3. Principios SOLID

### SRP — responsabilidad única

| Archivo | Razones para cambiar |
| --- | --- |
| `services/auth.ts` | hashing, validación, siembra demo, ciclo de sesión, política de rol por vinculación (`:262-283`) |
| `components/module-screen.tsx` | reglas de validación, persistencia, presentación |
| `app/escanear.tsx` | política de vinculación + autenticación + render |

### OCP — abierto a extensión, cerrado a modificación

- **Agregar un módulo al panel toca cinco archivos:** `modules/registry.ts:12`, `modules/models.ts` (interfaz), `services/storage.ts:6-14` (`StorageKeys`), `services/collections.ts:18-24` (`CollectionKeys`, constante cerrada) y un archivo de ruta.
- **Agregar o cambiar una regla de rol toca cuatro:** unión de roles `auth.ts:12`, sobrescritura `auth.ts:157-162`, mutación por vinculación `auth.ts:270-274`, render condicional `dashboard.tsx:64-75`, más la rama de plataforma en `auth.tsx:96-104`.

### LSP / ISP — contratos más anchos que el consumidor

- `ModuleScreenConfig.summary: (item: never) => string` (`module-screen.tsx:65`) obliga a `summary as never` en los cuatro módulos (por ejemplo `tareas.tsx:26`). El tipo no describe el contrato real.
- `toggleRecord(collection, id, field: string)` (`collections.ts:128-142`) acepta un nombre de campo arbitrario y castea a `Record<string, unknown>`: cualquier error de nombre es invisible en compilación.
- `PublicUser.vinculo` y `guest` opcionales (`auth.ts:41-46`), revalidados a mano en cada consumidor (`dashboard.tsx:64,70`).

### DIP — inversión de dependencias

- **Correcto:** ninguna pantalla importa AsyncStorage; el acceso a datos pasa por `storage.ts` y por el CRUD de `collections.ts`. Ese es exactamente el puerto que pide DIP.
- **Brecha:** no hay puerto para `auth` ni para `vinculos`; `escanear.tsx:17-21` importa funciones concretas y `escanear.tsx:14` importa `expo-camera` directamente. La promesa de «mismas firmas luego» es un comentario (`auth.ts:6-8`), no una interfaz.

## 4. Realidad del backend (verificada)

- `backend/` contiene **cuatro archivos**: `Dockerfile`, `.dockerignore`, `env.sample` y `prisma/schema.prisma`. **No hay código de servidor**: ni `package.json`, ni rutas, ni Socket.io, aunque el `Dockerfile:10` lo presupone.
- El esquema declara `provider = "mongodb"` (`prisma/schema.prisma:6`) y modela `User`, `EmailVerificationToken`, `PasswordResetToken`, `PairingToken`, `Activity`, `SosAlert`.
- **Incompatibilidad de modelos:** la app usa cuatro roles (`auth.ts:12`) con `Dosificacion`, `Alerta`, `Tarea` y `Cita` (`modules/models.ts`); el esquema usa `CAREGIVER|SENIOR` (`schema.prisma:12-30`) con `Activity` y `SosAlert`. Cambiar el transporte no alcanza: antes hay que reconciliar el modelo.
- Consecuencia para el plan: HU-01 no puede asumir migraciones relacionales; el motor declarado es MongoDB y Prisma aplica el esquema con `db push` o una carga inicial reproducible, no con migraciones SQL.

## 5. Triage

| Severidad | Hallazgo |
| --- | --- |
| **Bloqueante para la migración a base externa** | Falta de puerto para `auth`/`vinculos`; caché de `collections` sin alcance por usuario; modelos local y Prisma incompatibles; backend sin código de servidor |
| **Debe corregirse** | Política de roles en cuatro archivos (OCP); validación duplicada; `module-screen.tsx` con tres responsabilidades; colores fuera de `theme.ts`; `summary as never`; `toggleRecord` con campo por cadena |
| **Cosmético** | Ramas `Platform.OS` frente a variantes de archivo; sesión consultada dos veces; nombre `ModuleScreen` para una fábrica |

## 6. Correcciones mínimas propuestas

Cada una cabe en un slice de ~400 líneas o menos y ninguna cambia comportamiento observable.

1. **Unificar registros de claves** en `modules/registry.ts`, de modo que un módulo nuevo sea entrada de registro + archivo de ruta (OCP, ~150 líneas).
2. **Definir puertos `CollectionStore` y `AuthPort`** con la implementación local actual detrás, conservando las firmas que las pantallas ya usan (DIP, ~250 líneas).
3. **Extraer la política de roles** a `services/roles.ts`: etiquetas, reglas de sobrescritura y predicados `canSeeQr`/`canScan` (SRP/OCP, ~150 líneas).
4. **Extraer la validación de formularios** de `module-screen.tsx` y unificar validadores de correo/contraseña con `auth.ts` (SRP + duplicación, ~200 líneas).
5. **Hacer genérico `ModuleScreen<T>`** para eliminar `summary as never` y el campo por cadena de `toggleRecord` (LSP/ISP, ~120 líneas).
6. **Reconciliar modelos** local y Prisma, o documentar la tabla de correspondencia, antes de conectar el backend (bloqueante de HU-01 y HU-09).

## 7. Qué NO hay que tocar

- `services/storage.ts` — ya es el puerto delgado que DIP pide.
- El patrón de almacén externo de `services/collections.ts` (`useSyncExternalStore` + hidratación): es sólido; solo hay que darle alcance por usuario.
- El panel dirigido por registro y los cuatro archivos de módulo delgados: diseño limpio y extensible.
- `services/vinculos.ts` — cohesivo, una sola responsabilidad, QR autoverificable.
- `constants/theme.ts`, `content.ts`, `hooks/` — correctos.
- La estructura general de las dos landing: la separación por plataforma es intencional; solo los literales de color deberían moverse a tokens.

## 8. Límites de esta auditoría

- No se ejecutó la aplicación ni la batería de pruebas: es análisis estático de responsabilidades y acoplamiento, no verificación funcional.
- Las líneas citadas son aproximadas y corresponden al estado de `dev-kevin` en la fecha indicada.
- No se evaluó rendimiento, accesibilidad ni seguridad de la cámara; quedan fuera de alcance.
