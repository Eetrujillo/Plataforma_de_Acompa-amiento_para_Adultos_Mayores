'use strict';

/**
 * Lists the seniors linked to a caregiver, so the dashboard can pick one.
 *
 * Ports: userRepository
 */

/**
 * Only an explicit pending state is filtered out, and the comparison ignores case: a
 * hand-edited or imported document must not sneak into the activity picker, but a document
 * written before HU-005 carries no `linkStatus` at all and was created by the pairing flow,
 * so a missing value means linked.
 */
function isPending(linkStatus) {
  return typeof linkStatus === 'string' && linkStatus.toUpperCase() === 'PENDING';
}

class ListLinkedSeniors {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  async execute({ caregiverId } = {}) {
    const seniors = await this.userRepository.listSeniorsByCaregiver(caregiverId);

    return {
      seniors: seniors
        .filter((senior) => !isPending(senior.linkStatus))
        .map((senior) => ({
          id: senior.id,
          fullName: senior.fullName,
          phone: senior.phone ?? null
        }))
    };
  }
}

module.exports = { ListLinkedSeniors };
