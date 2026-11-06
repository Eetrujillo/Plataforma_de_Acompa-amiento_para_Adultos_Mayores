'use strict';

const { AppError } = require('../../../shared/errors');

/**
 * Errores propios del ciclo del token de vinculación (HU-006 S3, rework de L9).
 *
 * Los tres son específicos de esta historia: `SENIOR_ID_REQUIRED` existe porque el QR pertenece
 * a un perfil, `SENIOR_ALREADY_LINKED` porque el panel ya sabe distinguir un perfil pendiente de
 * uno vinculado, y `PAIRING_QR_UNAVAILABLE` porque sin QR no hay credencial que entregar. El
 * panel muestra estos mensajes tal cual, así que van en español, igual que los de HU-005.
 */
class SeniorIdRequiredError extends AppError {
  constructor() {
    super('Elegí el adulto mayor para el que querés generar el QR', {
      statusCode: 400,
      code: 'SENIOR_ID_REQUIRED'
    });
  }
}

class SeniorAlreadyLinkedError extends AppError {
  constructor() {
    super('Ese perfil ya está vinculado: no hace falta un QR nuevo', {
      statusCode: 409,
      code: 'SENIOR_ALREADY_LINKED'
    });
  }
}

/**
 * El codificador falló. Se responde 503 y no se toca ningún token: el pedido se arma completo
 * antes de invalidar el anterior, así nadie queda con el QR viejo muerto y sin uno nuevo.
 *
 * El mensaje no repite nada del token, porque este cuerpo llega al cliente y al log.
 */
class PairingQrUnavailableError extends AppError {
  constructor() {
    super('No pudimos generar el QR. Probá de nuevo en unos segundos.', {
      statusCode: 503,
      code: 'PAIRING_QR_UNAVAILABLE'
    });
  }
}

module.exports = { SeniorIdRequiredError, SeniorAlreadyLinkedError, PairingQrUnavailableError };
