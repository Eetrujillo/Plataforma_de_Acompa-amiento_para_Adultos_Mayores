'use strict';

const { AppError } = require('./AppError');

/**
 * Google sign-in was requested but the backend has no `GOOGLE_CLIENT_ID`.
 *
 * 503 instead of a silent failure: the endpoint must never pretend to work when
 * the OAuth client is not configured.
 */
class GoogleNotConfiguredError extends AppError {
  constructor(message = 'El acceso con Google no está configurado') {
    super(message, { statusCode: 503, code: 'GOOGLE_NOT_CONFIGURED' });
  }
}

module.exports = { GoogleNotConfiguredError };
