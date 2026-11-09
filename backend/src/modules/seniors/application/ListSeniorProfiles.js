'use strict';

const { toPublicSenior } = require('../domain/seniorProfile');

/**
 * Lists the profiles of the authenticated caregiver.
 *
 * Ports: userRepository
 *
 * The scope is the repository query itself: filtering by `caregiverId` there means a
 * profile of another family is never loaded, so it cannot be returned by mistake.
 */
class ListSeniorProfiles {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  async execute({ caregiverId } = {}) {
    const seniors = await this.userRepository.listSeniorsByCaregiver(caregiverId);

    return { seniors: seniors.map(toPublicSenior) };
  }
}

module.exports = { ListSeniorProfiles };
