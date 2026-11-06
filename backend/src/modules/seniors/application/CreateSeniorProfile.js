'use strict';

const { User } = require('../../auth/domain/User');
const {
  LINK_STATUS,
  assertPin,
  resolveFullName,
  resolveTimeZone,
  toPublicSenior
} = require('../domain/seniorProfile');

/**
 * Creates a senior profile owned by the authenticated caregiver.
 *
 * Ports: userRepository, pinHasher
 *
 * The PIN arrives in clear text and leaves this layer already hashed: the plaintext never
 * reaches the repository, a log line or a response.
 */
class CreateSeniorProfile {
  constructor({ userRepository, pinHasher }) {
    this.userRepository = userRepository;
    this.pinHasher = pinHasher;
  }

  async execute({ caregiverId, fullName, pin, timezone } = {}) {
    const normalizedName = resolveFullName(fullName);
    const plainPin = assertPin(pin);
    const resolvedTimeZone = resolveTimeZone(timezone);

    const pinHash = await this.pinHasher.hash(plainPin);

    // One factory for every senior: the pairing flow creates them through it too, so the
    // rules cannot drift between the two creation paths (HU-005 S7).
    const senior = User.createSenior({
      fullName: normalizedName,
      caregiverId,
      pinHash,
      timezone: resolvedTimeZone,
      linkStatus: LINK_STATUS.PENDING
    });

    const created = await this.userRepository.create({
      email: senior.email,
      fullName: senior.fullName,
      phone: senior.phone,
      role: senior.role,
      caregiverId: senior.caregiverId,
      pinHash: senior.pinHash,
      timezone: senior.timezone,
      linkStatus: senior.linkStatus
    });

    return toPublicSenior(created);
  }
}

module.exports = { CreateSeniorProfile };
