'use strict';

const { UnauthorizedError, ForbiddenError } = require('../errors');
const { sessionVersionOf, tokenVersionOf } = require('../session/sessionVersion');

function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== 'string') {
    return null;
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/);

  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

/**
 * Authentication middleware factory.
 *
 * The token verifier is injected by the composition root, so this shared
 * middleware never imports a slice implementation.
 *
 * The user is read on every authenticated request. That is the price of being able to
 * revoke a session: a JWT cannot be taken back on its own, so the token carries the
 * user's session version and the stored one is what decides. It also means a token for
 * a deleted user stops working immediately.
 */
function createAuthMiddleware({ verifyToken, userRepository }) {
  if (!userRepository) {
    throw new TypeError('createAuthMiddleware requires a userRepository');
  }

  return async function authMiddleware(req, _res, next) {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      return next(new UnauthorizedError('Missing bearer token'));
    }

    let claims;

    try {
      claims = verifyToken(token);
    } catch {
      return next(new UnauthorizedError('Invalid or expired token'));
    }

    let user;

    if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
      // Un token sin `sub` utilizable no es una sesión: si llegara a Prisma sería un 500.
      return next(new UnauthorizedError('Invalid or expired token'));
    }

    try {
      user = await userRepository.findById(claims.sub);
    } catch (error) {
      // Falla cerrado: si la base no responde, no se sigue con los claims del token.
      return next(error);
    }

    // Mismo error para usuario inexistente y sesión revocada: el cliente solo necesita
    // saber que tiene que volver a entrar, no por qué.
    if (!user || tokenVersionOf(claims) !== sessionVersionOf(user)) {
      return next(new UnauthorizedError('Invalid or expired token'));
    }

    req.user = { id: user.id, role: user.role, email: user.email };
    return next();
  };
}

function requireRole(...roles) {
  return function roleGuard(req, _res, next) {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError(`Requires one of roles: ${roles.join(', ')}`));
    }

    return next();
  };
}

module.exports = { createAuthMiddleware, requireRole, extractBearerToken };
