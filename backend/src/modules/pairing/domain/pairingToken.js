'use strict';

const { randomBytes, createHash } = require('node:crypto');

/**
 * Credencial de vinculación (HU-006 S1, reescrita por L9).
 *
 * No hay código legible por una persona: la credencial es un token opaco que viaja sólo dentro
 * del QR. 32 bytes de azar en base64url dan 43 caracteres y 256 bits, así que adivinar uno no es
 * viable y el límite de intentos deja de ser lo que sostiene la seguridad del canje.
 *
 * En la base se guarda únicamente `sha256(token)`, igual que el token de verificación de correo:
 * quien lea la colección no puede reconstruir un QR válido.
 */
const PAIRING_TOKEN_BYTES = 32;
const PAIRING_TOKEN_LENGTH = 43;
const PAIRING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Vigencia por defecto de 24 horas (S1).
 *
 * La constante vive acá y la configuración la usa como default, así el número aparece una sola
 * vez. `PAIRING_TTL_MINUTES` la puede acortar o alargar.
 */
const PAIRING_TOKEN_TTL_MINUTES = 1440;

/**
 * Un token reemplazado responde igual que uno vencido (S2): el adulto mayor no puede hacer nada
 * distinto, y distinguirlos sólo le sirve a quien está probando valores.
 */
const PAIRING_TOKEN_INVALID_MESSAGE = 'pairing token is invalid or expired';

/** 409 del canje: usado, perdido en la carrera, o el perfil ya no acepta el vínculo. */
const PAIRING_TOKEN_ALREADY_USED_MESSAGE = 'pairing token already used';

/** 404 del canje: un token bien formado que la base no conoce. */
const PAIRING_TOKEN_NOT_FOUND_MESSAGE = 'pairing token not found';

/**
 * Genera el token que viaja dentro del QR: 32 bytes criptográficamente seguros en base64url, sin
 * relleno. Es la única copia en claro que existe.
 */
function generatePairingToken() {
  return randomBytes(PAIRING_TOKEN_BYTES).toString('base64url');
}

/**
 * Huella que se persiste y con la que se busca en el canje. El valor en claro nunca se guarda.
 */
function hashPairingToken(rawToken) {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Un token es exactamente 43 caracteres base64url. Cualquier otra cosa se rechaza antes de
 * hashear: no hay motivo para consultar la base con un valor que no pudo haber emitido este
 * sistema.
 */
function isValidPairingToken(rawToken) {
  return typeof rawToken === 'string' && PAIRING_TOKEN_PATTERN.test(rawToken);
}

function isPairingTokenExpired(expiresAt, now = new Date()) {
  const expiresAtTime = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();

  if (!Number.isFinite(expiresAtTime)) {
    return true;
  }

  return expiresAtTime <= now.getTime();
}

/**
 * Un registro es canjeable mientras no fue canjeado, no fue reemplazado y sigue en tiempo. La
 * comprobación autoritativa de la carrera es la escritura condicional del repositorio; ésta sólo
 * responde antes, con el mensaje que se le muestra a quien escanea.
 */
function isPairingTokenRedeemable(record, now = new Date()) {
  return !record?.usedAt && !record?.invalidatedAt && !isPairingTokenExpired(record?.expiresAt, now);
}

function computePairingExpiration(now = new Date(), ttlMinutes = PAIRING_TOKEN_TTL_MINUTES) {
  return new Date(now.getTime() + ttlMinutes * 60_000);
}

module.exports = {
  PAIRING_TOKEN_ALREADY_USED_MESSAGE,
  PAIRING_TOKEN_BYTES,
  PAIRING_TOKEN_INVALID_MESSAGE,
  PAIRING_TOKEN_LENGTH,
  PAIRING_TOKEN_NOT_FOUND_MESSAGE,
  PAIRING_TOKEN_TTL_MINUTES,
  generatePairingToken,
  hashPairingToken,
  isValidPairingToken,
  isPairingTokenExpired,
  isPairingTokenRedeemable,
  computePairingExpiration
};
