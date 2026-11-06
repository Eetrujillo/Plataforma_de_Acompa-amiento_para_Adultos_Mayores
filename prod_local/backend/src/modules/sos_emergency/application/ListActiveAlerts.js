'use strict';

const { toPublicSosAlert } = require('../domain/SosAlert');

/**
 * Lists the active alerts of every senior linked to a caregiver.
 *
 * Ports: sosRepository, userRepository
 */
class ListActiveAlerts {
  constructor({ sosRepository, userRepository }) {
    this.sosRepository = sosRepository;
    this.userRepository = userRepository;
  }

  async execute({ caregiverId } = {}) {
    const seniors = await this.userRepository.listSeniorsByCaregiver(caregiverId);
    const seniorIds = seniors.map((senior) => senior.id);

    if (seniorIds.length === 0) {
      return { alerts: [] };
    }

    const alerts = await this.sosRepository.findActiveBySeniorIds(seniorIds);

    return { alerts: alerts.map(toPublicSosAlert) };
  }
}

module.exports = { ListActiveAlerts };
