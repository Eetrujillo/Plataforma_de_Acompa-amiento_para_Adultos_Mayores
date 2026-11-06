'use strict';

const { isValidPairingCode, isPairingCodeExpired } = require('../domain/pairingCode');
const { User, toPublicUser } = require('../../auth/domain/User');
const { sessionClaims } = require('../../../shared/session/sessionVersion');
const { ConflictError, NotFoundError, ValidationError } = require('../../../shared/errors');

/**
 * Links a senior device to the caregiver that owns the pairing code.
 *
 * Ports: pairingRepository, userRepository, tokenService
 */
class LinkSeniorApp {
  constructor({ pairingRepository, userRepository, tokenService }) {
    this.pairingRepository = pairingRepository;
    this.userRepository = userRepository;
    this.tokenService = tokenService;
  }

  async execute({ code, fullName, phone } = {}) {
    if (!isValidPairingCode(code)) {
      throw new ValidationError('pairing code must be 6 digits');
    }

    const record = await this.pairingRepository.findByCode(code);

    if (!record) {
      throw new NotFoundError('pairing code not found');
    }

    if (record.usedAt) {
      throw new ConflictError('pairing code already used');
    }

    if (isPairingCodeExpired(record.expiresAt)) {
      throw new ValidationError('pairing code expired');
    }

    // Redeeming the code is the proof that this device is the senior's, so the profile is
    // born linked; a profile created from the caregiver panel is PENDING until then.
    const senior = User.createSenior({
      fullName,
      phone,
      caregiverId: record.caregiverId,
      linkStatus: 'LINKED'
    });

    const created = await this.userRepository.create({
      email: senior.email,
      fullName: senior.fullName,
      phone: senior.phone,
      role: senior.role,
      caregiverId: senior.caregiverId,
      timezone: senior.timezone,
      linkStatus: senior.linkStatus
    });

    await this.pairingRepository.markUsed({ id: record.id, seniorId: created.id });

    const token = this.tokenService.sign(sessionClaims(created));

    return { token, senior: toPublicUser(created) };
  }
}

module.exports = { LinkSeniorApp };
