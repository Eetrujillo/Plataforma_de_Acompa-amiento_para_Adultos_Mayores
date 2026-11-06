'use strict';

const { AppError } = require('./AppError');

/**
 * 429: la cuenta está bloqueada temporalmente por intentos fallidos de login.
 *
 * `details.retryAfterSeconds` dice cuánto falta para poder reintentar. Este código es
 * distinto del `TOO_MANY_REQUESTS` del reenvío de verificación a propósito: aquel es un
 * límite de peticiones, este es un bloqueo de cuenta, y el cliente necesita poder
 * distinguirlos para mostrar el mensaje correcto.
 */
class AccountLockedError extends AppError {
  constructor(message, details) {
    super(message, { statusCode: 429, code: 'ACCOUNT_LOCKED', details });
  }
}

module.exports = { AccountLockedError };
