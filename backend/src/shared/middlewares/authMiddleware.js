'use strict';

const { UnauthorizedError, ForbiddenError } = require('../errors');

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
 */
function createAuthMiddleware({ verifyToken }) {
  return function authMiddleware(req, _res, next) {
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

    req.user = { id: claims.sub, role: claims.role, email: claims.email };
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
