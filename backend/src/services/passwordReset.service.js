const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { sendPasswordResetEmail } = require('./email.service');

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const BCRYPT_COST = 12;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildPasswordResetUrl(token) {
  const baseUrl = (process.env.APP_URL || 'http://localhost:3201').replace(/\/+$/, '');
  return `${baseUrl}/restablecer-contrasena?token=${encodeURIComponent(token)}`;
}

/**
 * Genera un token nuevo, lo guarda hasheado y envía el enlace por correo.
 * El token anterior deja de ser válido porque se reemplaza el hash.
 */
async function issuePasswordResetEmail(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();

  // Operación atómica: el documento del usuario puede venir sin `password`
  // (`select: false` + obligatorio), así que `save()` fallaría su validación.
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordResetTokenHash: hashToken(token),
        passwordResetExpiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
      },
      $unset: { passwordResetTokenUsedAt: '' },
    }
  );

  try {
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl: buildPasswordResetUrl(token),
    });
  } catch (error) {
    // Si el envío falla, no dejamos un token activo que el usuario no recibió.
    await User.updateOne(
      { _id: user._id },
      {
        $unset: {
          passwordResetTokenHash: '',
          passwordResetExpiresAt: '',
          passwordResetTokenUsedAt: '',
        },
      }
    );
    throw error;
  }

  return { sent: true };
}

/**
 * Consume el token y cambia la contraseña en una sola operación atómica.
 * El filtro exige que el token exista, no esté usado y no haya vencido, por
 * lo que dos solicitudes simultáneas no pueden reutilizar el mismo enlace.
 */
async function consumePasswordResetToken(token, newPassword) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 256) {
    return { status: 'invalid' };
  }

  const tokenHash = hashToken(token);
  const now = new Date();
  const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_COST);

  const updated = await User.findOneAndUpdate(
    {
      passwordResetTokenHash: tokenHash,
      passwordResetTokenUsedAt: null,
      passwordResetExpiresAt: { $gt: now },
    },
    {
      $set: {
        password: hashedPassword,
        passwordResetTokenUsedAt: now,
        failedLoginAttempts: 0,
      },
      $unset: { loginLockedUntil: '' },
      $inc: { tokenVersion: 1 },
    },
    { new: true }
  );

  if (updated) {
    return { status: 'reset' };
  }

  const existing = await User.findOne({
    passwordResetTokenHash: tokenHash,
  }).select('+passwordResetExpiresAt +passwordResetTokenUsedAt');

  if (!existing) {
    return { status: 'invalid' };
  }

  if (existing.passwordResetTokenUsedAt) {
    return { status: 'used' };
  }

  if (
    !existing.passwordResetExpiresAt ||
    existing.passwordResetExpiresAt.getTime() <= now.getTime()
  ) {
    return { status: 'expired' };
  }

  return { status: 'invalid' };
}

module.exports = {
  PASSWORD_RESET_TTL_MS,
  buildPasswordResetUrl,
  consumePasswordResetToken,
  hashToken,
  issuePasswordResetEmail,
};
