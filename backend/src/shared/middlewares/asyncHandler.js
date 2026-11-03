'use strict';

/**
 * Wraps an async Express handler so rejected promises reach the error middleware.
 */
function asyncHandler(handler) {
  return function wrappedHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
