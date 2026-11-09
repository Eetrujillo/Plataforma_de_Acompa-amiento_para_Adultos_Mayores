'use strict';

const { AppError } = require('./AppError');

/**
 * The PIN is a 4 digit secret: the error says the format is wrong and never echoes it.
 */
class InvalidPinError extends AppError {
  constructor() {
    super('El PIN debe tener exactamente 4 dígitos numéricos', {
      statusCode: 400,
      code: 'INVALID_PIN'
    });
  }
}

module.exports = { InvalidPinError };
