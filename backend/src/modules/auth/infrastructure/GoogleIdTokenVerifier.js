'use strict';

const { OAuth2Client } = require('google-auth-library');

/**
 * Google Identity Services adapter for the id_token verification port.
 *
 * Only the payload is returned: the caller decides what to do with the email
 * and the audience stays a verification concern, not a domain one.
 */
class GoogleIdTokenVerifier {
  constructor({ client } = {}) {
    this.client = client ?? new OAuth2Client();
  }

  async verify({ idToken, audience }) {
    const ticket = await this.client.verifyIdToken({ idToken, audience });
    const payload = ticket.getPayload() ?? {};

    return { email: payload.email, emailVerified: payload.email_verified === true };
  }
}

module.exports = { GoogleIdTokenVerifier };
