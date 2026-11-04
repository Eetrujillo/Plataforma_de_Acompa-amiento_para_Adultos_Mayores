'use strict';

const { User, toPublicUser } = require('../domain/User');
const { issueVerificationEmail } = require('./issueVerificationEmail');
const { ConflictError, EmailAlreadyRegisteredError } = require('../../../shared/errors');

const DEFAULT_TERMS_VERSION = '1.0';

/**
 * Registers a caregiver account and sends the email verification link.
 *
 * Ports: userRepository, passwordHasher, verificationRepository, emailSender
 */
class RegisterCaregiver {
  constructor({ userRepository, passwordHasher, verificationRepository, emailSender, config, logger = console }) {
    this.userRepository = userRepository;
    this.passwordHasher = passwordHasher;
    this.verificationRepository = verificationRepository;
    this.emailSender = emailSender;
    this.config = config;
    this.logger = logger;
  }

  termsVersion() {
    return this.config?.terms?.version ?? DEFAULT_TERMS_VERSION;
  }

  /**
   * `ipAddress` is supplied by the transport, not by the client: it is part of the
   * consent evidence required by Ley 1581 and must not be spoofable from the body.
   */
  async execute(input = {}) {
    const candidate = User.registerCaregiver({
      email: input.email,
      password: input.password,
      fullName: input.fullName,
      phone: input.phone,
      acceptedTerms: input.acceptedTerms,
      termsVersion: this.termsVersion(),
      ipAddress: normalizeIp(input.ipAddress)
    });

    const existing = await this.userRepository.findByEmail(candidate.email);

    if (existing) {
      throw new EmailAlreadyRegisteredError();
    }

    const passwordHash = await this.passwordHasher.hash(input.password);

    const created = await this.persist({
      email: candidate.email,
      fullName: candidate.fullName,
      phone: candidate.phone,
      role: candidate.role,
      passwordHash,
      // New accounts start unverified: the login gate depends on it.
      emailVerifiedAt: null,
      acceptedTermsAt: candidate.acceptedTermsAt,
      termsVersion: candidate.termsVersion,
      ipAddress: candidate.ipAddress
    });

    const delivery = await issueVerificationEmail({
      verificationRepository: this.verificationRepository,
      emailSender: this.emailSender,
      config: this.config,
      user: created,
      logger: this.logger
    });

    return { user: toPublicUser(created), verificationSent: delivery.sent };
  }

  async persist(data) {
    try {
      return await this.userRepository.create(data);
    } catch (error) {
      // The unique index is the last word on duplicates when two requests race.
      if (error instanceof ConflictError) {
        throw new EmailAlreadyRegisteredError();
      }

      throw error;
    }
  }
}

function normalizeIp(ipAddress) {
  return typeof ipAddress === 'string' && ipAddress.length > 0 ? ipAddress : null;
}

module.exports = { RegisterCaregiver, DEFAULT_TERMS_VERSION };
