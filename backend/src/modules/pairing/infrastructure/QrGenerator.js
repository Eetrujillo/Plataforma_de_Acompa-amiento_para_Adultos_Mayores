'use strict';

const qrcode = require('qrcode');

/**
 * QR adapter: renders the pairing payload the senior app scans.
 *
 * HU-006 S1 (L9): el QR es el único soporte de la credencial. El payload es un sobre con el
 * token, no una URL: la app reconoce el `type` antes de usar el valor, y nada del payload
 * identifica al adulto mayor ni al familiar.
 */

/**
 * Cuerpo exacto del QR. Vive aparte del codificador para que el contrato sea verificable sin
 * decodificar una imagen.
 */
function buildPairingQrPayload(token) {
  return JSON.stringify({ type: 'senior-pairing', token });
}

class QrGenerator {
  async toDataUrl(token) {
    return qrcode.toDataURL(buildPairingQrPayload(token), {
      width: 320,
      margin: 1,
      errorCorrectionLevel: 'M'
    });
  }
}

module.exports = { QrGenerator, buildPairingQrPayload };
