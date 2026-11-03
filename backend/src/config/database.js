'use strict';

const { PrismaClient } = require('@prisma/client');

let prismaClient = null;

function getPrismaClient() {
  if (!prismaClient) {
    prismaClient = new PrismaClient({ log: ['error', 'warn'] });
  }

  return prismaClient;
}

const RETRY_DEFAULTS = Object.freeze({ attempts: 10, delayMs: 2000 });

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Connects to MongoDB with bounded retries.
 *
 * Compose does not guarantee that mongo is accepting connections the moment the
 * backend starts, so a single failed attempt must not kill the process.
 */
async function connectDatabase({ attempts = RETRY_DEFAULTS.attempts, delayMs = RETRY_DEFAULTS.delayMs, logger = console } = {}) {
  const client = getPrismaClient();
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await client.$connect();
      return client;
    } catch (error) {
      lastError = error;
      logger.warn(`[database] connection attempt ${attempt}/${attempts} failed: ${error.message}`);

      if (attempt < attempts) {
        await wait(delayMs);
      }
    }
  }

  throw lastError;
}

async function disconnectDatabase() {
  if (!prismaClient) {
    return;
  }

  await prismaClient.$disconnect();
  prismaClient = null;
}

module.exports = { getPrismaClient, connectDatabase, disconnectDatabase };
