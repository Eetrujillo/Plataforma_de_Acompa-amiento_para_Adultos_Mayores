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
      // Only the profiles whose device already proved ownership can be picked in the panel.
      // A document written before HU-005 carries no `linkStatus` and was created by the
      // pairing flow, so the missing field means linked, not pending.
      seniors: seniors
        .filter((senior) => senior.linkStatus !== 'PENDING')
        .map((senior) => ({
          id: senior.id,
          fullName: senior.fullName,
          phone: senior.phone ?? null
        }))
    };
  }
}

module.exports = { ListLinkedSeniors };
