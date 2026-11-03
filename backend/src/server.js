'use strict';

const http = require('node:http');

const config = require('./config/env');
const { getPrismaClient, connectDatabase, disconnectDatabase } = require('./config/database');
const { createSocketServer } = require('./config/socket');
const { createApp } = require('./app');

const { createAuthModule } = require('./modules/auth');
const { createPairingModule } = require('./modules/pairing');
const { createActivitiesModule } = require('./modules/activities');
const { createSosModule } = require('./modules/sos_emergency');

/**
 * Composition root: builds every slice, wires the shared ports and mounts the
 * routers on one HTTP server that also carries Socket.IO.
 */
function buildApplication() {
  const httpServer = http.createServer();
  const io = createSocketServer(httpServer, config);
  const prisma = getPrismaClient();

  const auth = createAuthModule({ prisma, config });

  const pairing = createPairingModule({
    prisma,
    config,
    userRepository: auth.userRepository,
    tokenService: auth.tokenService,
    authMiddleware: auth.authMiddleware
  });

  const activities = createActivitiesModule({
    prisma,
    userRepository: auth.userRepository,
    authMiddleware: auth.authMiddleware
  });

  const sos = createSosModule({
    prisma,
    userRepository: auth.userRepository,
    authMiddleware: auth.authMiddleware,
    io
  });

  const app = createApp({
    config,
    modules: {
      auth: auth.router,
      pairing: pairing.router,
      activities: activities.router,
      sos: sos.router
    }
  });

  httpServer.on('request', app);

  return { httpServer, io, prisma };
}

async function start() {
  const { httpServer, io, prisma } = buildApplication();

  await connectDatabase();

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(config.port, () => {
      httpServer.removeListener('error', reject);
      resolve();
    });
  });

  console.log(`[server] listening on port ${config.port} (${config.nodeEnv})`);

  if (config.smtp.host) {
    console.log(`[server] email delivery: smtp (${config.smtp.host}:${config.smtp.port})`);
  } else {
    console.log('[server] email delivery: console (SMTP_HOST is not set, verification links are printed here)');
  }

  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`[server] ${signal} received, shutting down`);

    io.close();
    await new Promise((resolve) => httpServer.close(resolve));
    await prisma.$disconnect();

    process.exit(0);
  };

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      shutdown(signal).catch((error) => {
        console.error('[server] shutdown failed', error);
        process.exit(1);
      });
    });
  }

  return { httpServer, io };
}

if (require.main === module) {
  start().catch((error) => {
    console.error('[server] failed to start', error);
    process.exit(1);
  });
}

module.exports = { buildApplication, start };
