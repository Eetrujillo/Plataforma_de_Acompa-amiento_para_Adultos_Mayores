'use strict';

const { randomUUID } = require('node:crypto');

const REQUEST_ID_HEADER = 'X-Request-Id';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Only ids that cannot smuggle whitespace, separators or header breaks into
 * logs and responses are accepted; anything else is replaced.
 */
function isValidRequestId(value) {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

/**
 * Correlation id middleware.
 *
 * Assigns `req.id`, mirrors it on the `X-Request-Id` response header and stores
 * the request start time so the error handler can report a duration.
 */
function createRequestContext({ headerName = REQUEST_ID_HEADER, generate = randomUUID } = {}) {
  return function requestContext(req, res, next) {
    const incoming = req.get(headerName);
    const id = isValidRequestId(incoming) ? incoming : generate();

    req.id = id;
    req.requestStartedAt = process.hrtime.bigint();
    res.setHeader(headerName, id);

    next();
  };
}

module.exports = {
  createRequestContext,
  isValidRequestId,
  REQUEST_ID_HEADER,
  REQUEST_ID_PATTERN
};
