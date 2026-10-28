const bcrypt = require('bcryptjs');
const OlderAdult = require('../models/OlderAdult');
const { CONSENT_VERSION } = require('../constants/consent');
const {
  PIN_LOCK_MS,
  PIN_MAX_ATTEMPTS,
  PIN_REGEX,
  hashSessionToken,
} = require('./olderAdult.service');

const SESSION_SELECT =
  '+appSessionHash +appSessionCreatedAt +appSessionLastSeenAt +appSessionExpiresAt ' +
  '+pinHash +pinFailedAttempts +pinLockedUntil';

function consentState(olderAdult) {
  const acceptedVersion = olderAdult.consent?.version || null;

  return {
    currentVersion: CONSENT_VERSION,
    acceptedVersion,
    required: acceptedVersion !== CONSENT_VERSION,
  };
}

async function revokeAppAccess(olderAdultId) {
  await OlderAdult.updateOne(
    { _id: olderAdultId },
    {
      $set: {
        linkStatus: 'pending',
        linkedAt: null,
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      },
      $unset: {
        appSessionHash: 1,
        appSessionCreatedAt: 1,
        appSessionLastSeenAt: 1,
        appSessionExpiresAt: 1,
        consent: 1,
        linkCodeHash: 1,
        linkCodeCreatedAt: 1,
        linkCodeExpiresAt: 1,
        linkCodeUsedAt: 1,
      },
    }
  );
}

async function getOlderAdultSession({ token, now = new Date() }) {
  if (!token) return { status: 'missing' };

  const olderAdult = await OlderAdult.findOne({
    appSessionHash: hashSessionToken(token),
    linkStatus: 'linked',
  }).select(SESSION_SELECT);

  if (!olderAdult) return { status: 'invalid' };

  if (!olderAdult.appSessionExpiresAt || olderAdult.appSessionExpiresAt <= now) {
    await revokeAppAccess(olderAdult._id);
    return { status: 'expired' };
  }

  await OlderAdult.updateOne(
    { _id: olderAdult._id },
    { $set: { appSessionLastSeenAt: now } }
  );
  olderAdult.appSessionLastSeenAt = now;

  return { status: 'active', olderAdult };
}

async function acceptOlderAdultConsent({
  olderAdult,
  consentVersion,
  accepted,
  now = new Date(),
}) {
  if (!accepted) return { status: 'rejected' };

  if (consentVersion !== CONSENT_VERSION) {
    return { status: 'version_mismatch' };
  }

  const consent = {
    version: CONSENT_VERSION,
    acceptedAt: now,
  };

  await OlderAdult.updateOne(
    { _id: olderAdult._id },
    { $set: { consent } }
  );

  olderAdult.consent = consent;
  return { status: 'accepted', consent };
}

async function logoutOlderAdultWithPin({ olderAdult, pin, now = new Date() }) {
  if (olderAdult.pinLockedUntil && olderAdult.pinLockedUntil.getTime() > now.getTime()) {
    return {
      status: 'locked',
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((olderAdult.pinLockedUntil.getTime() - now.getTime()) / 1000)
      ),
    };
  }

  if (olderAdult.pinLockedUntil && olderAdult.pinLockedUntil.getTime() <= now.getTime()) {
    olderAdult.pinFailedAttempts = 0;
    olderAdult.pinLockedUntil = null;
  }

  const normalizedPin =
    typeof pin === 'string' || typeof pin === 'number' ? String(pin).trim() : '';
  const matches = PIN_REGEX.test(normalizedPin)
    ? await bcrypt.compare(normalizedPin, olderAdult.pinHash)
    : false;

  if (!matches) {
    const attempts = Number(olderAdult.pinFailedAttempts || 0) + 1;

    if (attempts >= PIN_MAX_ATTEMPTS) {
      const lockedUntil = new Date(now.getTime() + PIN_LOCK_MS);

      await OlderAdult.updateOne(
        { _id: olderAdult._id },
        { $set: { pinFailedAttempts: 0, pinLockedUntil: lockedUntil } }
      );

      return {
        status: 'locked',
        retryAfterSeconds: Math.ceil(PIN_LOCK_MS / 1000),
      };
    }

    await OlderAdult.updateOne(
      { _id: olderAdult._id },
      { $set: { pinFailedAttempts: attempts, pinLockedUntil: null } }
    );

    return {
      status: 'invalid_pin',
      attemptsRemaining: PIN_MAX_ATTEMPTS - attempts,
    };
  }

  await revokeAppAccess(olderAdult._id);

  return { status: 'logged_out' };
}

module.exports = {
  SESSION_SELECT,
  acceptOlderAdultConsent,
  consentState,
  getOlderAdultSession,
  logoutOlderAdultWithPin,
  revokeAppAccess,
};
