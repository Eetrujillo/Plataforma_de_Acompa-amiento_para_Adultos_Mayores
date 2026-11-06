'use strict';

const { AppError, UnauthorizedError } = require('../errors');

/**
 * Solo deja pasar cuentas con el correo confirmado.
 *
 * Debe montarse después del middleware de autenticación. Se usa en las rutas
 * del familiar, igual que `requireVerifiedEmail` en la versión anterior.
 */
function createVerifiedEmailGuard({ userRepository }) {
  return async function verifiedEmailGuard(req, _res, next) {
    try {
      if (!req.user) return next(new UnauthorizedError('Authentication required'));

      const user = await userRepository.findById(req.user.id);

      if (!user) return next(new UnauthorizedError('Invalid or expired token'));

      if (!user.emailVerifiedAt) {
        return next(
          new AppError('Confirma tu correo electrónico para acceder a esta función.', {
            statusCode: 403,
            code: 'EMAIL_NOT_VERIFIED'
          })
        );
      }

      // Un cambio de contraseña o un cierre de sesión incrementan la versión:
      // el token viejo deja de valer aunque no haya expirado.
      if (Number(req.user.sessionVersion ?? 0) !== Number(user.sessionVersion ?? 0)) {
        return next(
          new AppError('La sesión ya no es válida.', {
            statusCode: 401,
            code: 'SESSION_INVALIDATED'
          })
        );
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { createVerifiedEmailGuard };
