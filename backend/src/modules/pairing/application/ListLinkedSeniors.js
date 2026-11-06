'use strict';

const { isPendingLinkStatus } = require('../domain/seniorLinkState');

/**
 * Lists the seniors linked to a caregiver, so the dashboard can pick one.
 *
 * El predicado de "pendiente" vive en el dominio porque la misma regla decide para qué
 * perfiles se puede emitir un código (HU-006 S3): un documento anterior a HU-005 no trae
 * `linkStatus` y cuenta como vinculado.
 *
 * Ports: userRepository
 */
class ListLinkedSeniors {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  async execute({ caregiverId } = {}) {
    const seniors = await this.userRepository.listSeniorsByCaregiver(caregiverId);

    return {
      seniors: seniors
        .filter((senior) => !isPendingLinkStatus(senior.linkStatus))
        .map((senior) => ({
          id: senior.id,
          fullName: senior.fullName,
          phone: senior.phone ?? null
        }))
    };
  }
}

module.exports = { ListLinkedSeniors };
