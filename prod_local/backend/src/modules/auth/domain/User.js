'use strict';

const { randomUUID } = require('node:crypto');
const { ValidationError } = require('../../../shared/errors');

const ROLES = Object.freeze({ CAREGIVER: 'CAREGIVER', SENIOR: 'SENIOR' });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^[+\d][\d\s-]{5,19}$/;
const MIN_PASSWORD_LENGTH = 8;
const MIN_FULL_NAME_LENGTH = 3;
const DIGIT_PATTERN = /\d/;
const LETTER_PATTERN = /[a-z]/i;

/**
 * Validation texts per flow.
 *
 * The register screen renders the message as it arrives, so it needs Spanish.
 * Pairing and login reuse these functions with their own already published
 * wording: localizing one flow must never change the answers of the others.
 */
const MESSAGES = Object.freeze({
  emailRequired: 'email is required',
  emailFormat: 'email format is invalid',
  fullNameRequired: 'fullName is required',
  fullNameTooShort: (min) => `fullName must be at least ${min} characters`,
  phoneNotString: 'phone must be a string',
  phoneFormat: 'phone format is invalid'
});

const REGISTER_MESSAGES = Object.freeze({
  emailRequired: 'El correo es obligatorio',
  emailFormat: 'El correo no tiene un formato válido',
  fullNameRequired: 'El nombre completo es obligatorio',
  fullNameTooShort: (min) => `El nombre completo debe tener al menos ${min} caracteres`,
  phoneNotString: 'El teléfono debe ser texto',
  phoneFormat: 'El teléfono no tiene un formato válido'
});

function normalizeEmail(email, messages = MESSAGES) {
  if (typeof email !== 'string') {
    throw new ValidationError(messages.emailRequired);
  }

  const normalized = email.trim().toLowerCase();

  if (!EMAIL_PATTERN.test(normalized)) {
    throw new ValidationError(messages.emailFormat);
  }

  return normalized;
}

// Only the register flow checks password strength, so its text lives here.
function assertPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`
    );
  }

  if (!LETTER_PATTERN.test(password) || !DIGIT_PATTERN.test(password)) {
    throw new ValidationError('La contraseña debe combinar letras y números');
  }

  return password;
}

/**
 * Ley 1581 consent gate.
 *
 * Only an explicit boolean `true` counts: silence, a missing flag and a
 * pre-checked box are not consent (SIC, Ley 1581 art. 3 y 9).
 */
function assertTermsAcceptance(acceptedTerms) {
  if (acceptedTerms !== true) {
    throw new ValidationError(
      'Tenés que aceptar los términos y la política de tratamiento de datos personales'
    );
  }

  return true;
}

function normalizeFullName(fullName, messages = MESSAGES) {
  if (typeof fullName !== 'string') {
    throw new ValidationError(messages.fullNameRequired);
  }

  const normalized = fullName.trim().replace(/\s+/g, ' ');

  if (normalized.length < MIN_FULL_NAME_LENGTH) {
    throw new ValidationError(messages.fullNameTooShort(MIN_FULL_NAME_LENGTH));
  }

  return normalized;
}

function normalizePhone(phone, messages = MESSAGES) {
  if (phone === undefined || phone === null || phone === '') {
    return null;
  }

  if (typeof phone !== 'string') {
    throw new ValidationError(messages.phoneNotString);
  }

  const normalized = phone.trim();

  if (!PHONE_PATTERN.test(normalized)) {
    throw new ValidationError(messages.phoneFormat);
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
  constructor({
    id = null,
    email,
    passwordHash = null,
    fullName,
    role,
    phone = null,
    caregiverId = null,
    emailVerifiedAt = null,
    acceptedTermsAt = null,
    termsVersion = null,
    ipAddress = null,
    createdAt = null
  }) {
    this.id = id;
    this.email = email;
    this.passwordHash = passwordHash;
    this.fullName = fullName;
    this.role = role;
    this.phone = phone;
    this.caregiverId = caregiverId;
    this.emailVerifiedAt = emailVerifiedAt;
    this.acceptedTermsAt = acceptedTermsAt;
    this.termsVersion = termsVersion;
    this.ipAddress = ipAddress;
    this.createdAt = createdAt;
  }

  static registerCaregiver({
    email,
    password,
    fullName,
    phone,
    acceptedTerms,
    termsVersion,
    ipAddress = null,
    now = new Date()
  }) {
    assertPassword(password);
    assertTermsAcceptance(acceptedTerms);

    if (typeof termsVersion !== 'string' || termsVersion.length === 0) {
      throw new ValidationError('La versión de los términos es obligatoria');
    }

    return new User({
      email: normalizeEmail(email, REGISTER_MESSAGES),
      fullName: normalizeFullName(fullName, REGISTER_MESSAGES),
      phone: normalizePhone(phone, REGISTER_MESSAGES),
      role: ROLES.CAREGIVER,
      // Consent evidence is stamped here, never taken from the request body.
      acceptedTermsAt: now,
      termsVersion,
      ipAddress
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
    // Compatibilidad con la versión anterior de la web y con la app móvil:
    // ambos clientes leen `_id`, `name` y `emailVerified`.
    _id: user.id,
    email: user.email,
    fullName: user.fullName,
    name: user.fullName,
    role: user.role,
    phone: user.phone ?? null,
    caregiverId: user.caregiverId ?? null,
    emailVerified: Boolean(user.emailVerifiedAt),
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    privacyPolicy: user.acceptedTermsAt
      ? { version: user.termsVersion ?? '1.0', acceptedAt: user.acceptedTermsAt }
      : undefined,
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
  assertTermsAcceptance,
  MIN_PASSWORD_LENGTH
};
