'use strict';

const { AppError } = require('./AppError');

/**
 * Also returned when the profile belongs to another caregiver: distinguishing "not yours"
 * from "does not exist" would confirm that an id is real.
 */
class SeniorNotFoundError extends AppError {
  constructor() {
    super('No encontramos ese perfil', { statusCode: 404, code: 'SENIOR_NOT_FOUND' });
  }
}

module.exports = { SeniorNotFoundError };
