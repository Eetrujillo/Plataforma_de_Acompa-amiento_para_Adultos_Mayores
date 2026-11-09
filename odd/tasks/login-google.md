# Login con la identidad visual del mockup y acceso con Google

Rehace `LoginScreen` para que coincida con el mockup `inicio_de_sesion.png` y suma el botón de
Google (Microsoft y Apple quedan fuera a pedido). Rama: `feat/login-google`, creada desde
`dev-Esteban-Trujillo`.

## Specs

S1. La pantalla de login muestra: fondo degradado celeste, tarjeta blanca redondeada, ilustración
    de una pareja mayor, título "Cuidamos tu bienestar", subtítulo "Seguimiento, medicamentos y
    acompañamiento, en un solo lugar.", dos campos con ícono, fila "Recordarme" + "¿Olvidaste tu
    contraseña?", botón "Iniciar sesión →", divisor "o continúa con", botón de Google y pie
    "¿No tienes una cuenta? Registrate".
S2. Solo se implementa Google: Microsoft y Apple no aparecen, no se maquetan ni se dejan
    deshabilitados.
S3. El campo de usuario dice "Correo electrónico" (no "o número de teléfono"): el backend solo
    autentica por correo y la UI no puede prometer algo que no existe.
S4. "¿Olvidaste tu contraseña?" queda visible, deshabilitado y con un texto que explica que todavía
    no está disponible (HU-004 sin implementar).
S5. "Recordarme" funciona de verdad: marcada la sesión sobrevive al cierre del navegador, sin marcar
    dura solo la pestaña.
S6. La contraseña se puede mostrar y ocultar con el ojo del campo.
S7. El botón de Google autentica cuentas existentes: valida el `id_token` de Google Identity
    Services en el backend, busca la cuenta por correo y devuelve `{ token, user }`, igual que el
    login por contraseña.
S8. Si el correo de Google no tiene cuenta, responde `404` código `EMAIL_NOT_REGISTERED` mensaje
    "Este correo no tiene una cuenta en la plataforma". Google nunca crea cuentas.
S9. Un `id_token` inválido, vencido o emitido para otro `client_id` responde `401` `UNAUTHORIZED`
    sin detalles internos.
S10. Como Google certifica el dominio del correo, si la cuenta existía sin verificar queda
     verificada (`emailVerifiedAt`) al ingresar por Google.
S11. El `client_id` se obtiene en tiempo de ejecución desde el backend (`GET /api/auth/google/config`),
     no se hornea en el build: así el mismo bundle sirve en local y en el VPS sin tocar el
     `docker-compose.yml`. Sin `GOOGLE_CLIENT_ID` el botón se muestra deshabilitado con un aviso.
S12. `GOOGLE_CLIENT_ID` documentado en `backend/env.sample` y en `docs/google-signin.md`, con los
     orígenes autorizados que hay que cargar en Google Cloud.

## Tasks

| ID | Specs | Route | Commit |
|----|-------|-------|--------|
| T1 | S1-S6 | gentle-ai-worker (frontend) | bc2955f + 6c9fab8 |
| T2 | S7-S12 | gentle-ai-worker (backend) | 8b795a1 |

## Log

L1 (user, verbatim):

> ahora si esta en descargas y se llama inicio_de_sesion.png pero solo necesito la parte de google
> lo de microsoft y de apple no lo implementes

L2 (evidence). El mockup está en `/home/kali/Descargas/inicio_de_sesion.png` (captura de 435x1024,
formato móvil). El backend no tiene dependencias de OAuth y `.env` no define `GOOGLE_CLIENT_ID`.
`LoginScreen.jsx` hoy es un formulario plano con `PageShell` y `FormField`.

L3 (decisions, del humano).
- Google solo inicia sesión: no crea cuentas (`404 EMAIL_NOT_REGISTERED`).
- No tiene OAuth client todavía: se documenta el paso a paso y el botón queda deshabilitado hasta
  que cargue `GOOGLE_CLIENT_ID`.
- La ilustración se recrea como SVG propio; no se copia arte de terceros.
- Alcance visual: solo `LoginScreen`.

L4 (evidence, observed):
- `backend: npm test` -> 73 tests, 73 pass, 0 fail, exit 0 (12 del worker de Google, 1 agregado acá
  para el caso `email_verified: false`, más los 60 previos).
- `frontend: npm run build` -> exit 0, 123 modules, `index-*.js` 266.24 kB.
- En vivo contra el stack reconstruido: `GET /api/auth/google/config` -> `{"enabled":false,"clientId":null}`
  (todavía no hay Client ID); `POST /api/auth/google` con config ausente -> `503 GOOGLE_NOT_CONFIGURED`;
  sin `idToken` -> `400 VALIDATION_ERROR` "Falta el token de Google"; el bundle servido contiene la
  pantalla nueva.
- Hueco del reparto: el botón de Google no quedó en ninguna de las dos unidades (el frente de pantalla
  dejó el slot y el de backend no podía tocar el frontend). Se implementó acá
  (`GoogleSignInButton.jsx`): carga única del script de GIS, render en el slot, `id_token` al backend.
- Defecto preexistente encontrado y arreglado: el login por contraseña no navegaba a ninguna parte;
  la sesión se creaba y el usuario seguía viendo el formulario. Ahora navega a `/caregiver` (igual que
  `VerifyEmailScreen`), tanto por contraseña como por Google.
- Dos ajustes al trabajo del worker de backend: mensaje del `idToken` faltante en español, y rechazo
  de tokens cuyo correo Google no certificó (`email_verified: false`), que si no habrían marcado la
  cuenta como verificada.
- No verificado: el flujo real con Google (falta el OAuth client y el `Client ID`), y el aspecto visual
  en un navegador de verdad.

L5 (cierre del reparto, observed):
- El árbol quedó en dos slices más un arreglo, sobre `feat/login-google` desde `b9fec0b`:
  `bc2955f` rediseño del login (S1-S6, 518 líneas agregadas), `8b795a1` Google (S7-S12, 1355
  líneas), `6c9fab8` la fila de recuperación (S1).
- Al separar el slice 1 apareció un defecto que el build no detectaba: el bloque de error de Google
  quedó huérfano en `LoginScreen.jsx` y `googleError` ya no existía, así que el render habría
  reventado. Se detectó con un render headless del commit intermedio, no con el build.
- `backend: npm test` -> 73 tests, 73 pass, 0 fail, exit 0. `frontend: npm run build` -> exit 0.
- Chequeo visual con Chromium headless contra el stack vivo (`http://localhost:3202/`, 435x1024 y
  375x900) y contra el mockup: fondo degradado, tarjeta, ilustración, título, subtítulo, campos con
  ícono, ojo de la contraseña, botón, divisor y pie coinciden. Solo Google aparece (S2), el campo
  dice "Correo electrónico" (S3) y el botón de Google se ve deshabilitado con su aviso (S11).
- Desviación encontrada y arreglada: la fila "Recordarme" + "¿Olvidaste tu contraseña?" se partía en
  dos líneas porque la nota de S4 vivía dentro del mismo flex item y su `max-content` empujaba el
  ancho. La nota pasó a una línea debajo y el enlace se encoge dentro de la fila (`6c9fab8`). A 435 px
  la fila queda como el mockup; a 375 px el enlace baja a la segunda línea y se alinea a la derecha,
  cosa que se acepta: la base tipográfica móvil del proyecto es 20 px por accesibilidad y con ese
  tamaño los dos textos no entran juntos a 375 px.
- Verificación de S7-S10 por lectura de código y tests: `verifyIdToken({ idToken, audience: clientId })`
  falla cerrado a `401 UNAUTHORIZED` con mensaje genérico; el correo sin certificar por Google se
  rechaza antes de cualquier escritura; `markEmailVerified` solo corre con el correo certificado; el
  endpoint de configuración expone únicamente `enabled` y `clientId`. Los tests afirman estado HTTP,
  cuerpo y contadores del repositorio (`create = 0`, `markEmailVerified = 0` en los rechazos).
- El verificador independiente (`gentle-ai-verify`) rechazó la corrida por su regla de admisión: el
  cambio no declara una línea `Risk:` y no se agregó una solo para habilitarlo. La verificación de
  S7-S10 quedó inline, con los tests como evidencia.
- `skills/` (backlog, reglas y tarea activa del proyecto) estaba sin trackear pero los documentos ODD
  lo citan como evidencia; se commiteó aparte en `4fe76fc`.
- Sigue sin verificar el flujo real con Google: no hay OAuth client ni `GOOGLE_CLIENT_ID` cargado, así
  que el botón se muestra deshabilitado a propósito.

