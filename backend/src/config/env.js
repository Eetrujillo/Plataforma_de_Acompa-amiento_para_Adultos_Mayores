'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { resolveDatabaseUrl } = require('./databaseUrl');

const ENV_CANDIDATES = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env')
];

function loadEnvFile() {
  if (process.env.ENV_FILE) {
    require('dotenv').config({ path: process.env.ENV_FILE });
    return;
  }

  const envFile = ENV_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (envFile) {
    require('dotenv').config({ path: envFile });
  }
}

loadEnvFile();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

/**
 * Parses a positive integer from the environment, falling back to the documented
 * default when the value is missing or malformed. Used for limits, where a typo must
 * not silently remove the protection.
 */
function positiveInteger(raw, fallback) {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (secret && secret.length > 0) {
    return secret;
  }

  if (isProduction) {
    throw new Error('JWT_SECRET is required when NODE_ENV=production');
  }

  return 'development-only-insecure-secret';
}

const config = Object.freeze({
  nodeEnv,
  isProduction,
  port: Number.parseInt(process.env.BACKEND_INTERNAL_PORT || process.env.PORT || '3500', 10),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  databaseUrl: resolveDatabaseUrl({
    explicit: process.env.DATABASE_URL,
    fallback: process.env.MONGO_URL,
    inContainer: fs.existsSync('/.dockerenv')
  }),
  jwt: Object.freeze({
    secret: resolveJwtSecret(),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  }),
  google: Object.freeze({
    // Public OAuth client id from Google Cloud. Empty means the button stays disabled.
    clientId: process.env.GOOGLE_CLIENT_ID || ''
  }),
  pairing: Object.freeze({
    codeLength: 6,
    ttlMinutes: Number.parseInt(process.env.PAIRING_TTL_MINUTES || '15', 10),
    maxGenerationAttempts: 5
  }),
  appUrl: (process.env.APP_URL || 'http://localhost:3201').replace(/\/+$/, ''),
  terms: Object.freeze({
    // Version of the data treatment policy the account accepts. Bumping it here is what
    // makes new registrations record the new policy; old records keep their own version.
    version: process.env.TERMS_VERSION || '1.0'
  }),
  verification: Object.freeze({
    ttlHours: Number.parseInt(process.env.EMAIL_VERIFICATION_TTL_HOURS || '24', 10)
  }),
  passwordReset: Object.freeze({
    // HU-004: el enlace de restablecimiento vive 60 minutos, no 24 horas como el de
    // verificación. Restablecer una contraseña es más sensible que confirmar un correo.
    ttlMinutes: positiveInteger(process.env.PASSWORD_RESET_TTL_MINUTES, 60)
  }),
  resendThrottle: Object.freeze({
    // HU-002: at most N resend attempts per email inside a sliding window. A malformed
    // value falls back to the spec number instead of disabling the limit.
    maxAttempts: positiveInteger(process.env.RESEND_THROTTLE_MAX, 3),
    windowMinutes: positiveInteger(process.env.RESEND_THROTTLE_WINDOW_MINUTES, 60)
  }),
  lockout: Object.freeze({
    // HU-003: consecutive wrong passwords before the account is locked, and for how long.
    // A malformed value falls back to the acceptance criterion (5 attempts, 15 minutes).
    maxAttempts: positiveInteger(process.env.LOCKOUT_MAX_ATTEMPTS, 5),
    lockMinutes: positiveInteger(process.env.LOCKOUT_MINUTES, 15)
  }),
  smtp: Object.freeze({
    host: process.env.SMTP_HOST || '',
    port: Number.parseInt(process.env.SMTP_PORT || '587', 10),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Plataforma de Acompañamiento <no-reply@example.com>'
  })
});

module.exports = config;
