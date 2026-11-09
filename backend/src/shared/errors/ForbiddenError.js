'use strict';

const { AppError } = require('./AppError');

class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, { statusCode: 403, code: 'FORBIDDEN' });
  }
}

module.exports = { ForbiddenError };
