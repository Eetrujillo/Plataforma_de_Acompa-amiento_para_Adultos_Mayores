---
name: pairing-link
description: "Flujo de vinculación del teléfono del adulto mayor (HU-009 a HU-012): validar el sobre del QR antes de llamar al backend, consentimiento previo obligatorio, canje de un solo uso, mensajes exactos de vencido, bloqueo tras 5 fallos y guardado del token de dispositivo. Usar al construir la pantalla de escaneo o cualquier código que canjee un QR de vinculación."
---

# Vincular el teléfono es un canje, no un formulario

La credencial es el QR emitido por el familiar (`pairing-generator` y `qr-adapter`). Este archivo
cubre el otro lado: qué hace el teléfono con él. Es la mitad de HU-009 que nunca se implementó.

## 1. Orden obligatorio del flujo

1. **Escanear** el QR (cámara con `react-native-vision-camera`, permiso pedido en ese momento, no al
   abrir la app).
2. **Validar el sobre en el dispositivo**, antes de cualquier llamada de red.
3. **Mostrar el consentimiento** de la Ley 1581 (HU-009) con la tipografía de `senior-ui-wcag`.
4. **Canjear** el token contra `POST /api/pairing/redeem` con
   `{ "token": "...", "acceptedTerms": true }`: la bandera del paso 3 es obligatoria en el
   cuerpo; sin ella el backend responde `400 TERMS_NOT_ACCEPTED` antes de mirar la base.
5. **Guardar el token de dispositivo** y pasar el perfil a `LINKED`.
6. Abrir la rutina del día.

El consentimiento va **antes** del canje. Si el adulto mayor rechaza, el proceso se cancela y **no
se guarda nada**: ni token de dispositivo, ni estado, ni un registro parcial.

## 2. Validar el sobre antes de la red

- El payload debe ser exactamente `{"type":"senior-pairing","token":"<43 caracteres base64url>"}`.
- Se rechaza sin llamar al backend si `type` no es `senior-pairing`, si el `token` no matchea
  `/^[A-Za-z0-9_-]{43}$/`, si el JSON no parsea o si trae campos de más.
- Un QR de otro producto, una URL o un `seniorId` suelto **no** es un QR de vinculación: se muestra
  "Este código no es de la app" y no se gasta un intento.
- El token validado vive en memoria mientras dura el flujo. No se loguea, no se guarda en
  `localStorage`, no se muestra en pantalla y no entra en un reporte de error.

## 3. Canje: una sola vez, sin reintento automático

- `POST /api/pairing/redeem` con `{ "token": "...", "acceptedTerms": true }` y sin sesión: el
  token **es** la credencial (la ruta es pública, sin `Authorization`).
- La respuesta exitosa (`201`) trae el token de dispositivo. Es la única vez que se entrega.
- Los códigos del servidor, según `docs/pairing-api.md`: vencido o reemplazado → `400
  VALIDATION_ERROR` con el mensaje genérico en inglés; ya canjeado o perfil ajeno → `409
  CONFLICT`; perfil ya vinculado → `409 SENIOR_ALREADY_LINKED` (el QR no se quema); desconocido
  pero bien formado → `404 NOT_FOUND`; bloqueado → `429`. Ninguno de esos errores se reintenta
  automáticamente: se muestra el mensaje y se ofrece escanear otro. Reintentar un token quemado
  solo gasta intentos y nunca va a funcionar.
- La escritura del servidor es atómica: dos escaneos simultáneos del mismo QR terminan con un solo
  `201` y el resto en `409`. El cliente no necesita deduplicar, pero tampoco puede asumir dos
  éxitos.
- El canje no crea perfiles ni manda datos de la ficha: el cuerpo solo lleva `token` y la bandera
  de consentimiento; la evidencia (`acceptedTermsAt`, `termsVersion`, `ipAddress`) la arma el
  servidor — el cliente no la inventa.

## 4. Mensajes exactos

| Situación | Texto en pantalla |
| --- | --- |
| QR vencido o reemplazado (`400` del servidor, mensaje genérico) | **"Pídele a tu familiar un QR nuevo"** |
| QR ya usado (`409` del servidor) | "Este código ya se usó. Pídele a tu familiar un QR nuevo." |
| QR de otra app (validación local) | "Este código no es de la app." |
| Sin conexión | "Sin conexión. Reintentando..." (con reintento manual visible) |
| Bloqueado por intentos | "Demasiados intentos. Espera 15 minutos." |
| Cámara denegada | "No podemos usar la cámara. Actívala en los ajustes del teléfono." |

El mensaje de 409 no distingue entre ya usado y perfil ajeno: es la misma respuesta del servidor
a propósito, y el texto tampoco lo desambigua. Los errores (“400 del servidor”, “409 del
servidor”) no cambian el texto de pantalla: la app decide qué mostrar por código, nunca por el
mensaje en inglés que llega en `error.message`.

## 5. Sin PIN: el canje no pide ninguna credencial

- El anteproyecto exige la **ausencia de credenciales** para el adulto mayor (decisión L3). No hay
  PIN que verificar, ni al vincular, ni al cerrar sesión.
- Lo que autoriza el vínculo es la combinación de **token de un solo uso + consentimiento aceptado**,
  no un secreto que la persona tenga que recordar.
- Consecuencia de seguridad: el QR es la única barrera, y por eso su vigencia, su uso único y su
  invalidación al regenerar son obligatorios, no opcionales.
- La ausencia de PIN **no relaja** el límite de intentos de QR del punto 6: sigue vigente.

## 6. Bloqueo de intentos de QR

- 5 fallos consecutivos → 15 minutos de bloqueo (HU-009).
- El bloqueo se evalúa también en el servidor: el contador del cliente es comodidad, no seguridad.
  Un cliente modificado no puede saltarse el límite.
- El intento bloqueado no se cuenta: contar los rechazos extiende la ventana para siempre.
- El contador se guarda por perfil/dispositivo de forma que sobreviva a cerrar la app.

## 7. Token de dispositivo

- Se guarda con **MMKV** (`mobile-storage-mmkv`), cifrado en reposo; nunca en `AsyncStorage` ni en
  memoria persistente sin cifrar. Si el dispositivo lo soporta, la llave va al keystore de Android.
- No se escribe en el log, ni en un crash report, ni en un mensaje al usuario.
- Es lo que sostiene la sesión persistente: si existe, la app abre directo en la rutina.
- Si el familiar desvincula (red de cuidadores, reasignación), el token deja de valer en el servidor y
  la app vuelve a la pantalla de vinculación: el cliente no decide la desvinculación, la detecta por
  el rechazo del servidor.

## 8. Lo que ya vive en el backend (HU-009, canje)

Las reglas de los puntos anteriores se cumplen en el servidor `backend/src/modules/pairing/`
(caso de uso `RedeemPairingToken`, ruta pública `POST /api/pairing/redeem`):

- El reclamo es una escritura condicional de un solo uso **antes** de tocar el perfil: dos
  escaneos simultáneos producen un solo `201` y el resto `409`. Si la escritura del perfil falla
  después, el token queda quemado (falla cerrado): el familiar emite otro QR.
- El consentimiento (`acceptedTerms`) es obligatorio y la evidencia (`acceptedTermsAt`,
  `termsVersion`, `ipAddress`) se escribe en la misma escritura que `linkStatus: 'LINKED'`, sobre
  el propio documento del adulto mayor.
- El bloqueo por perfil vive en el servidor (5 fallos → 15 minutos, `429 ACCOUNT_LOCKED`; el
  intento bloqueado no se cuenta) y el límite por IP (`429 TOO_MANY_REQUESTS`) cuenta también los
  intentos con token desconocido. Un cliente modificado no puede saltarse ninguno de los dos.
- El mensaje `pairing token already used` (y sus dos hermanos en inglés) son los que la app
  mapea a los textos de pantalla de los puntos 3 y 4; el backend no muestra pantallas.

## 9. Lo que no se hace

- No hay campo para tipear el token, ni "pegar código", ni código de 6 dígitos legible.
- No se acepta un QR que venga por URL con la credencial adentro.
- No se guarda el token del QR después del canje: solo el token de dispositivo que devolvió el
  servidor.
- No se vincula antes de que el consentimiento quede registrado.
- No se muestra el `seniorId` ni datos del perfil durante el flujo.
- No se reintenta el mismo token automáticamente ni se rota por detrás.

## Dónde vive

- Pantalla de escaneo: `app/src/features/pairing/ui/senior/ScanPairingQr.tsx` (cámara con
  `react-native-vision-camera` y decodificación de QR local).
- Consentimiento: `app/src/features/consent/ui/senior/ConsentScreen.tsx`.
- Contrato del canje: `docs/pairing-api.md` · contrato del perfil: `docs/seniors-api.md`.
- Backend del canje: `backend/src/modules/pairing/application/RedeemPairingToken.ts` y
  `backend/src/modules/pairing/infrastructure/` (`MongoosePairingTokenRepository.claimUnused`,
  `MongoosePairingSeniorWriter`).
- Emisión del QR (el otro lado): `pairing-generator` y `qr-adapter`.
- Persistencia local: `mobile-storage-mmkv` (token) y `mobile-storage-sqlite-powersync` (cola offline).
