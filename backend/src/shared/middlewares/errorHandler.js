'use strict';

const { AppError, NotFoundError } = require('../errors');

/**
 * Terminal 404 handler for unknown API routes.
 */
function notFoundHandler(req, _res, next) {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
}

/**
 * Error middleware factory.
 *
 * Operational errors expose their code and message; anything else is masked
 * and logged so internals never leak to clients.
 */
function createErrorHandler({ logger = console } = {}) {
  return function errorHandler(error, _req, res, _next) {
    const isOperational = error instanceof AppError;
    const statusCode = isOperational ? error.statusCode : 500;

    if (statusCode >= 500) {
      logger.error('[error]', error);
    }

    const payload = isOperational
      ? error.toJSON()
      : { error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' } };

    res.status(statusCode).json(payload);
  };
}

module.exports = { createErrorHandler, notFoundHandler };
