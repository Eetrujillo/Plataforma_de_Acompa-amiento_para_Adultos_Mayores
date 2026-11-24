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
4. **Canjear** el token contra `POST /api/pairing/redeem`.
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

- `POST /api/pairing/redeem` con `{ "token": "..." }` y sin sesión: el token **es** la credencial.
- La respuesta exitosa trae el token de dispositivo. Es la única vez que se entrega.
- `409` (vencido, reemplazado o ya canjeado) **no se reintenta**: se muestra el mensaje y se ofrece
  escanear otro. Reintentar un token quemado solo gasta intentos y nunca va a funcionar.
- La escritura del servidor es atómica: dos escaneos simultáneos del mismo QR terminan con un solo
  `201` y el resto en `409`. El cliente no necesita deduplicar, pero tampoco puede asumir dos
  éxitos.
- El canje no crea perfiles ni manda datos de la ficha: el cuerpo solo lleva `token`.

## 4. Mensajes exactos

| Situación | Texto en pantalla |
| --- | --- |
| QR vencido o reemplazado (409) | **"Pídele a tu familiar un QR nuevo"** |
| QR ya usado (409) | "Este código ya se usó. Pídele a tu familiar un QR nuevo." |
| QR de otra app (validación local) | "Este código no es de la app." |
| Sin conexión | "Sin conexión. Reintentando..." (con reintento manual visible) |
| Bloqueado por intentos | "Demasiados intentos. Espera 15 minutos." |
| Cámara denegada | "No podemos usar la cámara. Actívala en los ajustes del teléfono." |

El mensaje de 409 no distingue entre vencido, reemplazado y usado: es la misma respuesta del
servidor a propósito, y el texto tampoco lo desambigua.

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

## 8. Lo que no se hace

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
- Emisión del QR (el otro lado): `pairing-generator` y `qr-adapter`.
- Persistencia local: `mobile-storage-mmkv` (token) y `mobile-storage-sqlite-powersync` (cola offline).
