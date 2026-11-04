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

  if (hint) {
    return { ...hint };
  }

  // P2010 is a raw query failure; only the connectivity flavour is worth translating.
  const detail = String(error?.meta?.message ?? error?.message ?? '');

  if (error?.code === 'P2010' && /server selection|no available servers|connection refused/i.test(detail)) {
    return {
      statusCode: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'No se pudo contactar la base de datos.'
    };
  }

  return null;
}

/**
 * `express.json` failures (malformed or oversized bodies) carry a `type` we can
 * translate into a precise 4xx instead of a masked 500.
 */
function mapBodyParserError(error) {
  if (error?.type === 'entity.parse.failed') {
    return {
      statusCode: 400,
      code: 'INVALID_JSON',
      message: 'El cuerpo de la solicitud no es JSON válido.'
    };
  }

  if (error?.type === 'entity.too.large') {
    return {
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'El cuerpo de la solicitud supera el límite permitido (100kb).'
    };
  }

  return null;
}

function requestDurationMs(req) {
  if (typeof req?.requestStartedAt !== 'bigint') {
    return 0;
  }

  return Number(process.hrtime.bigint() - req.requestStartedAt) / 1e6;
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
  return function errorHandler(error, req, res, _next) {
    const isOperational = error instanceof AppError;
    const parserHint = isOperational ? null : mapBodyParserError(error);
    const hint = isOperational || parserHint ? null : mapPrismaError(error);
    const statusCode = isOperational
      ? error.statusCode
      : parserHint?.statusCode ?? hint?.statusCode ?? 500;

    let payload;

    if (isOperational) {
      payload = error.toJSON();
    } else if (parserHint) {
      payload = { error: { code: parserHint.code, message: parserHint.message } };
    } else if (hint) {
      payload = { error: { code: hint.code, message: hint.message } };
    } else {
      payload = { error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' } };
    }

    if (statusCode >= 500) {
      logger.error('[error]', {
        requestId: req?.id,
        method: req?.method,
        url: req?.originalUrl ?? req?.url,
        status: statusCode,
        code: payload.error.code,
        durationMs: requestDurationMs(req),
        error
      });
    }

    // The correlation id is only exposed on 5xx so clients can report an
    // incident; 4xx bodies keep their established shape.
    if (statusCode >= 500 && req?.id) {
      payload = { error: { ...payload.error, requestId: req.id } };
    }

    res.status(statusCode).json(payload);
  };
}

module.exports = {
  createErrorHandler,
  notFoundHandler,
  mapPrismaError,
  mapBodyParserError,
  PRISMA_HINTS
};
