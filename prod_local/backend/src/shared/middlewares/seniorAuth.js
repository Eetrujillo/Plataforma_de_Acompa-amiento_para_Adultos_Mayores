'use strict';

const { AppError, ForbiddenError } = require('../errors');

function extractToken(req) {
  // La app móvil usa `X-Older-Adult-Token`; se acepta también `Bearer` para
  // que las herramientas de prueba y el frontend web puedan usarlo igual.
  const header = req.get('x-older-adult-token');

  if (header) return header.trim();

  const authorization = req.headers.authorization;

  if (typeof authorization === 'string') {
    const [scheme, token] = authorization.trim().split(/\s+/);
    if (scheme?.toLowerCase() === 'bearer' && token) return token;
  }

  return null;
}

function sessionError(code, message) {
  return new AppError(message, { statusCode: 401, code });
}

/**
 * Autenticación de la app del adulto mayor.
 *
 * Valida el JWT y vuelve a leer el usuario para comprobar que la vinculación
 * sigue activa y que el token no fue invalidado (`sessionVersion`).
 */
function createSeniorAuthMiddleware({ verifyToken, olderAdultRepository }) {
  return async function seniorAuthMiddleware(req, _res, next) {
    try {
      const token = extractToken(req);

      if (!token) {
        return next(
          sessionError('OLDER_ADULT_SESSION_REQUIRED', 'No hay una sesión de la app vinculada.')
        );
      }

      let claims;

      try {
        claims = verifyToken(token);
      } catch {
        return next(
          sessionError(
            'OLDER_ADULT_SESSION_INVALID',
            'Tu vinculación ya no está activa. Pide a tu familiar un código nuevo.'
          )
        );
      }

      if (claims.role !== 'SENIOR') {
        return next(new ForbiddenError('This token does not belong to a senior account'));
      }

      const profile = await olderAdultRepository.findById(claims.sub);

      if (
        !profile ||
        profile.linkStatus !== 'linked' ||
        Number(claims.sessionVersion ?? 0) !== Number(profile.sessionVersion ?? 0)
      ) {
        return next(
          sessionError(
            'OLDER_ADULT_SESSION_INVALID',
            'Tu vinculación ya no está activa. Pide a tu familiar un código nuevo.'
          )
        );
      }

      req.senior = { id: profile.id, profile };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { createSeniorAuthMiddleware, extractToken };
