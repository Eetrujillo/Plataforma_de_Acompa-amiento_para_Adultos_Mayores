const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const OlderAdult = require('../models/OlderAdult');
const { CONSENT_VERSION } = require('../constants/consent');
const {
  clearLinkAttempts,
  getLinkAttemptLock,
  registerLinkFailure,
} = require('./linkAttempt.service');

const DEFAULT_TIME_ZONE = 'America/Bogota';
const PIN_REGEX = /^\d{4}$/;
const APP_SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MS = 5 * 60 * 1000;

const LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LINK_CODE_LENGTH = 8;
const LINK_CODE_TTL_MS = 24 * 60 * 60 * 1000;
const LINK_CODE_REGEX = /^[A-HJ-NP-Z2-9]{8}$/;
const LINK_CODE_SELECT =
  '+linkCodeHash +linkCodeCreatedAt +linkCodeExpiresAt +linkCodeUsedAt';
const LINK_QR_BASE_URL = process.env.LINK_QR_BASE_URL || 'acompanamiento://vincular';

const MESSAGES = {
  nameRequired: 'Ingresa el nombre de tu adulto mayor.',
  nameTooShort: 'El nombre debe tener al menos 2 caracteres.',
  nameTooLong: 'El nombre no puede superar los 80 caracteres.',
  pinRequired: 'Ingresa el PIN de tu adulto mayor.',
  pinInvalid: 'El PIN debe tener exactamente 4 números.',
  timeZoneInvalid: 'Selecciona una zona horaria válida.',
  linkCodeRequired: 'Ingresa el código de vinculación.',
  linkCodeInvalid: 'El código de vinculación no es válido.',
  linkCodeExpired: 'El código de vinculación venció. Genera uno nuevo.',
  linkCodeUsed: 'Este código ya fue usado. Genera uno nuevo.',
  olderAdultAlreadyLinked: 'Este adulto mayor ya está vinculado.',
  linkCodeGenerated: 'Código de vinculación generado. Compártelo con tu adulto mayor.',
  linkCodeRedeemed: 'Código de vinculación aceptado. El adulto mayor quedó vinculado.',
};

function isValidTimeZone(value) {
  if (typeof value !== 'string' || !value.trim()) return false;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

function normalizeName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePin(value) {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }

  return '';
}

function normalizeTimeZone(value, fallback = DEFAULT_TIME_ZONE) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || fallback;
}

function generateLinkCode() {
  let code = '';

  for (let index = 0; index < LINK_CODE_LENGTH; index += 1) {
    code += LINK_CODE_ALPHABET[crypto.randomInt(0, LINK_CODE_ALPHABET.length)];
  }

  return code;
}

function normalizeLinkCode(value) {
  if (typeof value !== 'string') return '';
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function displayLinkCode(normalizedCode) {
  return `${normalizedCode.slice(0, 4)}-${normalizedCode.slice(4)}`;
}

function hashLinkCode(normalizedCode) {
  return crypto.createHash('sha256').update(normalizedCode).digest('hex');
}

function buildLinkQrPayload(displayCode) {
  const separator = LINK_QR_BASE_URL.includes('?') ? '&' : '?';
  return `${LINK_QR_BASE_URL}${separator}codigo=${encodeURIComponent(displayCode)}`;
}

function buildQrDataUrl(payload) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    color: {
      dark: '#1f3a5f',
      light: '#ffffff',
    },
  });
}

function isExpired(expiresAt, now) {
  return !expiresAt || new Date(expiresAt).getTime() <= now.getTime();
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function validationError(field, code, message) {
  return { status: 'invalid', field, code, message };
}

function validateName(name) {
  if (!name) return validationError('name', 'NAME_REQUIRED', MESSAGES.nameRequired);
  if (name.length < 2) return validationError('name', 'NAME_TOO_SHORT', MESSAGES.nameTooShort);
  if (name.length > 80) return validationError('name', 'NAME_TOO_LONG', MESSAGES.nameTooLong);
  return null;
}

function validatePin(pin, { required }) {
  if (!pin) {
    return required ? validationError('pin', 'PIN_REQUIRED', MESSAGES.pinRequired) : null;
  }

  if (!PIN_REGEX.test(pin)) {
    return validationError('pin', 'PIN_INVALID', MESSAGES.pinInvalid);
  }

  return null;
}

function validateTimeZone(timeZone) {
  if (!isValidTimeZone(timeZone)) {
    return validationError('timeZone', 'TIME_ZONE_INVALID', MESSAGES.timeZoneInvalid);
  }
  return null;
}

function publicOlderAdult(olderAdult) {
  return {
    _id: olderAdult._id,
    name: olderAdult.name,
    timeZone: olderAdult.timeZone,
    linkStatus: olderAdult.linkStatus,
    pinConfigured: true,
    createdAt: olderAdult.createdAt,
    updatedAt: olderAdult.updatedAt,
  };
}

function appPublicOlderAdult(olderAdult) {
  return {
    _id: olderAdult._id,
    name: olderAdult.name,
    timeZone: olderAdult.timeZone,
    linkStatus: olderAdult.linkStatus,
    consent: olderAdult.consent?.version
      ? {
          version: olderAdult.consent.version,
          acceptedAt: olderAdult.consent.acceptedAt,
        }
      : null,
  };
}

async function createOlderAdult({ familiarId, name, pin, timeZone }) {
  const normalizedName = normalizeName(name);
  const normalizedPin = normalizePin(pin);
  const normalizedTimeZone = normalizeTimeZone(timeZone);

  const error =
    validateName(normalizedName) ||
    validatePin(normalizedPin, { required: true }) ||
    validateTimeZone(normalizedTimeZone);

  if (error) return error;

  const pinHash = await bcrypt.hash(normalizedPin, 12);
  const olderAdult = await OlderAdult.create({
    familiar: familiarId,
    name: normalizedName,
    pinHash,
    timeZone: normalizedTimeZone,
    linkStatus: 'pending',
  });

  return { status: 'created', olderAdult: publicOlderAdult(olderAdult) };
}

async function listOlderAdults(familiarId) {
  const olderAdults = await OlderAdult.find({ familiar: familiarId }).sort({ createdAt: -1 });
  return olderAdults.map(publicOlderAdult);
}

async function getOlderAdult({ familiarId, id }) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;

  const olderAdult = await OlderAdult.findOne({ _id: id, familiar: familiarId });
  return olderAdult ? publicOlderAdult(olderAdult) : null;
}

async function updateOlderAdult({ familiarId, id, name, pin, timeZone }) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { status: 'not_found' };
  }

  const olderAdult = await OlderAdult.findOne({
    _id: id,
    familiar: familiarId,
  }).select('+pinHash');
  if (!olderAdult) {
    return { status: 'not_found' };
  }

  const normalizedName = normalizeName(name);
  const normalizedPin = normalizePin(pin);
  const normalizedTimeZone = normalizeTimeZone(timeZone, olderAdult.timeZone);

  const error =
    validateName(normalizedName) ||
    validatePin(normalizedPin, { required: false }) ||
    validateTimeZone(normalizedTimeZone);

  if (error) return error;

  olderAdult.name = normalizedName;
  olderAdult.timeZone = normalizedTimeZone;

  if (normalizedPin) {
    olderAdult.pinHash = await bcrypt.hash(normalizedPin, 12);
  }

  await olderAdult.save();

  return { status: 'updated', olderAdult: publicOlderAdult(olderAdult) };
}

async function generateLinkingCode({ familiarId, id, now = new Date() }) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { status: 'not_found' };
  }

  const olderAdult = await OlderAdult.findOne({ _id: id, familiar: familiarId }).select(
    '+pinHash'
  );
  if (!olderAdult) {
    return { status: 'not_found' };
  }

  if (olderAdult.linkStatus === 'linked') {
    return { status: 'already_linked' };
  }

  const normalizedCode = generateLinkCode();
  const displayCode = displayLinkCode(normalizedCode);
  const qrPayload = buildLinkQrPayload(displayCode);
  const qrDataUrl = await buildQrDataUrl(qrPayload);
  const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MS);

  olderAdult.linkCodeHash = hashLinkCode(normalizedCode);
  olderAdult.linkCodeCreatedAt = now;
  olderAdult.linkCodeExpiresAt = expiresAt;
  olderAdult.linkCodeUsedAt = null;

  await olderAdult.save();

  return {
    status: 'generated',
    linkingCode: {
      code: displayCode,
      expiresAt: expiresAt.toISOString(),
      qrPayload,
      qrDataUrl,
    },
    olderAdult: publicOlderAdult(olderAdult),
  };
}

async function redeemLinkingCode({
  code,
  consentAccepted = false,
  consentVersion,
  attemptKey,
  now = new Date(),
}) {
  if (attemptKey) {
    const lock = await getLinkAttemptLock({ key: attemptKey, now });

    if (lock.locked) {
      return {
        status: 'locked',
        retryAfterSeconds: lock.retryAfterSeconds,
      };
    }
  }

  async function fail(status) {
    if (!attemptKey) return { status };

    const failure = await registerLinkFailure({ key: attemptKey, now });

    if (failure.locked) {
      return {
        status: 'locked',
        retryAfterSeconds: failure.retryAfterSeconds,
      };
    }

    return {
      status,
      attemptsRemaining: failure.attemptsRemaining,
    };
  }

  const normalizedCode = normalizeLinkCode(code);

  if (!normalizedCode) {
    const wasEmpty =
      code === undefined || code === null || (typeof code === 'string' && !code.trim());
    return { status: wasEmpty ? 'missing' : 'invalid' };
  }

  if (!LINK_CODE_REGEX.test(normalizedCode)) {
    return fail('invalid');
  }

  const linkCodeHash = hashLinkCode(normalizedCode);
  const olderAdult = await OlderAdult.findOne({ linkCodeHash }).select(LINK_CODE_SELECT);

  if (!olderAdult) {
    return fail('invalid');
  }

  if (olderAdult.linkCodeUsedAt || olderAdult.linkStatus === 'linked') {
    return fail('used');
  }

  if (isExpired(olderAdult.linkCodeExpiresAt, now)) {
    return fail('expired');
  }

  if (!consentAccepted) {
    return { status: 'consent_required' };
  }

  if (consentVersion !== CONSENT_VERSION) {
    return { status: 'consent_version_mismatch' };
  }

  const sessionToken = generateSessionToken();
  const sessionHash = hashSessionToken(sessionToken);
  const sessionExpiresAt = new Date(now.getTime() + APP_SESSION_TTL_MS);
  const consent = {
    version: CONSENT_VERSION,
    acceptedAt: now,
  };

  const consumed = await OlderAdult.findOneAndUpdate(
    {
      _id: olderAdult._id,
      linkCodeHash,
      linkCodeUsedAt: null,
      linkStatus: 'pending',
      linkCodeExpiresAt: { $gt: now },
    },
    {
      $set: {
        linkStatus: 'linked',
        linkedAt: now,
        linkCodeUsedAt: now,
        consent,
        appSessionHash: sessionHash,
        appSessionCreatedAt: now,
        appSessionLastSeenAt: now,
        appSessionExpiresAt: sessionExpiresAt,
      },
    },
    { new: true }
  );

  if (!consumed) {
    const current = await OlderAdult.findOne({ _id: olderAdult._id }).select(LINK_CODE_SELECT);

    if (current && (current.linkCodeUsedAt || current.linkStatus === 'linked')) {
      return fail('used');
    }

    if (current && isExpired(current.linkCodeExpiresAt, now)) {
      return fail('expired');
    }

    return fail('invalid');
  }

  if (attemptKey) {
    await clearLinkAttempts(attemptKey);
  }

  return {
    status: 'linked',
    olderAdult: appPublicOlderAdult(consumed),
    sessionToken,
    consent,
  };
}

async function unlinkOlderAdult({ familiarId, id }) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { status: 'not_found' };
  }

  const olderAdult = await OlderAdult.findOne({ _id: id, familiar: familiarId });
  if (!olderAdult) {
    return { status: 'not_found' };
  }

  if (olderAdult.linkStatus !== 'linked') {
    return { status: 'not_linked' };
  }

  await OlderAdult.updateOne(
    { _id: olderAdult._id, familiar: familiarId, linkStatus: 'linked' },
    {
      $set: {
        linkStatus: 'pending',
        linkedAt: null,
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      },
      $unset: {
        linkCodeHash: 1,
        linkCodeCreatedAt: 1,
        linkCodeExpiresAt: 1,
        linkCodeUsedAt: 1,
        appSessionHash: 1,
        appSessionCreatedAt: 1,
        appSessionLastSeenAt: 1,
        appSessionExpiresAt: 1,
        consent: 1,
      },
    }
  );

  const updated = await OlderAdult.findOne({ _id: olderAdult._id, familiar: familiarId });
  return { status: 'unlinked', olderAdult: publicOlderAdult(updated) };
}

module.exports = {
  APP_SESSION_TTL_MS,
  DEFAULT_TIME_ZONE,
  LINK_CODE_ALPHABET,
  LINK_CODE_LENGTH,
  LINK_CODE_REGEX,
  LINK_CODE_TTL_MS,
  MESSAGES,
  PIN_LOCK_MS,
  PIN_MAX_ATTEMPTS,
  PIN_REGEX,
  appPublicOlderAdult,
  buildLinkQrPayload,
  createOlderAdult,
  generateLinkCode,
  generateLinkingCode,
  generateSessionToken,
  getOlderAdult,
  hashLinkCode,
  hashSessionToken,
  isValidTimeZone,
  listOlderAdults,
  normalizeLinkCode,
  publicOlderAdult,
  redeemLinkingCode,
  unlinkOlderAdult,
  updateOlderAdult,
};
