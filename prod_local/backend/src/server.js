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
const { createOlderAdultsModule } = require('./modules/older_adults');
const { createLinkingModule } = require('./modules/linking');
const { createSeniorAppModule } = require('./modules/senior_app');
const { PrismaActivityRepository } = require('./modules/activities/infrastructure/PrismaActivityRepository');
const { createSeniorAuthMiddleware } = require('./shared/middlewares/seniorAuth');
const { createVerifiedEmailGuard } = require('./shared/middlewares/verifiedEmail');

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

  const verifiedEmailGuard = createVerifiedEmailGuard({ userRepository: auth.userRepository });

  // HU-005 / HU-006 / HU-010: perfiles y códigos del familiar.
  const olderAdults = createOlderAdultsModule({
    prisma,
    config,
    authMiddleware: auth.authMiddleware,
    verifiedEmailGuard,
    passwordHasher: auth.passwordHasher,
    pairingRepository: pairing.pairingRepository,
    qrGenerator: pairing.qrGenerator
  });

  // Un solo repositorio de actividades para las dos caras (familiar y app).
  const activityRepository = new PrismaActivityRepository({ prisma });

  const seniorAuthMiddleware = createSeniorAuthMiddleware({
    verifyToken: (token) => auth.tokenService.verify(token),
    olderAdultRepository: olderAdults.olderAdultRepository
  });

  // HU-008 / HU-009 / HU-011 / HU-017 a HU-019.
  const seniorApp = createSeniorAppModule({
    olderAdultRepository: olderAdults.olderAdultRepository,
    activityRepository,
    passwordHasher: auth.passwordHasher,
    seniorAuthMiddleware
  });

  // HU-007: canje del código.
  const linking = createLinkingModule({
    pairingRepository: pairing.pairingRepository,
    olderAdultRepository: olderAdults.olderAdultRepository,
    tokenService: auth.tokenService
  });

  // HU-012 a HU-015 y HU-020: usa el mismo cálculo de día que la app.
  const activities = createActivitiesModule({
    prisma,
    userRepository: auth.userRepository,
    olderAdultRepository: olderAdults.olderAdultRepository,
    activityRepository,
    dayBuilder: seniorApp.service,
    authMiddleware: auth.authMiddleware,
    verifiedEmailGuard
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
      olderAdults: olderAdults.router,
      linking: linking.router,
      seniorApp: seniorApp.router,
      activities: activities.router,
      pairing: pairing.router,
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

  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(config.appUrl)) {
    console.warn(
      `[server] APP_URL is ${config.appUrl}: verification links will not open outside this machine. Set the public URL.`
    );
  }

  let shuttingDown = false;

  const shutdown = async (signal, exitCode = 0) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`[server] ${signal} received, shutting down`);

    io.close();
    await new Promise((resolve) => httpServer.close(resolve));
    await prisma.$disconnect();

    process.exit(exitCode);
  };

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      shutdown(signal).catch((error) => {
        console.error('[server] shutdown failed', error);
        process.exit(1);
      });
    });
  }

  // A crash must leave a diagnosable trace and then take the same graceful path
  // as a signal, instead of leaving the process in an undefined state.
  const CRASH_EXIT_TIMEOUT_MS = 5_000;

  const crash = (kind, error) => {
    console.error(`[server] ${kind}: ${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`);
    console.error(error?.stack ?? '(no stack)');

    // A second crash while draining means the graceful path is already lost.
    if (shuttingDown) {
      process.exit(1);
    }

    // Draining sockets after a crash must be bounded: a hung shutdown would leave
    // the process alive in exactly the indeterminate state this handler avoids.
    const watchdog = setTimeout(() => {
      console.error(`[server] shutdown after ${kind} did not finish, forcing exit`);
      process.exit(1);
    }, CRASH_EXIT_TIMEOUT_MS);
    watchdog.unref();

    shutdown(kind, 1).catch((shutdownError) => {
      console.error('[server] shutdown failed', shutdownError);
      process.exit(1);
    });
  };

  process.on('unhandledRejection', (reason) => crash('unhandledRejection', reason));
  process.on('uncaughtException', (error) => crash('uncaughtException', error));

  return { httpServer, io };
}

if (require.main === module) {
  start().catch((error) => {
    console.error('[server] failed to start', error);
    process.exit(1);
  });
}

module.exports = { buildApplication, start };
