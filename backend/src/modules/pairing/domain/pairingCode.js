'use strict';

const { randomInt } = require('node:crypto');

const PAIRING_CODE_LENGTH = 6;
const PAIRING_CODE_PATTERN = /^\d{6}$/;

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

function computePairingExpiration(now = new Date(), ttlMinutes = 15) {
  return new Date(now.getTime() + ttlMinutes * 60_000);
}

module.exports = {
  PAIRING_CODE_LENGTH,
  generatePairingCode,
  isValidPairingCode,
  isPairingCodeExpired,
  computePairingExpiration
};
