'use strict';

const express = require('express');
const cors = require('cors');

const { createErrorHandler, notFoundHandler } = require('./shared/middlewares/errorHandler');
const { createRequestContext } = require('./shared/middlewares/requestContext');

const API_PREFIX = '/api';
const HEALTH_PAYLOAD = Object.freeze({ status: 'ok', db: 'mongodb' });

/**
 * Builds the Express application from already-composed slice routers.
 *
 * Injection keeps the transport layer free of Prisma and of slice internals.
 */
function createApp({ config, modules = {}, logger = console } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(createRequestContext());
  app.use(cors({ origin: config?.corsOrigin ?? '*' }));
  app.use(express.json({ limit: '100kb' }));

  app.get(`${API_PREFIX}/health`, (_req, res) => {
    res.status(200).json({ ...HEALTH_PAYLOAD });
  });

  if (modules.auth) {
    app.use(`${API_PREFIX}/auth`, modules.auth);
  }

  if (modules.pairing) {
    app.use(`${API_PREFIX}/pairing`, modules.pairing);
  }

  if (modules.seniors) {
    app.use(`${API_PREFIX}/seniors`, modules.seniors);
  }

  if (modules.activities) {
    app.use(`${API_PREFIX}/activities`, modules.activities);
  }

  if (modules.sos) {
    app.use(`${API_PREFIX}/sos`, modules.sos);
  }

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger }));

  return app;
}

module.exports = { createApp, API_PREFIX, HEALTH_PAYLOAD };
