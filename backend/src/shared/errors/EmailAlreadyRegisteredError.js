'use strict';

const { AppError } = require('./AppError');

/**
 * A registration attempt with an email that already owns an account.
 *
 * HU-001 asks for HTTP 400 (not 409) so the register screen can show the message
 * inline, and the message is user facing: it is rendered as is.
 */
class EmailAlreadyRegisteredError extends AppError {
  constructor(message = 'Este correo ya tiene una cuenta') {
    super(message, { statusCode: 400, code: 'EMAIL_ALREADY_REGISTERED' });
  }
}

module.exports = { EmailAlreadyRegisteredError };
