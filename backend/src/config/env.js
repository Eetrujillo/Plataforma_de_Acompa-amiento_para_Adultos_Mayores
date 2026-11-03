'use strict';

const fs = require('node:fs');
const path = require('node:path');

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
  databaseUrl:
    process.env.DATABASE_URL || process.env.MONGO_URL || 'mongodb://localhost:27017/mearn_db',
  jwt: Object.freeze({
    secret: resolveJwtSecret(),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  }),
  pairing: Object.freeze({
    codeLength: 6,
    ttlMinutes: Number.parseInt(process.env.PAIRING_TTL_MINUTES || '15', 10),
    maxGenerationAttempts: 5
  }),
  appUrl: (process.env.APP_URL || 'http://localhost:3201').replace(/\/+$/, ''),
  verification: Object.freeze({
    ttlHours: Number.parseInt(process.env.EMAIL_VERIFICATION_TTL_HOURS || '24', 10)
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
