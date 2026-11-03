'use strict';

const { toPublicUser } = require('../domain/User');
const { NotFoundError } = require('../../../shared/errors');

/**
 * Reads the authenticated user profile.
 *
 * Ports: userRepository
 */
class GetCurrentUser {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  async execute({ userId } = {}) {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return toPublicUser(user);
  }
}

module.exports = { GetCurrentUser };
