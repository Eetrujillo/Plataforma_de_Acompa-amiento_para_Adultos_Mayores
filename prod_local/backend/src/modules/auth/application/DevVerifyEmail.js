'use strict';

const { toPublicUser } = require('../domain/User');
const { NotFoundError, ValidationError } = require('../../../shared/errors');

/**
 * Solo desarrollo: confirma el correo sin abrir el enlace del mensaje.
 *
 * En local no hay SMTP, así que el enlace de confirmación solo aparece en la
 * consola del backend. Eso hace imposible terminar el registro desde un
 * teléfono con Expo Go. Este caso de uso existe para esa prueba; la ruta que lo
 * expone **no se monta** cuando `NODE_ENV=production`.
 *
 * Ports: userRepository, tokenService
 */
class DevVerifyEmail {
  constructor({ userRepository, tokenService }) {
    this.userRepository = userRepository;
    this.tokenService = tokenService;
  }

  async execute({ email } = {}) {
    if (typeof email !== 'string' || email.trim().length === 0) {
      throw new ValidationError('El correo es obligatorio', { field: 'email' });
    }

    const user = await this.userRepository.findByEmail(email.trim().toLowerCase());

    if (!user) {
      throw new NotFoundError('No existe una cuenta con ese correo.');
    }

    const verified = user.emailVerifiedAt
      ? user
      : await this.userRepository.markEmailVerified(user.id);

    const token = this.tokenService.sign({
      sub: verified.id,
      role: verified.role,
      email: verified.email,
      sessionVersion: verified.sessionVersion ?? 0
    });

    return {
      token,
      user: toPublicUser(verified),
      message: 'Correo confirmado en modo desarrollo. Ya puedes usar la cuenta.'
    };
  }
}

module.exports = { DevVerifyEmail };
