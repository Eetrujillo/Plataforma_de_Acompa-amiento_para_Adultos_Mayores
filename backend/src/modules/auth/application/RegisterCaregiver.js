'use strict';

const { User, toPublicUser } = require('../domain/User');
const { issueVerificationEmail } = require('./issueVerificationEmail');
const { ConflictError } = require('../../../shared/errors');

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
      passwordHash,
      // New accounts start unverified: the login gate depends on it.
      emailVerifiedAt: null
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
}

module.exports = { RegisterCaregiver };
