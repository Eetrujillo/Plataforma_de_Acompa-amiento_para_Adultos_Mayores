'use strict';

const { generatePairingCode, computePairingExpiration } = require('../domain/pairingCode');
const { SeniorAlreadyLinkedError, SeniorIdRequiredError } = require('../domain/pairingErrors');
const { isPendingLinkStatus } = require('../domain/seniorLinkState');
const { ROLES } = require('../../auth/domain/User');
const { isValidSeniorId } = require('../../seniors/domain/seniorProfile');
const { AppError, SeniorNotFoundError, ValidationError } = require('../../../shared/errors');

/**
 * Allocates a unique, short lived pairing code for one profile of the caregiver.
 *
 * Ports: pairingRepository, userRepository
 *
 * The code belongs to a concrete profile (HU-006 S3): the caregiver comes from the session and
 * the profile from the body, but only after checking that it is a pending profile of that
 * caregiver. A code without a profile is no longer issued.
 */
class GeneratePairingCode {
  constructor({ pairingRepository, userRepository, config, now = () => new Date() }) {
    this.pairingRepository = pairingRepository;
    this.userRepository = userRepository;
    this.config = config;
    this.now = now;
  }

  async execute({ caregiverId, seniorId } = {}) {
    if (typeof caregiverId !== 'string' || caregiverId.length === 0) {
      throw new ValidationError('caregiverId is required');
    }

    // Ausente o mal formado corta antes de tocar la base: el código ya no es de la cuenta.
    if (!isValidSeniorId(seniorId)) {
      throw new SeniorIdRequiredError();
    }

    const senior = await this.userRepository.findById(seniorId);

    // Un perfil de otra familia, un id inexistente y una cuenta de cuidador responden igual:
    // distinguirlos confirmaría que el id existe (misma regla que HU-005).
    if (!senior || senior.role !== ROLES.SENIOR || senior.caregiverId !== caregiverId) {
      throw new SeniorNotFoundError();
    }

    if (!isPendingLinkStatus(senior.linkStatus)) {
      throw new SeniorAlreadyLinkedError();
    }

    const { codeLength, ttlMinutes, maxGenerationAttempts } = this.config.pairing;

    // HU-006 S2: los códigos anteriores de este perfil se invalidan ANTES de crear el nuevo.
    // Si la creación falla, el familiar queda sin código nuevo y con el anterior ya inválido:
    // falla cerrado y puede pedir otro.
    await this.pairingRepository.invalidateOutstanding({ caregiverId, seniorId });

    for (let attempt = 0; attempt < maxGenerationAttempts; attempt += 1) {
      const code = generatePairingCode(codeLength);

      if (await this.pairingRepository.existsByCode(code)) {
        continue;
      }

      const expiresAt = computePairingExpiration(this.now(), ttlMinutes);
      const record = await this.pairingRepository.create({ code, caregiverId, seniorId, expiresAt });

      return { code: record.code, expiresAt: record.expiresAt, seniorId };
    }

    throw new AppError('Could not allocate a unique pairing code', {
      statusCode: 503,
      code: 'PAIRING_CODE_UNAVAILABLE'
    });
  }
}

module.exports = { GeneratePairingCode };
