'use strict';

const {
  generateVerificationToken,
  hashToken,
  isTokenExpired,
  isTokenWellFormed
} = require('./verificationToken');

/**
 * Token de restablecimiento de contraseña.
 *
 * Reutiliza las primitivas de `verificationToken.js` (32 bytes al azar, solo se guarda
 * el SHA-256, y el token crudo viaja únicamente en el correo) porque el problema es el
 * mismo: un secreto de un solo uso. Lo único propio es la ruta y la vigencia, que acá
 * es de 60 minutos y no de 24 horas.
 */
const PASSWORD_RESET_TTL_MINUTES = 60;
const PASSWORD_RESET_PATH = '/reset-password';

function computeResetExpiration(now, ttlMinutes = PASSWORD_RESET_TTL_MINUTES) {
  return new Date(now.getTime() + ttlMinutes * 60 * 1000);
}

function buildPasswordResetLink({ appUrl, rawToken }) {
  const base = String(appUrl).replace(/\/+$/, '');
  return `${base}${PASSWORD_RESET_PATH}?token=${encodeURIComponent(rawToken)}`;
}

module.exports = {
  PASSWORD_RESET_TTL_MINUTES,
  PASSWORD_RESET_PATH,
  generateVerificationToken,
  hashToken,
  isTokenExpired,
  isTokenWellFormed,
  computeResetExpiration,
  buildPasswordResetLink
};
