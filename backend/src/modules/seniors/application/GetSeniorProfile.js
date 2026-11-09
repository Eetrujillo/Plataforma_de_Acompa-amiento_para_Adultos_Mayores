'use strict';

const { ROLES } = require('../../auth/domain/User');
const { isValidSeniorId, toPublicSenior } = require('../domain/seniorProfile');
const { SeniorNotFoundError } = require('../../../shared/errors');

/**
 * Reads one profile, and only for the caregiver that owns it.
 *
 * Ports: userRepository
 *
 * Four conditions collapse into one answer: a malformed id, a missing document, a
 * caregiver account and another family's profile all produce the same 404. Anything else
 * would confirm that an id exists, which is the leak this rule is about.
 */
class GetSeniorProfile {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  async execute({ caregiverId, seniorId } = {}) {
    if (!isValidSeniorId(seniorId)) {
      throw new SeniorNotFoundError();
    }

    const senior = await this.userRepository.findById(seniorId);

    if (!senior || senior.role !== ROLES.SENIOR || senior.caregiverId !== caregiverId) {
      throw new SeniorNotFoundError();
    }

    return toPublicSenior(senior);
  }
}

module.exports = { GetSeniorProfile };
