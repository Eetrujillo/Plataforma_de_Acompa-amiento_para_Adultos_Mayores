# Auth local + Dashboard — Acompañamiento de Adulto Mayor

Segunda entrega: autenticación local compartida (mismas llamadas de servicio en web y móvil) y dashboard con módulos Dosificación, Alertas, Tareas y Citas.

## Specs

S1: "genera la autenticacion de momento local para web y mobil" — registro/login con persistencia local, sin backend en esta etapa.
S2: "los llamados deben ser los mismos a ese local storage, osea compartir los datos" — UNA capa de servicio compartida por ambas plataformas; las llamadas (register, login, logout, sesión, CRUD) son las mismas en web y móvil; los datos viven en el almacenamiento local del dispositivo/navegador.
S3: "genera un dashboard con funciones, dosificacion, alertas, tareas, citas" — dashboard post-login con cuatro módulos funcionales sobre almacenamiento local: Dosificación (medicamento, dosis, horario), Alertas (aviso/recordatorio manual), Tareas (con estado completada), Citas (médico, lugar, fecha).

## Tasks

T1 [S2] ✅ `src/services/storage.ts` (AsyncStorage; localStorage en web) + `src/services/collections.ts` convertido en almacén externo (useSyncExternalStore, caché por colección + notificación, hidratación idempotente). Ruta: inline. Commit: 18eeab5.
T2 [S1,S2] ✅ `src/services/auth.ts`: register/login/logout/getSession, SHA-256 con salt por usuario, email único, mensajes de error. Ruta: inline. Commit: 18eeab5.
T3 [S1,S2] ✅ `src/app/auth.tsx` conectado: éxito → /dashboard; sesión abierta salta directo. Ruta: inline. Commit: f3c4217.
T4 [S3] ✅ `src/app/(dashboard)/_layout.tsx` (guardia de sesión) + `dashboard.tsx` (bienvenida, 4 tarjetas, cerrar sesión) + `src/modules/registry.ts`. Ruta: inline. Commit: 2f73624.
T5 [S3] ✅ `src/components/module-screen.tsx` (fábrica: lista, alta/edición, borrado en dos pasos, toggle para tareas) + `dosificaciones.tsx`, `alertas.tsx`, `tareas.tsx`, `citas.tsx` + `src/modules/models.ts`. Ruta: inline. Commit: 4805f5c.
T6 [S1,S3] ✅ Verificación: tsc exit 0; expo lint exit 0; `expo export --platform web` exit 0 (rutas /auth, /dashboard, /dosificaciones, /alertas, /tareas, /citas); smoke test E2E en Chromium con ego-browser: landing → Log in/Sign up → /auth → registro (Carlos Prueba) → dashboard → crear dosificación → persistió tras reload → borrado en dos pasos → logout. Detectados y corregidos en el proceso: botón auth de la landing mal cableado (3f9cb2c), notas opcional marcada como requerida, y falta de notify() tras hidratar el almacén.

Fix adicional: 3f9cb2c; deps: 9c34f83.

## Log

L1: "genera la autenticacion de momento local para web y mobil, los llamados deben ser los mismos a ese local storage, osea compartir los datos, y genera un dashboard con funciones, dosificacion, alertas, tareas, citas"
L2: Alcance decidido: AsyncStorage en ambas plataformas (en web usa localStorage por debajo) para que la capa de servicio sea única; claves con prefijo `aam.*`. Sin roles aún (web=encargado, móvil=adulto: se decide en próxima iteración si los módulos se filtran por rol).
L3: Verificación (2025-11-13): tsc/lint/export en verde; smoke test E2E con ego-browser verificó el flujo completo y destapó 3 defectos corregidos (botón auth → /auth, validación de campo opcional, notify() post-hidratación). Nota: el borrado usa confirmación en dos pasos para evitar API solo-nativas (Alert) y funcionar igual en web.
L4: Datos observados en localStorage: `aam.users`, `aam.session`, `aam.dosificaciones`, etc. El usuario tiene su propio `npm run web` (expo start) corriendo para probar en vivo. Dist de builds estáticos queda bloqueado mientras un servidor lo sirve: siempre frenar `serve` antes de re-exportar.

Delivery strategy: ask-on-risk. Forecast ~1100 authored lines.
