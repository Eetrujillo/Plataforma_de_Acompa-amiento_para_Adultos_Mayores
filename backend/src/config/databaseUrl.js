'use strict';

const MONGO_URL_PATTERN = /^mongodb(\+srv)?:\/\/.+/;

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
 * Resolution order: explicit DATABASE_URL, then MONGO_URL, then the local default.
 */
function resolveDatabaseUrl({ explicit, fallback, defaultUrl = 'mongodb://localhost:27017/mearn_db' }) {
  return assertMongoUrl(explicit || fallback || defaultUrl);
}

module.exports = { MONGO_URL_PATTERN, assertMongoUrl, resolveDatabaseUrl };
