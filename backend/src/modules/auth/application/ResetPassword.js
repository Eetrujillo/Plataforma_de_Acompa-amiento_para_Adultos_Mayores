'use strict';

const { assertPassword } = require('../domain/User');
const { hashToken, isTokenExpired } = require('../domain/passwordResetToken');
const { ValidationError } = require('../../../shared/errors');

// Un único mensaje para token inventado, mal formado, ya usado y vencido: distinguirlos
// solo le sirve a quien está probando enlaces.
const INVALID_RESET_TOKEN_MESSAGE =
  'El enlace para restablecer la contraseña no es válido o ya venció';

/**
 * Canjea el enlace y cambia la contraseña.
 *
 * La contraseña se valida ANTES de tocar el token: si la regla de contraseña rechaza la
 * nueva, el enlace tiene que seguir sirviendo para reintentar con una válida.
 *
 * Ports: userRepository, resetRepository, passwordHasher
 */
class ResetPassword {
  constructor({ userRepository, resetRepository, passwordHasher, config, now = () => Date.now() }) {
    this.userRepository = userRepository;
    this.resetRepository = resetRepository;
    this.passwordHasher = passwordHasher;
    this.config = config;
    this.now = now;
  }

  async execute({ token, password } = {}) {
    assertPassword(password);

    if (typeof token !== 'string' || token.trim().length === 0) {
      throw new ValidationError(INVALID_RESET_TOKEN_MESSAGE);
    }

    const record = await this.resetRepository.findByHash(hashToken(token.trim()));

    if (!record || record.usedAt) {
      throw new ValidationError(INVALID_RESET_TOKEN_MESSAGE);
    }

    if (isTokenExpired(record.expiresAt, new Date(this.now()))) {
      throw new ValidationError(INVALID_RESET_TOKEN_MESSAGE);
    }

    const user = await this.userRepository.findById(record.userId);

    if (!user) {
      throw new ValidationError(INVALID_RESET_TOKEN_MESSAGE);
    }

    const passwordHash = await this.passwordHasher.hash(password);

    await this.userRepository.updatePasswordAfterReset(user.id, { passwordHash });
    await this.resetRepository.markUsed({ id: record.id });

    return { reset: true };
  }
}

module.exports = { ResetPassword, INVALID_RESET_TOKEN_MESSAGE };
