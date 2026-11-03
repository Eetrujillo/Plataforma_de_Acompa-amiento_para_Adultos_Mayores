'use strict';

const { randomUUID } = require('node:crypto');
const { ValidationError } = require('../../../shared/errors');

const ROLES = Object.freeze({ CAREGIVER: 'CAREGIVER', SENIOR: 'SENIOR' });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^[+\d][\d\s-]{5,19}$/;
const MIN_PASSWORD_LENGTH = 8;
const MIN_FULL_NAME_LENGTH = 3;

function normalizeEmail(email) {
  if (typeof email !== 'string') {
    throw new ValidationError('email is required');
  }

  const normalized = email.trim().toLowerCase();

  if (!EMAIL_PATTERN.test(normalized)) {
    throw new ValidationError('email format is invalid');
  }

  return normalized;
}

function assertPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  return password;
}

function normalizeFullName(fullName) {
  if (typeof fullName !== 'string') {
    throw new ValidationError('fullName is required');
  }

  const normalized = fullName.trim().replace(/\s+/g, ' ');

  if (normalized.length < MIN_FULL_NAME_LENGTH) {
    throw new ValidationError(`fullName must be at least ${MIN_FULL_NAME_LENGTH} characters`);
  }

  return normalized;
}

function normalizePhone(phone) {
  if (phone === undefined || phone === null || phone === '') {
    return null;
  }

  if (typeof phone !== 'string') {
    throw new ValidationError('phone must be a string');
  }

  const normalized = phone.trim();

  if (!PHONE_PATTERN.test(normalized)) {
    throw new ValidationError('phone format is invalid');
  }

  return normalized;
}

/**
 * User aggregate.
 *
 * Invariants live here, so both the register and the pairing flows validate
 * identity data the same way.
 */
class User {
  constructor({ id = null, email, passwordHash = null, fullName, role, phone = null, caregiverId = null, emailVerifiedAt = null, createdAt = null }) {
    this.id = id;
    this.email = email;
    this.passwordHash = passwordHash;
    this.fullName = fullName;
    this.role = role;
    this.phone = phone;
    this.caregiverId = caregiverId;
    this.emailVerifiedAt = emailVerifiedAt;
    this.createdAt = createdAt;
  }

  static registerCaregiver({ email, password, fullName, phone }) {
    assertPassword(password);

    return new User({
      email: normalizeEmail(email),
      fullName: normalizeFullName(fullName),
      phone: normalizePhone(phone),
      role: ROLES.CAREGIVER
    });
  }

  static createSenior({ fullName, phone, caregiverId }) {
    if (typeof caregiverId !== 'string' || caregiverId.length === 0) {
      throw new ValidationError('caregiverId is required');
    }

    return new User({
      // Seniors have no mailbox of their own: a synthetic unique address keeps the
      // unique index honest until a real one is captured during onboarding.
      email: `senior+${randomUUID().slice(0, 12)}@seniors.local`,
      fullName: normalizeFullName(fullName),
      phone: normalizePhone(phone),
      role: ROLES.SENIOR,
      caregiverId,
      // Seniors have no mailbox: pairing is their credential, so they are verified on creation.
      emailVerifiedAt: new Date()
    });
  }

  isEmailVerified() {
    return this.emailVerifiedAt instanceof Date || typeof this.emailVerifiedAt === 'string';
  }

  isCaregiver() {
    return this.role === ROLES.CAREGIVER;
  }

  isSenior() {
    return this.role === ROLES.SENIOR;
  }
}

function toPublicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    phone: user.phone ?? null,
    caregiverId: user.caregiverId ?? null,
    emailVerified: Boolean(user.emailVerifiedAt),
    createdAt: user.createdAt ?? null
  };
}

module.exports = {
  User,
  ROLES,
  toPublicUser,
  normalizeEmail,
  normalizeFullName,
  normalizePhone,
  assertPassword,
  MIN_PASSWORD_LENGTH
};
