'use strict';

const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

/**
 * Password hasher adapter (bcrypt).
 *
 * Infrastructure detail: the application layer only knows `hash` and `compare`.
 *
 * The cost is configurable because a 4 digit PIN (HU-005) has ten thousand combinations
 * and needs a higher cost than a password to make an offline attack expensive.
 */
class BcryptPasswordHasher {
  constructor({ saltRounds = SALT_ROUNDS } = {}) {
    this.saltRounds = saltRounds;
  }

  async hash(plainPassword) {
    return bcrypt.hash(plainPassword, this.saltRounds);
  }

  async compare(plainPassword, passwordHash) {
    return bcrypt.compare(plainPassword, passwordHash);
  }
}

module.exports = { BcryptPasswordHasher };
