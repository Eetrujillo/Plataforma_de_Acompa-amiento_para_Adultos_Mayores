'use strict';

const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

/**
 * Password hasher adapter (bcrypt).
 *
 * Infrastructure detail: the application layer only knows `hash` and `compare`.
 */
class BcryptPasswordHasher {
  async hash(plainPassword) {
    return bcrypt.hash(plainPassword, SALT_ROUNDS);
  }

  async compare(plainPassword, passwordHash) {
    return bcrypt.compare(plainPassword, passwordHash);
  }
}

module.exports = { BcryptPasswordHasher };
