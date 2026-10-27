const crypto = require('crypto');
const LinkAttempt = require('../models/LinkAttempt');

const MAX_LINK_ATTEMPTS = 5;
const LINK_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

function attemptKeyFor(req) {
  const ip = req.ip || req.socket?.remoteAddress || 'desconocido';
  return crypto.createHash('sha256').update(String(ip)).digest('hex');
}

async function getLinkAttemptLock({ key, now = new Date() }) {
  const record = await LinkAttempt.findOne({ key });

  if (!record) return { locked: false };

  if (record.lockedUntil && record.lockedUntil.getTime() > now.getTime()) {
    return {
      locked: true,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((record.lockedUntil.getTime() - now.getTime()) / 1000)
      ),
    };
  }

  if (record.lockedUntil && record.lockedUntil.getTime() <= now.getTime()) {
    await LinkAttempt.updateOne(
      { key },
      { $set: { attempts: 0, lockedUntil: null } }
    );
  }

  return { locked: false };
}

async function registerLinkFailure({ key, now = new Date() }) {
  const record = await LinkAttempt.findOneAndUpdate(
    { key },
    {
      $inc: { attempts: 1 },
      $set: { lastAttemptAt: now },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  if (record.attempts >= MAX_LINK_ATTEMPTS) {
    const lockedUntil = new Date(now.getTime() + LINK_ATTEMPT_WINDOW_MS);
    await LinkAttempt.updateOne(
      { key },
      { $set: { attempts: 0, lockedUntil } }
    );

    return {
      locked: true,
      retryAfterSeconds: Math.ceil(LINK_ATTEMPT_WINDOW_MS / 1000),
    };
  }

  return {
    locked: false,
    attemptsRemaining: MAX_LINK_ATTEMPTS - record.attempts,
  };
}

async function clearLinkAttempts(key) {
  await LinkAttempt.deleteOne({ key });
}

module.exports = {
  LINK_ATTEMPT_WINDOW_MS,
  MAX_LINK_ATTEMPTS,
  attemptKeyFor,
  clearLinkAttempts,
  getLinkAttemptLock,
  registerLinkFailure,
};
