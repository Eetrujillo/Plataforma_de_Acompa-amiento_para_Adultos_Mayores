'use strict';

const { normalizeFullName } = require('../../auth/domain/User');
const {
  InvalidFullNameError,
  InvalidPinError,
  InvalidTimeZoneError
} = require('../../../shared/errors');

/**
 * Senior profile rules (HU-005).
 *
 * The PIN is a secret with a tiny search space: ten thousand combinations. The hash
 * makes an offline attack expensive, but the real defence is the attempt limit applied
 * where the PIN is verified (HU-007). See `skills/bcrypt-pin.md`.
 */
const PIN_PATTERN = /^\d{4}$/;
const PIN_HASH_ROUNDS = 12;
const DEFAULT_TIMEZONE = 'America/Bogota';

const LINK_STATUS = Object.freeze({
  /** Profile created by the caregiver, waiting for the mobile app to be linked. */
  PENDING: 'PENDING',
  /** The senior device already proved it owns the account by redeeming a pairing code. */
  LINKED: 'LINKED'
});

function assertPin(pin) {
  if (typeof pin !== 'string' || !PIN_PATTERN.test(pin)) {
    throw new InvalidPinError();
  }

  return pin;
}

/**
 * Reuses the project normalizer and reports its failure as a profile field error, so the
 * caregiver screen can point at the name field instead of showing a generic 400.
 */
function resolveFullName(fullName) {
  try {
    return normalizeFullName(fullName);
  } catch {
    throw new InvalidFullNameError();
  }
}

function isValidTimeZone(timezone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Absent, null or blank means "use the project default". An explicit but invalid zone is
 * an error: silently storing Bogota for a caregiver in Lima would shift every routine.
 */
function resolveTimeZone(timezone) {
  if (timezone === undefined || timezone === null) {
    return DEFAULT_TIMEZONE;
  }

  if (typeof timezone !== 'string') {
    throw new InvalidTimeZoneError();
  }

  const candidate = timezone.trim();

  if (candidate === '') {
    return DEFAULT_TIMEZONE;
  }

  if (!isValidTimeZone(candidate)) {
    throw new InvalidTimeZoneError();
  }

  return candidate;
}

/**
 * Public projection of a senior profile. `pinHash` is deliberately absent: this shape is
 * the only one the HTTP layer returns, so a field added here is a field exposed.
 */
function toPublicSenior(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    fullName: user.fullName,
    timezone: user.timezone ?? DEFAULT_TIMEZONE,
    linkStatus: user.linkStatus ?? LINK_STATUS.PENDING,
    createdAt: user.createdAt ?? null
  };
}

module.exports = {
  DEFAULT_TIMEZONE,
  LINK_STATUS,
  PIN_HASH_ROUNDS,
  PIN_PATTERN,
  assertPin,
  isValidTimeZone,
  resolveFullName,
  resolveTimeZone,
  toPublicSenior
};
