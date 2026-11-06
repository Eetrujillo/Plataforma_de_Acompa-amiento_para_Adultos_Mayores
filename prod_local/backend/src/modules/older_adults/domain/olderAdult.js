'use strict';

const { ValidationError } = require('../../../shared/errors');

/**
 * HU-005: perfil del adulto mayor creado por el familiar.
 *
 * En el modelo de `prod` el adulto mayor es un `User` con rol `SENIOR` y
 * `caregiverId`. Este archivo valida los datos del formulario y define la forma
 * pública que consumen la web y la app móvil.
 */

const DEFAULT_TIME_ZONE = 'America/Bogota';
const PIN_PATTERN = /^\d{4}$/;
const TIME_ZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+\-/]*$/;

function fail(field, code, message) {
  throw new ValidationError(message, { field });
}

function normalizeName(name) {
  if (typeof name !== 'string') fail('name', 'OLDER_ADULT_NAME_REQUIRED', 'Ingresa el nombre de tu adulto mayor.');

  const normalized = name.trim().replace(/\s+/g, ' ');

  if (normalized.length < 2) {
    fail('name', 'OLDER_ADULT_NAME_TOO_SHORT', 'El nombre debe tener al menos 2 caracteres.');
  }

  if (normalized.length > 80) {
    fail('name', 'OLDER_ADULT_NAME_TOO_LONG', 'El nombre no puede superar los 80 caracteres.');
  }

  return normalized;
}

function normalizePin(pin, { required }) {
  if (pin === undefined || pin === null || pin === '') {
    if (required) fail('pin', 'OLDER_ADULT_PIN_REQUIRED', 'Ingresa el PIN de tu adulto mayor.');
    return null;
  }

  if (typeof pin !== 'string' || !PIN_PATTERN.test(pin.trim())) {
    fail('pin', 'OLDER_ADULT_PIN_INVALID', 'El PIN debe tener exactamente 4 números.');
  }

  return pin.trim();
}

function normalizeTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || timeZone.trim().length === 0) {
    fail('timeZone', 'OLDER_ADULT_TIMEZONE_REQUIRED', 'Selecciona una zona horaria válida.');
  }

  const normalized = timeZone.trim();

  if (!TIME_ZONE_PATTERN.test(normalized)) {
    fail('timeZone', 'OLDER_ADULT_TIMEZONE_INVALID', 'Selecciona una zona horaria válida.');
  }

  return normalized;
}

function toPublicOlderAdult(user) {
  if (!user) return null;

  return {
    _id: user.id,
    name: user.fullName,
    timeZone: user.timeZone || DEFAULT_TIME_ZONE,
    linkStatus: user.linkStatus || 'pending',
    pinConfigured: Boolean(user.pinHash),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

/** Perfil que ve la app del adulto mayor. */
function toAppProfile(user) {
  if (!user) return null;

  return {
    _id: user.id,
    name: user.fullName,
    timeZone: user.timeZone || DEFAULT_TIME_ZONE,
    linkStatus: user.linkStatus || 'pending',
    consent: user.consentAcceptedAt
      ? { version: user.consentVersion || '1.0', acceptedAt: user.consentAcceptedAt }
      : null
  };
}

/** Código de vinculación tal como lo pinta el familiar. */
function toLinkingCode({ code, expiresAt, qrDataUrl }) {
  return {
    code,
    expiresAt,
    qrPayload: `acompanamiento://vincular?codigo=${code}`,
    qrDataUrl
  };
}

module.exports = {
  DEFAULT_TIME_ZONE,
  normalizeName,
  normalizePin,
  normalizeTimeZone,
  toAppProfile,
  toLinkingCode,
  toPublicOlderAdult
};
