const crypto = require('crypto');
const User = require('../models/User');
const { sendVerificationEmail } = require('./email.service');

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_WINDOW_MS = 60 * 60 * 1000;
const MAX_RESENDS_PER_WINDOW = 3;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildVerificationUrl(token) {
  const baseUrl = (process.env.APP_URL || 'http://localhost:3201').replace(/\/+$/, '');
  return `${baseUrl}/confirmar-correo?token=${encodeURIComponent(token)}`;
}

function recentRequests(user, now = new Date()) {
  const cutoff = now.getTime() - RESEND_WINDOW_MS;

  return (user.emailVerificationRequests || [])
    .map((date) => new Date(date))
    .filter((date) => date.getTime() > cutoff);
}

function getResendWaitSeconds(user, now = new Date()) {
  const recent = recentRequests(user, now);
  if (recent.length < MAX_RESENDS_PER_WINDOW) return 0;

  const oldest = Math.min(...recent.map((date) => date.getTime()));
  return Math.max(1, Math.ceil((oldest + RESEND_WINDOW_MS - now.getTime()) / 1000));
}

/**
 * Genera un token nuevo, lo guarda hasheado y envía el enlace por correo.
 * `countRequest` se usa sólo para reenvíos: el correo inicial no consume
 * el límite de 3 reenvíos por hora.
 */
async function issueVerificationEmail(user, { countRequest = false } = {}) {
  const now = new Date();

  if (user.emailVerified) {
    return { sent: false, alreadyVerified: true, retryAfterSeconds: 0 };
  }

  const recent = recentRequests(user, now);

  if (countRequest && recent.length >= MAX_RESENDS_PER_WINDOW) {
    return {
      sent: false,
      rateLimited: true,
      retryAfterSeconds: getResendWaitSeconds(user, now),
    };
  }

  const token = crypto.randomBytes(32).toString('hex');
  const verificationUrl = buildVerificationUrl(token);

  // Se actualiza con una operación atómica para no depender de que el
  // documento tenga cargado el campo `password` (que es `select: false` y
  // obligatorio, por lo que `save()` fallaría en una validación completa).
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        emailVerificationTokenHash: hashToken(token),
        emailVerificationExpiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
        emailVerificationRequests: countRequest ? [...recent, now] : recent,
      },
      $unset: { emailVerificationTokenUsedAt: '' },
    }
  );

  try {
    await sendVerificationEmail({
      to: user.email,
      name: user.name,
      verificationUrl,
    });
  } catch (error) {
    // Si el envío falla, no dejamos un token activo ni consumimos un reenvío.
    await User.updateOne(
      { _id: user._id },
      {
        $set: { emailVerificationRequests: recent },
        $unset: {
          emailVerificationTokenHash: '',
          emailVerificationExpiresAt: '',
          emailVerificationTokenUsedAt: '',
        },
      }
    );
    throw error;
  }

  return { sent: true, retryAfterSeconds: 0 };
}

async function verifyEmailToken(token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 256) {
    return { status: 'invalid' };
  }

  const tokenHash = hashToken(token);
  const now = new Date();

  // La actualización condicional consume el token de forma atómica y evita
  // `save()` sobre un documento sin `password`, que fallaría la validación.
  const user = await User.findOneAndUpdate(
    {
      emailVerificationTokenHash: tokenHash,
      emailVerified: { $ne: true },
      emailVerificationExpiresAt: { $gt: now },
    },
    {
      $set: {
        emailVerified: true,
        emailVerifiedAt: now,
        emailVerificationTokenUsedAt: now,
      },
      $unset: { emailVerificationExpiresAt: '' },
    },
    { new: true }
  );

  if (user) {
    return { status: 'verified', user };
  }

  const existing = await User.findOne({
    emailVerificationTokenHash: tokenHash,
  }).select('+emailVerificationExpiresAt +emailVerificationTokenUsedAt');

  if (!existing) {
    return { status: 'invalid' };
  }

  if (existing.emailVerified) {
    return { status: 'already_used', user: existing };
  }

  if (
    !existing.emailVerificationExpiresAt ||
    existing.emailVerificationExpiresAt.getTime() <= now.getTime()
  ) {
    return { status: 'expired', user: existing };
  }

  return { status: 'invalid' };
}

module.exports = {
  MAX_RESENDS_PER_WINDOW,
  RESEND_WINDOW_MS,
  TOKEN_TTL_MS,
  buildVerificationUrl,
  getResendWaitSeconds,
  hashToken,
  issueVerificationEmail,
  recentRequests,
  verifyEmailToken,
};
