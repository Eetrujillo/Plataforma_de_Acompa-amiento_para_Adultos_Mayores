'use strict';

const { toPublicUser } = require('../domain/User');
const { hashToken, isTokenWellFormed, isTokenExpired } = require('../domain/verificationToken');
const { ValidationError } = require('../../../shared/errors');

const INVALID_LINK_MESSAGE = 'El enlace de verificación no es válido o ya venció';

/**
 * Consumes a verification token: verifies the account and opens a session.
 *
 * Ports: verificationRepository, userRepository, tokenService
 */
class VerifyEmail {
  constructor({ verificationRepository, userRepository, tokenService }) {
    this.verificationRepository = verificationRepository;
    this.userRepository = userRepository;
    this.tokenService = tokenService;
  }

  async execute({ token } = {}) {
    if (!isTokenWellFormed(token)) {
      throw new ValidationError(INVALID_LINK_MESSAGE);
    }

    const record = await this.verificationRepository.findByHash(hashToken(token));

    if (!record || record.usedAt || isTokenExpired(record.expiresAt)) {
      throw new ValidationError(INVALID_LINK_MESSAGE);
    }

    await this.verificationRepository.markUsed({ id: record.id });

    const user = await this.userRepository.markEmailVerified(record.userId);

    const sessionToken = this.tokenService.sign({
      sub: user.id,
      role: user.role,
      email: user.email
    });

    return { token: sessionToken, user: toPublicUser(user) };
  }
}

module.exports = { VerifyEmail, INVALID_LINK_MESSAGE };
