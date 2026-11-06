'use strict';

const { randomInt } = require('node:crypto');

const PAIRING_CODE_LENGTH = 6;
const PAIRING_CODE_PATTERN = /^\d{6}$/;

/**
 * HU-006 S1: vigencia por defecto de 24 horas.
 *
 * La constante vive acá y la configuración la usa como default, así el número aparece una
 * sola vez. `PAIRING_TTL_MINUTES` la puede acortar o alargar.
 */
const PAIRING_CODE_TTL_MINUTES = 1440;

/**
 * Un código reemplazado responde igual que uno vencido (HU-006 S2): el adulto mayor no
 * puede hacer nada distinto, y distinguirlos sólo le sirve a quien está probando códigos.
 */
const PAIRING_CODE_INVALID_MESSAGE = 'pairing code is invalid or expired';

/**
 * Generates a numeric pairing code using a cryptographically secure RNG.
 */
function generatePairingCode(length = PAIRING_CODE_LENGTH) {
  if (!Number.isInteger(length) || length <= 0) {
    throw new RangeError('pairing code length must be a positive integer');
  }

  let code = '';

  for (let index = 0; index < length; index += 1) {
    code += String(randomInt(0, 10));
  }

  return code;
}

/**
 * A pairing code is exactly six digits, leading zeros included.
 */
function isValidPairingCode(code) {
  return typeof code === 'string' && PAIRING_CODE_PATTERN.test(code);
}

function isPairingCodeExpired(expiresAt, now = new Date()) {
  const expiresAtTime = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();

  if (!Number.isFinite(expiresAtTime)) {
    return true;
  }

  return expiresAtTime <= now.getTime();
}

/**
 * A record is redeemable while it was never redeemed, never replaced and still in time. The
 * authoritative check for the race is the conditional write in the repository; this one only
 * answers early, with the message the caller shows.
 */
function isPairingCodeRedeemable(record, now = new Date()) {
  return !record?.usedAt && !record?.invalidatedAt && !isPairingCodeExpired(record?.expiresAt, now);
}

function computePairingExpiration(now = new Date(), ttlMinutes = PAIRING_CODE_TTL_MINUTES) {
  return new Date(now.getTime() + ttlMinutes * 60_000);
}

module.exports = {
  PAIRING_CODE_INVALID_MESSAGE,
  PAIRING_CODE_LENGTH,
  PAIRING_CODE_TTL_MINUTES,
  generatePairingCode,
  isValidPairingCode,
  isPairingCodeExpired,
  isPairingCodeRedeemable,
  computePairingExpiration
};
