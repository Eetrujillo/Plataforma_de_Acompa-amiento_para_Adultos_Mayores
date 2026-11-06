'use strict';

const { AppError, ValidationError } = require('../../../shared/errors');
const { assertPassword, normalizeEmail, ROLES } = require('../domain/User');
const {
  generateVerificationToken,
  hashToken,
  isTokenWellFormed,
  isTokenExpired
} = require('../domain/verificationToken');

const RESET_TTL_HOURS = 1;

/**
 * HU-004: recuperación de contraseña.
 *
 * La solicitud responde igual exista o no la cuenta, para no filtrar correos.
 * El enlace se envía con un token de un solo uso y vence en una hora.
 *
 * Ports: userRepository, resetRepository, emailSender, config
 */
class PasswordRecovery {
  constructor({ userRepository, resetRepository, emailSender, passwordHasher, config, logger = console }) {
    this.userRepository = userRepository;
    this.resetRepository = resetRepository;
    this.emailSender = emailSender;
    this.passwordHasher = passwordHasher;
    this.config = config;
    this.logger = logger;
  }

  async request({ email } = {}) {
    if (typeof email !== 'string' || email.trim().length === 0) {
      throw new ValidationError('El correo es obligatorio', { field: 'email' });
    }

    const normalized = normalizeEmail(email, {
      emailRequired: 'El correo es obligatorio',
      emailFormat: 'El correo no tiene un formato válido'
    });

    const user = await this.userRepository.findByEmail(normalized);

    if (user && user.role === ROLES.CAREGIVER) {
      const rawToken = generateVerificationToken();
      const expiresAt = new Date(Date.now() + RESET_TTL_HOURS * 60 * 60 * 1000);

      await this.resetRepository.invalidateForUser(user.id);
      await this.resetRepository.create({
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt
      });

      const link = `${this.config.appUrl}/restablecer-contrasena?token=${rawToken}`;

      await this.emailSender.sendPasswordResetEmail({
        to: user.email,
        fullName: user.fullName,
        link,
        expiresInHours: RESET_TTL_HOURS
      });
    }

    return {
      message:
        'Si el correo está registrado, te enviamos un enlace para definir una nueva contraseña.',
      code: 'RESET_EMAIL_SENT'
    };
  }

  async reset({ token, password } = {}) {
    if (!isTokenWellFormed(token)) {
      throw new AppError('El enlace no es válido. Solicita uno nuevo.', {
        statusCode: 400,
        code: 'RESET_TOKEN_INVALID'
      });
    }

    const record = await this.resetRepository.findByHash(hashToken(token));

    if (!record) {
      throw new AppError('El enlace no es válido. Solicita uno nuevo.', {
        statusCode: 400,
        code: 'RESET_TOKEN_INVALID'
      });
    }

    if (record.usedAt) {
      throw new AppError('Este enlace ya se usó. Solicita uno nuevo.', {
        statusCode: 400,
        code: 'RESET_TOKEN_USED'
      });
    }

    if (isTokenExpired(record.expiresAt)) {
      throw new AppError('El enlace venció. Solicita uno nuevo.', {
        statusCode: 400,
        code: 'RESET_TOKEN_EXPIRED'
      });
    }

    try {
      assertPassword(password);
    } catch {
      throw new AppError('La contraseña debe tener mínimo 8 caracteres, con letras y números.', {
        statusCode: 400,
        code: 'WEAK_PASSWORD',
        details: { field: 'password' }
      });
    }

    const user = await this.userRepository.findById(record.userId);

    if (!user) {
      throw new AppError('El enlace no es válido. Solicita uno nuevo.', {
        statusCode: 400,
        code: 'RESET_TOKEN_INVALID'
      });
    }

    const passwordHash = await this.passwordHasher.hash(password);

    await this.userRepository.updatePassword(user.id, passwordHash);
    await this.resetRepository.markUsed({ id: record.id });

    return {
      message: 'Tu contraseña fue actualizada. Inicia sesión con la nueva contraseña.',
      code: 'PASSWORD_RESET'
    };
  }
}

module.exports = { PasswordRecovery, RESET_TTL_HOURS };
