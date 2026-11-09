'use strict';

const { sessionClaims } = require('../../../shared/session/sessionVersion');
const { normalizeEmail, toPublicUser } = require('../domain/User');
const {
  LOCKOUT_MESSAGE,
  CLEARED_LOCK_STATE,
  failedAttemptsOf,
  isLocked,
  remainingLockSeconds,
  nextFailureState,
  resolvePolicy
} = require('../domain/loginLockout');
const {
  UnauthorizedError,
  ValidationError,
  EmailNotVerifiedError,
  AccountLockedError
} = require('../../../shared/errors');

/**
 * Authenticates a user and issues a JWT.
 *
 * After `maxAttempts` consecutive wrong passwords the account is locked for
 * `lockMinutes`: while the lock lasts, even the right password is refused, because a
 * lockout that the correct password can bypass is not a lockout.
 *
 * Ports: userRepository, passwordHasher, tokenService
 */
class Login {
  constructor({ userRepository, passwordHasher, tokenService, config, now = () => Date.now() }) {
    this.userRepository = userRepository;
    this.passwordHasher = passwordHasher;
    this.tokenService = tokenService;
    this.config = config;
    this.now = now;
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

    const now = this.now();
    const policy = resolvePolicy(this.config);
    let attempts = failedAttemptsOf(user);

    // An expired lock is cleaned on the next attempt instead of needing a scheduler:
    // the counter must not survive the window it belonged to.
    if (user.lockedUntil && !isLocked(user, now)) {
      await this.userRepository.updateLoginLock(user.id, CLEARED_LOCK_STATE);
      attempts = 0;
    }

    if (isLocked(user, now)) {
      throw new AccountLockedError(LOCKOUT_MESSAGE, {
        retryAfterSeconds: remainingLockSeconds(user, now)
      });
    }

    const matches = await this.passwordHasher.compare(password, user.passwordHash);

    if (!matches) {
      const next = nextFailureState({ attempts, now, policy });

      await this.userRepository.updateLoginLock(user.id, {
        failedLoginAttempts: next.attempts,
        lockedUntil: next.lockedUntil
      });

      if (next.locked) {
        throw new AccountLockedError(LOCKOUT_MESSAGE, {
          retryAfterSeconds: policy.lockMinutes * 60
        });
      }

      throw new UnauthorizedError('Invalid credentials');
    }

    if (!user.emailVerifiedAt) {
      throw new EmailNotVerifiedError();
    }

    if (attempts > 0) {
      await this.userRepository.updateLoginLock(user.id, CLEARED_LOCK_STATE);
    }

    const token = this.tokenService.sign(sessionClaims(user));

    return { token, user: toPublicUser(user) };
  }
}

module.exports = { Login };
