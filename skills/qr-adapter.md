# Reglas del QR de vinculación — HU-006

El QR es un atajo para el mismo código de 6 dígitos, no un segundo mecanismo de vinculación.

## 1. Contenido

- El QR contiene **solo el código** (`"482913"`). No una URL con token, no un JWT, no el
  `seniorId`, no datos del adulto mayor.
- Motivo: un QR es visual y público —queda en una pantalla, en una captura, en una foto—. Si llevara
  una URL con credencial, quien lo vea se queda con la credencial sin pasar por el límite de
  intentos ni por la invalidación.
- Debe ser canjeable por el mismo `POST /api/pairing/link` que el código tipeado. Un solo camino.

## 2. Formato de salida

- El backend devuelve `qrCodeDataUrl` (PNG en base64, prefijo `data:image/png;base64,`).
- El panel lo muestra como imagen con texto alternativo que nombra el código, para que quien use
  lector de pantalla no dependa del QR.
- El código impreso en pantalla sigue siendo la fuente de verdad: el QR es opcional. Si falla la
  generación del QR, el flujo no se cae —se muestra el código y el adulto mayor o su familiar lo
  tipean.

## 3. Legibilidad (adulto mayor)

- Tamaño mínimo 240×240 px en pantalla, contraste alto, sin logo encima ni colores invertidos.
- Se muestra a pantalla completa si el familiar lo pide: el teléfono que escanea suele estar a un
  metro o más, con la vista del adulto mayor.
- La vigencia se muestra junto al QR, tomada de `expiresAt`. Un QR que ya venció no se sigue
  mostrando como si sirviera.

## 4. Seguridad

- El QR no se cachea como recurso propio: se renderiza desde la respuesta del endpoint de emisión.
- No se guarda en disco ni en logs.
- Al invalidarse el código (nuevo código emitido para el mismo perfil), el QR viejo deja de servir
  por la misma razón que el código: el canje rechaza lo invalidado.

## 5. Dónde vive

- Generación: `backend/src/modules/pairing/infrastructure/QrGenerator.js` (data URL, sin estado).
- Presentación: `frontend/src/features/pairing/ui/PairingCodePanel.jsx`.
- Contrato: `docs/pairing-api.md`. Código y vigencia: `skills/pairing-generator.md`.
