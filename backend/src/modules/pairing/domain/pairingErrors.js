'use strict';

const { AppError } = require('../../../shared/errors');

/**
 * Errores propios del ciclo del código de vinculación (HU-006 S3).
 *
 * Los dos son específicos de esta historia: `SENIOR_ID_REQUIRED` existe porque el código pasó
 * a pertenecer a un perfil, y `SENIOR_ALREADY_LINKED` porque el panel ya sabe distinguir un
 * perfil pendiente de uno vinculado. El panel muestra estos mensajes tal cual, así que van en
 * español, igual que los de HU-005.
 */
class SeniorIdRequiredError extends AppError {
  constructor() {
    super('Elegí el adulto mayor para el que querés generar el código', {
      statusCode: 400,
      code: 'SENIOR_ID_REQUIRED'
    });
  }
}

class SeniorAlreadyLinkedError extends AppError {
  constructor() {
    super('Ese perfil ya está vinculado: no hace falta un código nuevo', {
      statusCode: 409,
      code: 'SENIOR_ALREADY_LINKED'
    });
  }
}

module.exports = { SeniorIdRequiredError, SeniorAlreadyLinkedError };
