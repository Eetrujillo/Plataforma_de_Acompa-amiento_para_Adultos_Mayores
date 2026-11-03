'use strict';

const qrcode = require('qrcode');

/**
 * QR adapter: renders the pairing payload the senior app scans.
 */
class QrGenerator {
  async toDataUrl(code) {
    const payload = JSON.stringify({ type: 'senior-pairing', code });
    return qrcode.toDataURL(payload, { width: 320, margin: 1, errorCorrectionLevel: 'M' });
  }
}

module.exports = { QrGenerator };
