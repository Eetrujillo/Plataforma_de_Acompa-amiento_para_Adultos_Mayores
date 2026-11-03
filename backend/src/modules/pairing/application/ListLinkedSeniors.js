'use strict';

/**
 * Lists the seniors linked to a caregiver, so the dashboard can pick one.
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
      seniors: seniors.map((senior) => ({
        id: senior.id,
        fullName: senior.fullName,
        phone: senior.phone ?? null
      }))
    };
  }
}

module.exports = { ListLinkedSeniors };
