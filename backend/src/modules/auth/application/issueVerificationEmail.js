'use strict';

const {
  generateVerificationToken,
  hashToken,
  computeTokenExpiration,
  buildVerificationLink
} = require('../domain/verificationToken');

/**
 * Issues a fresh verification token for the user and delivers it by email.
 *
 * Previous tokens are invalidated first, so only the newest link works. A failed
 * delivery is logged, never fatal: the account already exists and the user can
 * ask for a new link.
 */
async function issueVerificationEmail({
  verificationRepository,
  emailSender,
  config,
  user,
  logger = console
}) {
  const rawToken = generateVerificationToken();
  const ttlHours = config.verification.ttlHours;

  await verificationRepository.invalidateForUser(user.id);

  await verificationRepository.create({
    userId: user.id,
    tokenHash: hashToken(rawToken),
    expiresAt: computeTokenExpiration(new Date(), ttlHours)
  });

  const link = buildVerificationLink({ appUrl: config.appUrl, rawToken });

  try {
    await emailSender.sendVerificationEmail({
      to: user.email,
      fullName: user.fullName,
      link,
      expiresInHours: ttlHours
    });

    return { sent: true };
  } catch (error) {
    logger.warn(`[auth] verification email delivery failed for ${user.email}: ${error.message}`);
    return { sent: false };
  }
}

module.exports = { issueVerificationEmail };
