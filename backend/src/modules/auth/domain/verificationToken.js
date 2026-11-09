'use strict';

const { randomBytes, createHash } = require('node:crypto');

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const DEFAULT_TTL_HOURS = 24;

/**
 * Raw verification token: 32 random bytes as hex. Only the hash is persisted.
 */
function generateVerificationToken() {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

function hashToken(rawToken) {
  return createHash('sha256').update(rawToken).digest('hex');
}

function isTokenWellFormed(rawToken) {
  return typeof rawToken === 'string' && TOKEN_PATTERN.test(rawToken);
}

function isTokenExpired(expiresAt, now = new Date()) {
  const expiresAtTime = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();

  if (!Number.isFinite(expiresAtTime)) {
    return true;
  }

  return expiresAtTime <= now.getTime();
}

function computeTokenExpiration(now = new Date(), ttlHours = DEFAULT_TTL_HOURS) {
  return new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
}

function buildVerificationLink({ appUrl, rawToken }) {
  const base = String(appUrl ?? '').replace(/\/+$/, '');
  return `${base}/verify-email?token=${rawToken}`;
}

module.exports = {
  DEFAULT_TTL_HOURS,
  generateVerificationToken,
  hashToken,
  isTokenWellFormed,
  isTokenExpired,
  computeTokenExpiration,
  buildVerificationLink
};
