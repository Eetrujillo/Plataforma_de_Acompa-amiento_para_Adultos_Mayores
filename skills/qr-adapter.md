# Reglas del QR de vinculación — HU-006

El QR **es** la credencial: no envuelve un código tipeable ni acompaña a uno. Si no hay QR, no hay
forma de vincular el perfil.

## 1. Contenido

- El payload es `{"type":"senior-pairing","token":"<43 caracteres base64url>"}`. Nada más: no una
  URL con credencial, no un JWT, no el `seniorId`, no datos del adulto mayor.
- El `type` es el discriminante que permite a la app móvil rechazar un QR ajeno antes de usar el
  valor, y el que deja lugar a futuros tipos sin reinterpretar cadenas.
- Motivo: un QR es visual y público —queda en una pantalla, en una captura, en una foto—. El token
  que lleva es de un solo uso, está atado a un perfil y a una vigencia de 24 h; nada más viaja ahí.
- Cuerpo exacto en `buildPairingQrPayload()` (`backend/src/modules/pairing/infrastructure/QrGenerator.js`),
  fuera del codificador, para que el contrato sea verificable sin decodificar una imagen.
- Debe canjearse por el mismo `POST /api/pairing/redeem` que usa cualquier QR. Un solo camino: no
  hay ruta alterna por código tipeado.

## 2. Formato de salida

- El backend devuelve `qrCodeDataUrl` (PNG en base64, prefijo `data:image/png;base64,`), generado a
  320 px con margen 1 y corrección de errores `M`.
- El panel lo muestra como imagen con texto alternativo que nombra al **perfil**, no a un código:
  quien usa lector de pantalla no depende del QR y no hay ningún valor que leer en voz alta.
- Si el codificador falla, la emisión **falla**: `503 PAIRING_QR_UNAVAILABLE`. Sin imagen no hay
  credencial, así que no se responde `201` con la imagen vacía ni se invalida el QR anterior. El
  panel muestra el mensaje y ofrece reintentar.
- La única salida visual del panel es la imagen del QR. No hay texto con el token, ni un campo para
  pegarlo o tipearlo, ni un botón "copiar".

## 3. Legibilidad (adulto mayor)

- Tamaño mínimo 240×240 px en pantalla; el panel lo muestra a 320 px (máximo del contenedor) sin
  logo encima, sin colores invertidos y sin recortes.
- La vigencia se muestra junto al QR, tomada de `expiresAt` ("vence el dd/mm/aaaa a las hh:mm"). Un
  QR que ya venció no se sigue mostrando como si sirviera: se regenera.
- El escaneo desde el teléfono del adulto mayor es HU-007. Hasta entonces la pantalla del teléfono
  sin vincular sólo explica que hay que escanear el QR del panel.

## 4. Seguridad

- El QR no se cachea como recurso propio ni se guarda en disco o en logs: se renderiza desde la
  respuesta del endpoint de emisión.
- Al emitirse un token nuevo para el mismo perfil, el QR viejo deja de servir: el canje rechaza lo
  invalidado con el mismo mensaje que lo vencido.
- Quien fotografíe el QR tiene la credencial hasta que se canjee o venza. No hay reenvío, ni
  "compartir", ni historial de QRs emitidos en la interfaz.

## 5. Dónde vive

- Generación: `backend/src/modules/pairing/infrastructure/QrGenerator.js` (data URL, sin estado).
- Presentación: `frontend/src/features/pairing/ui/PairingQrPanel.jsx`.
- Contrato: `docs/pairing-api.md`. Token y vigencia: `skills/pairing-generator.md`.
