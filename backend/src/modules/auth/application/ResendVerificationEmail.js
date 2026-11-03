'use strict';

const { normalizeEmail, ROLES } = require('../domain/User');
const { issueVerificationEmail } = require('./issueVerificationEmail');
const { ValidationError } = require('../../../shared/errors');

/**
 * Re-issues the verification link for an unverified caregiver.
 *
 * The response is the same whether or not the account exists, so the endpoint
 * cannot be used to enumerate registered emails.
 *
 * Ports: userRepository, verificationRepository, emailSender
 */
class ResendVerificationEmail {
  constructor({ userRepository, verificationRepository, emailSender, config, logger = console }) {
    this.userRepository = userRepository;
    this.verificationRepository = verificationRepository;
    this.emailSender = emailSender;
    this.config = config;
    this.logger = logger;
  }

  async execute({ email } = {}) {
    if (typeof email !== 'string' || email.trim().length === 0) {
      throw new ValidationError('email is required');
    }

    const user = await this.userRepository.findByEmail(normalizeEmail(email));

    const eligible = user && !user.emailVerifiedAt && user.role === ROLES.CAREGIVER;

    if (eligible) {
      await issueVerificationEmail({
        verificationRepository: this.verificationRepository,
        emailSender: this.emailSender,
        config: this.config,
        user,
        logger: this.logger
      });
    }

    return { accepted: true };
  }
}

module.exports = { ResendVerificationEmail };
