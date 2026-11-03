'use strict';

const { normalizeEmail, toPublicUser } = require('../domain/User');
const { UnauthorizedError, ValidationError, EmailNotVerifiedError } = require('../../../shared/errors');

/**
 * Authenticates a user and issues a JWT.
 *
 * Ports: userRepository, passwordHasher, tokenService
 */
class Login {
  constructor({ userRepository, passwordHasher, tokenService }) {
    this.userRepository = userRepository;
    this.passwordHasher = passwordHasher;
    this.tokenService = tokenService;
  }

  async execute({ email, password } = {}) {
    if (typeof email !== 'string' || typeof password !== 'string' || password.length === 0) {
      throw new ValidationError('email and password are required');
    }

    const user = await this.userRepository.findByEmail(normalizeEmail(email));

    // Same error for unknown user and wrong password: never reveal which one failed.
    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const matches = await this.passwordHasher.compare(password, user.passwordHash);

    if (!matches) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (!user.emailVerifiedAt) {
      throw new EmailNotVerifiedError();
    }

    const token = this.tokenService.sign({ sub: user.id, role: user.role, email: user.email });

    return { token, user: toPublicUser(user) };
  }
}

module.exports = { Login };
