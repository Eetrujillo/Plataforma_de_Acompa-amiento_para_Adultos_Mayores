'use strict';

const { AppError } = require('./AppError');

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, { statusCode: 404, code: 'NOT_FOUND' });
  }
}

module.exports = { NotFoundError };
