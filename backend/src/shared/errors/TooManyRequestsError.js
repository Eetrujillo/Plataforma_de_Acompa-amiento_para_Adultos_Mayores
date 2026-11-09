'use strict';

const { AppError } = require('./AppError');

/**
 * 429: the caller asked for the same costly operation too many times inside the window.
 *
 * `details.retryAfterSeconds` is deliberately part of the body: a client that cannot
 * tell the user when to try again ends up retrying in a loop.
 */
class TooManyRequestsError extends AppError {
  constructor(message, details) {
    super(message, { statusCode: 429, code: 'TOO_MANY_REQUESTS', details });
  }
}

module.exports = { TooManyRequestsError };
