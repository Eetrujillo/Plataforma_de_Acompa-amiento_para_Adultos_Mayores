'use strict';

const { AppError } = require('./AppError');

class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, { statusCode: 409, code: 'CONFLICT' });
  }
}

module.exports = { ConflictError };
