# HU-007 — Vincular mi app con el código

Rama: `hu-007-vincular-app`. Riesgo: alto (item 2 — canje público, token de dispositivo y PIN; item 3 —
`POST /api/pairing/link` cambia y lo consume el APK publicado).

## Specs

S1. Del backlog, criterio 1 (verbatim): "Con código válido y consentimiento previo, conecta la app y guarda el
   token de dispositivo."
   - `POST /api/pairing/redeem` exige `acceptedTerms: true` en el cuerpo. Sin él: `400 CONSENT_REQUIRED`, y el
     token **no** se canjea (no se quema un QR por un consentimiento que falta).
   - El "consentimiento previo" lo pide la app antes de canjear. El registro durable del consentimiento del
     titular es de HU-008; acá no se inventa evidencia ni se escriben los campos de auditoría.
   - La respuesta ya trae `token` (JWT del perfil). La app lo persiste y lo reusa al reiniciar: la sesión del
     adulto mayor sobrevive al cierre de la app y no se vuelve a pedir correo ni contraseña
     (regla "Cero Credenciales" de `skills/RUlLES.md`).

S2. Del backlog, criterio 2 — **reescrito**: "Muestra el mensaje claro \"Pídele a tu familiar un QR nuevo\" si el
   QR venció."
   - Texto exacto en la app cuando el canje responde `400` por código vencido o invalidado.
   - No se distingue "venció" de "lo reemplazaron": el mensaje es el mismo, como ya fija el backend.
   - No hay campo para tipear nada: el único camino es escanear.

S3. Del backlog, criterio 3 — **reescrito**: "Bloquea nuevos intentos por 15 minutos tras 5 fallos consecutivos de
   QR."
   - Límite sobre el canje público: 5 falencias consecutivas de QR → 15 minutos. Al sexto: `429 TOO_MANY_ATTEMPTS`
     con `retryAfterSeconds`.
   - Se cuenta por IP: el canje no tiene sesión y un token inválido no identifica perfil. Un canje exitoso limpia
     el contador de esa IP.
   - Patrón del proyecto: `ResendThrottle` (ventana en memoria, por proceso). Se documenta la consecuencia:
     reiniciar el proceso limpia la ventana.

S4. PIN (decisión de alcance, ver L2): el vínculo usa solo el QR; el PIN desbloquea la app después.
   - `POST /api/seniors/me/unlock` con la sesión del adulto mayor y `{ "pin": "4821" }`:
     `200 { "unlocked": true }`; PIN incorrecto `401 PIN_MISMATCH`; PIN con formato inválido `400 INVALID_PIN`.
   - Bloqueo del PIN **por perfil y persistido**: 5 fallos consecutivos → 15 minutos. Al intentar durante el
     bloqueo: `429 PIN_LOCKED` con `retryAfterSeconds`. Un acierto limpia contador y bloqueo.
   - Campos nuevos en `User`: `pinFailedAttempts Int?`, `pinLockedUntil DateTime?` (nullable, como los de login).
   - Estas respuestas no dicen el PIN ni si el perfil tiene PIN cargado.

S5. Revocación del accesso desde el teléfono (mínimo, no pedido pero necesario para no dejar un token eterno):
   el token del adulto mayor se emite como los demás (JWT con `sv`), así que un cambio de contraseña del familiar
   no lo invalida. Se documenta como deuda; **no** se implementa revocación de dispositivo en esta HU.

S6. Pantallas del adulto mayor (frontend, `frontend/src/features/pairing/ui/senior/` + `pages/senior/`):
   - Escaneo del QR con la cámara (plugin de la app). Sin entrada manual de ningún tipo; si no hay permiso de
     cámara o el escaneo falla, se explica y se ofrece reintentar.
   - Consentimiento legible antes de canjear (texto de `skills/ley-1581.md`), con aceptar/rechazar; sin aceptar no
     se envía el canje.
   - Desbloqueo con PIN al abrir la app cuando hay sesión guardada, y borrar la sesión guardada si el token quedó
     inválido (`401`).
   - Reglas de `skills/senior-ui-wcag.md`: 20 px mínimo, área táctil ≥ 48 dp, contraste alto, errores anunciados
     (`role="alert"`), sin texto en inglés.

S7. Documentación y skills: `skills/pairing-link.md`, `skills/senior-ui-wcag.md`, y `docs/pairing-api.md`
   actualizado con `acceptedTerms`, el `429` del canje y el desbloqueo por PIN.

## Tasks

- T1 · S1, S3, S7 · backend: consentimiento obligatorio en el canje + límite de intentos por IP
- T2 · S4 · backend: `POST /api/seniors/me/unlock` + bloqueo del PIN persistido por perfil
- T3 · S6 · frontend móvil: ingreso de código, consentimiento, desbloqueo y sesión persistente
- T4 · S7 · docs + skills
- T5 · cierre: suite + build, verificación independiente, backlog y `ACTIVE_TASK` a HU-008

## Log

L1. Pedido del usuario (verbatim): "sigamos siguinete HU"
L2. Decisión de alcance del PIN (el usuario canceló la pregunta; decide el arquitecto): el vínculo usa **solo el
código**, porque es lo que dice el criterio 1, y el PIN desbloquea la app con su propio bloqueo persistido. Se
descarta pedir código + PIN en el mismo paso: suma un paso al adulto mayor sin que ningún criterio lo pida, y el
código ya prueba posesión del teléfono más el consentimiento. Se descarta también dejarlo para otra HU porque
`skills/bcrypt-pin.md` fija que el contador del PIN es obligatorio en la primera verificación, y esta es esa HU.
L3. "Consentimiento previo" se interpreta literal: la app lo pide antes de canjear y el endpoint lo exige como
bandera. El registro durable (evidencia Ley 1581) es HU-008; acá no se escriben `acceptedTermsAt`/`termsVersion`
del adulto mayor.
L4. Límite del canje por IP y por IP+código, no por perfil: un código inválido no identifica a nadie. El PIN sí se
limita por perfil, porque ahí el perfil está autenticado.

L5 (cambio de requisito heredado de HU-006 L9, verbatim del usuario): "elimina la parte del codigo solo crea el qr".
Esta HU ya no tiene ingreso manual: se escanea el QR, y la copy habla de "QR", no de "código".
