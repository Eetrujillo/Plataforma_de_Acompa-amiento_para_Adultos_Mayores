'use strict';

const { AppError } = require('./AppError');

class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, { statusCode: 401, code: 'UNAUTHORIZED' });
  }
}

module.exports = { UnauthorizedError };
