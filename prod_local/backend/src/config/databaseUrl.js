'use strict';

const MONGO_URL_PATTERN = /^mongodb(\+srv)?:\/\/.+/;
const LOOPBACK_PATTERN = /(^|[@,/])(localhost|127\.0\.0\.1)(:|\/|$)/;

/**
 * Validates that a connection string is a MongoDB URI.
 *
 * The Prisma CLI reads `DATABASE_URL` raw, so a stale value from another project
 * (for example a postgresql:// string left in .env) would fail deep inside the
 * engine with a cryptic P1012. Failing here names the variable and the culprit.
 */
function assertMongoUrl(value, { name = 'DATABASE_URL' } = {}) {
  if (!MONGO_URL_PATTERN.test(String(value ?? ''))) {
    const protocol = String(value ?? '').split('://')[0] || 'empty';

    throw new Error(
      `${name} must start with mongodb:// or mongodb+srv:// (got "${protocol}://"). ` +
        'This project only uses MongoDB: fix the value or remove it and rely on MONGO_URL.'
    );
  }

  return value;
}

/**
 * Inside a container, localhost is the container itself, never the database.
 * Failing here turns a per-request "Server selection timeout" into one line that
 * names the fix.
 */
function assertReachableFromContainer(value, { inContainer = false } = {}) {
  if (inContainer && LOOPBACK_PATTERN.test(String(value))) {
    throw new Error(
      'MONGO_URL points at localhost, but the backend runs inside a container: ' +
        'localhost is the backend itself. Use the compose service name, for example ' +
        'mongodb://mongo:27017/mearn_db'
    );
  }

  return value;
}

/**
 * Resolution order: explicit DATABASE_URL, then MONGO_URL, then the local default.
 */
function resolveDatabaseUrl({
  explicit,
  fallback,
  defaultUrl = 'mongodb://localhost:27017/mearn_db',
  inContainer = false
}) {
  const url = assertMongoUrl(explicit || fallback || defaultUrl);
  return assertReachableFromContainer(url, { inContainer });
}

module.exports = {
  MONGO_URL_PATTERN,
  LOOPBACK_PATTERN,
  assertMongoUrl,
  assertReachableFromContainer,
  resolveDatabaseUrl
};
