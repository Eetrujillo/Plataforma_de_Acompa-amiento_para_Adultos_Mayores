'use strict';

const { normalizeEmail, toPublicUser } = require('../domain/User');
const {
  UnauthorizedError,
  ValidationError,
  EmailNotRegisteredError,
  GoogleNotConfiguredError
} = require('../../../shared/errors');

/**
 * Authenticates an existing account with a Google Identity Services id_token.
 *
 * Ports: userRepository, tokenService, idTokenVerifier
 *
 * Google only proves the email; it never creates accounts and never resets a
 * password. The verifier lives behind a port so tests never hit the network.
 */
class LoginWithGoogle {
  constructor({ userRepository, tokenService, idTokenVerifier, config }) {
    this.userRepository = userRepository;
    this.tokenService = tokenService;
    this.idTokenVerifier = idTokenVerifier;
    this.config = config;
  }

  async execute({ idToken } = {}) {
    if (typeof idToken !== 'string' || idToken.trim().length === 0) {
      throw new ValidationError('Falta el token de Google');
    }

    const clientId = this.config?.google?.clientId || '';

    if (clientId.length === 0) {
      throw new GoogleNotConfiguredError();
    }

    let identity;

    try {
      identity = await this.idTokenVerifier.verify({ idToken, audience: clientId });
    } catch {
      // Never forward the library error: it names internals and the audience.
      throw new UnauthorizedError('No se pudo validar el token de Google');
    }

    const email = typeof identity?.email === 'string' ? identity.email.trim() : '';

    // A token whose mailbox Google has not certified cannot prove anything: the
    // account gets no session and, above all, is not marked as verified (S10).
    if (email.length === 0 || identity.emailVerified === false) {
      throw new UnauthorizedError('No se pudo validar el token de Google');
    }

    let normalizedEmail;

    try {
      normalizedEmail = normalizeEmail(email);
    } catch {
      throw new UnauthorizedError('No se pudo validar el token de Google');
    }

    const user = await this.userRepository.findByEmail(normalizedEmail);

    if (!user) {
      throw new EmailNotRegisteredError();
    }

    // Google already certified ownership of the mailbox (S10).
    const verifiedUser = user.emailVerifiedAt
      ? user
      : (await this.userRepository.markEmailVerified(user.id)) ?? {
          ...user,
          emailVerifiedAt: new Date()
        };

    const token = this.tokenService.sign({
      sub: verifiedUser.id,
      role: verifiedUser.role,
      email: verifiedUser.email
    });

    return { token, user: toPublicUser(verifiedUser) };
  }
}

module.exports = { LoginWithGoogle };
