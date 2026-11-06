'use strict';

const { AppError } = require('./AppError');

class InvalidTimeZoneError extends AppError {
  constructor() {
    super('La zona horaria indicada no es válida', {
      statusCode: 400,
      code: 'INVALID_TIMEZONE'
    });
  }
}

module.exports = { InvalidTimeZoneError };
