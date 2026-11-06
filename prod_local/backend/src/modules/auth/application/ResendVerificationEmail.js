'use strict';

const { normalizeEmail, ROLES } = require('../domain/User');
const { issueVerificationEmail } = require('./issueVerificationEmail');
const { ValidationError } = require('../../../shared/errors');

/**
 * Re-issues the verification link for an unverified caregiver.
 *
 * The response is the same whether or not the account exists, so the endpoint
 * cannot be used to enumerate registered emails. That contract is why the
 * throttle runs *before* the lookup and counts every attempt: a 429 that only
 * appeared for real accounts would be an existence oracle.
 *
 * Ports: userRepository, verificationRepository, emailSender, resendThrottle
 */
class ResendVerificationEmail {
  constructor({
    userRepository,
    verificationRepository,
    emailSender,
    config,
    resendThrottle,
    logger = console
  }) {
    if (!resendThrottle) {
      // Fail loudly instead of silently shipping the endpoint without its limit.
      throw new TypeError('ResendVerificationEmail requires a resendThrottle');
    }

    this.userRepository = userRepository;
    this.verificationRepository = verificationRepository;
    this.emailSender = emailSender;
    this.config = config;
    this.resendThrottle = resendThrottle;
    this.logger = logger;
  }

  async execute({ email } = {}) {
    if (typeof email !== 'string' || email.trim().length === 0) {
      throw new ValidationError('email is required');
    }

    // Normalization runs first: a malformed address is a 400 and must not spend a
    // slot of the window.
    const normalizedEmail = normalizeEmail(email);

    this.resendThrottle.consume(normalizedEmail);

    const user = await this.userRepository.findByEmail(normalizedEmail);

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
