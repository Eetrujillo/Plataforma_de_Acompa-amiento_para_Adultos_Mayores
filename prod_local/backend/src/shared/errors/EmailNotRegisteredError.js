'use strict';

const { AppError } = require('./AppError');

/**
 * A Google sign-in with an email that has no account on the platform.
 *
 * HU-003: Google only authenticates existing accounts, it never registers one.
 * The message is user facing: the login screen renders it as is.
 */
class EmailNotRegisteredError extends AppError {
  constructor(message = 'Este correo no tiene una cuenta en la plataforma') {
    super(message, { statusCode: 404, code: 'EMAIL_NOT_REGISTERED' });
  }
}

module.exports = { EmailNotRegisteredError };
