'use strict';

const { User, toPublicUser } = require('../domain/User');
const { ConflictError } = require('../../../shared/errors');

/**
 * Registers a caregiver account.
 *
 * Ports: userRepository, passwordHasher
 */
class RegisterCaregiver {
  constructor({ userRepository, passwordHasher }) {
    this.userRepository = userRepository;
    this.passwordHasher = passwordHasher;
  }

  async execute(input = {}) {
    const candidate = User.registerCaregiver(input);

    const existing = await this.userRepository.findByEmail(candidate.email);

    if (existing) {
      throw new ConflictError('Email is already registered');
    }

    const passwordHash = await this.passwordHasher.hash(input.password);

    const created = await this.userRepository.create({
      email: candidate.email,
      fullName: candidate.fullName,
      phone: candidate.phone,
      role: candidate.role,
      passwordHash
    });

    return toPublicUser(created);
  }
}

module.exports = { RegisterCaregiver };
