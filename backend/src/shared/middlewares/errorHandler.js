'use strict';

const { AppError, NotFoundError } = require('../errors');

/**
 * Prisma failures that deserve a readable answer instead of a masked 500.
 *
 * P2031 happens on writes when MongoDB is not a replica set (or the set was never
 * initiated): the client needs a transaction and the server cannot provide one.
 */
const PRISMA_HINTS = Object.freeze({
  P2031: {
    statusCode: 503,
    code: 'DATABASE_NOT_READY',
    message:
      'La base de datos no acepta escrituras: MongoDB tiene que correr como replica set con el set iniciado.'
  }
});

function mapPrismaError(error) {
  const hint = PRISMA_HINTS[error?.code];
  return hint ? { ...hint } : null;
}

/**
 * Terminal 404 handler for unknown API routes.
 */
function notFoundHandler(req, _res, next) {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
}

/**
 * Error middleware factory.
 *
 * Operational errors expose their code and message; known Prisma failures get a
 * readable translation; anything else is masked and logged so internals never
 * leak to clients.
 */
function createErrorHandler({ logger = console } = {}) {
  return function errorHandler(error, _req, res, _next) {
    const isOperational = error instanceof AppError;
    const hint = isOperational ? null : mapPrismaError(error);
    const statusCode = isOperational ? error.statusCode : hint?.statusCode ?? 500;

    if (statusCode >= 500) {
      logger.error('[error]', error);
    }

    let payload;

    if (isOperational) {
      payload = error.toJSON();
    } else if (hint) {
      payload = { error: { code: hint.code, message: hint.message } };
    } else {
      payload = { error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' } };
    }

    res.status(statusCode).json(payload);
  };
}

module.exports = { createErrorHandler, notFoundHandler, mapPrismaError, PRISMA_HINTS };
