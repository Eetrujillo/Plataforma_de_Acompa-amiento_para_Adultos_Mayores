'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createErrorHandler, mapPrismaError } = require('../src/shared/middlewares/errorHandler');
const { ValidationError } = require('../src/shared/errors');

const silentLogger = { error() {}, warn() {}, log() {} };

async function withServer(handler, run) {
  const app = express();
  app.get('/boom', handler);
  app.use(createErrorHandler({ logger: silentLogger }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('P2031 is translated into an actionable 503 instead of a masked 500', async () => {
  await withServer(
    (_req, _res, next) => {
      const prismaError = new Error('Prisma needs to perform transactions');
      prismaError.code = 'P2031';
      next(prismaError);
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/boom`);

      assert.equal(response.status, 503);

      const body = await response.json();

      assert.equal(body.error.code, 'DATABASE_NOT_READY');
      assert.match(body.error.message, /replica set/);
    }
  );
});

test('an unknown failure stays masked as a 500 and leaks nothing', async () => {
  await withServer(
    (_req, _res, next) => next(new Error('secret internal detail')),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/boom`);

      assert.equal(response.status, 500);

      const body = await response.json();

      assert.deepEqual(body, {
        error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' }
      });
    }
  );
});

test('operational errors keep their own status and code', async () => {
  await withServer(
    (_req, _res, next) => next(new ValidationError('email is required')),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/boom`);

      assert.equal(response.status, 400);

      const body = await response.json();

      assert.equal(body.error.code, 'VALIDATION_ERROR');
      assert.equal(body.error.message, 'email is required');
    }
  );
});

test('only the known prisma code is mapped', () => {
  assert.equal(mapPrismaError({ code: 'P2002' }), null);
  assert.equal(mapPrismaError(null), null);
  assert.equal(mapPrismaError({ code: 'P2031' }).statusCode, 503);
});
