'use strict';

const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../../../shared/errors');

/**
 * JWT token adapter.
 *
 * Infrastructure detail: the application layer only knows `sign` and `verify`.
 */
class JwtTokenService {
  constructor({ secret, expiresIn }) {
    this.secret = secret;
    this.expiresIn = expiresIn;
  }

  sign(payload) {
    return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn, algorithm: 'HS256' });
  }

  verify(token) {
    try {
      return jwt.verify(token, this.secret, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }
  }
}

module.exports = { JwtTokenService };
