'use strict';

const { AppError } = require('./AppError');

class InvalidFullNameError extends AppError {
  constructor() {
    super('El nombre completo es obligatorio y debe tener al menos 3 caracteres', {
      statusCode: 400,
      code: 'INVALID_NAME'
    });
  }
}

module.exports = { InvalidFullNameError };
