'use strict';

const { generatePairingCode, computePairingExpiration } = require('../domain/pairingCode');
const { AppError, ValidationError } = require('../../../shared/errors');

/**
 * Allocates a unique, short lived pairing code for a caregiver.
 *
 * Ports: pairingRepository
 */
class GeneratePairingCode {
  constructor({ pairingRepository, config }) {
    this.pairingRepository = pairingRepository;
    this.config = config;
  }

  async execute({ caregiverId } = {}) {
    if (typeof caregiverId !== 'string' || caregiverId.length === 0) {
      throw new ValidationError('caregiverId is required');
    }

    const { codeLength, ttlMinutes, maxGenerationAttempts } = this.config.pairing;

    for (let attempt = 0; attempt < maxGenerationAttempts; attempt += 1) {
      const code = generatePairingCode(codeLength);

      if (await this.pairingRepository.existsByCode(code)) {
        continue;
      }

      const expiresAt = computePairingExpiration(new Date(), ttlMinutes);
      const record = await this.pairingRepository.create({ code, caregiverId, expiresAt });

      return { code: record.code, expiresAt: record.expiresAt };
    }

    throw new AppError('Could not allocate a unique pairing code', {
      statusCode: 503,
      code: 'PAIRING_CODE_UNAVAILABLE'
    });
  }
}

module.exports = { GeneratePairingCode };
