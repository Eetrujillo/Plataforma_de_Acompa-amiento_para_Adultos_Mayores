'use strict';

const { normalizeEmail } = require('../domain/User');
const {
  generateVerificationToken,
  hashToken,
  computeResetExpiration,
  buildPasswordResetLink
} = require('../domain/passwordResetToken');
const { ValidationError } = require('../../../shared/errors');

const PASSWORD_RESET_THROTTLE_MESSAGE =
  'Pediste demasiados enlaces de restablecimiento. Esperá unos minutos antes de pedir otro.';

/**
 * Pide un enlace de restablecimiento de contraseña.
 *
 * La respuesta es la misma exista o no la cuenta, y el contador de intentos se consume
 * antes de mirar la base: igual que el reenvío de verificación, este endpoint no puede
 * servir para averiguar qué correos están registrados.
 *
 * Cuentas creadas con Google no tienen contraseña que restablecer: para ellas no se
 * manda nada, con la misma respuesta.
 *
 * Ports: userRepository, resetRepository, emailSender, throttle
 */
class RequestPasswordReset {
  constructor({
    userRepository,
    resetRepository,
    emailSender,
    throttle,
    config,
    logger = console,
    now = () => Date.now()
  }) {
    if (!throttle) {
      // Falla ruidosamente en vez de publicar un endpoint que dispara correos sin límite.
      throw new TypeError('RequestPasswordReset requires a throttle');
    }

    this.userRepository = userRepository;
    this.resetRepository = resetRepository;
    this.emailSender = emailSender;
    this.throttle = throttle;
    this.config = config;
    this.logger = logger;
    this.now = now;
  }

  async execute({ email } = {}) {
    if (typeof email !== 'string' || email.trim().length === 0) {
      throw new ValidationError('email is required');
    }

    // Normalizar primero: un correo mal formado es 400 y no gasta cupo del límite.
    const normalizedEmail = normalizeEmail(email);
    this.throttle.consume(normalizedEmail);

    const user = await this.userRepository.findByEmail(normalizedEmail);

    if (user && user.passwordHash) {
      await this.issueLink(user);
    }

    return { accepted: true };
  }

  async issueLink(user) {
    const rawToken = generateVerificationToken();
    const ttlMinutes = this.config.passwordReset.ttlMinutes;

    // Quemar el anterior primero: solo el enlace más nuevo tiene que funcionar.
    await this.resetRepository.invalidateForUser(user.id);

    await this.resetRepository.create({
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: computeResetExpiration(new Date(this.now()), ttlMinutes)
    });

    const link = buildPasswordResetLink({ appUrl: this.config.appUrl, rawToken });

    try {
      await this.emailSender.sendPasswordResetEmail({
        to: user.email,
        fullName: user.fullName,
        link,
        expiresInMinutes: ttlMinutes
      });

      return { sent: true };
    } catch (error) {
      // Un envío caído no rompe la operación ni delata la cuenta: el usuario puede
      // volver a pedirlo.
      this.logger.warn(`[auth] password reset delivery failed for ${user.email}: ${error.message}`);
      return { sent: false };
    }
  }
}

module.exports = { RequestPasswordReset, PASSWORD_RESET_THROTTLE_MESSAGE };
