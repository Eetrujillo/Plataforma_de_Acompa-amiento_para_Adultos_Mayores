'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createErrorHandler, mapPrismaError } = require('../src/shared/middlewares/errorHandler');
const { createRequestContext } = require('../src/shared/middlewares/requestContext');
const { createApp } = require('../src/app');
const { ValidationError } = require('../src/shared/errors');

const silentLogger = { error() {}, warn() {}, log() {} };
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

function createCaptureLogger() {
  const entries = [];

  return {
    entries,
    error(...args) {
      entries.push(args);
    },
    warn() {},
    log() {}
  };
}

async function withServer(handler, run, logger = silentLogger) {
  const app = express();
  app.use(createRequestContext());
  app.get('/boom', handler);
  app.use(createErrorHandler({ logger }));

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

      assert.equal(body.error.code, 'INTERNAL_ERROR');
      assert.equal(body.error.message, 'Unexpected server error');
      assert.equal(body.error.requestId, response.headers.get('x-request-id'));
    }
  );
});

test('a 5xx body carries the request id and never the stack or file paths', async () => {
  await withServer(
    (_req, _res, next) => next(new Error('secret internal detail')),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/boom`, {
        headers: { 'X-Request-Id': 'trace-abc-12345' }
      });
      const raw = await response.text();
      const body = JSON.parse(raw);

      assert.equal(response.status, 500);
      assert.equal(response.headers.get('x-request-id'), 'trace-abc-12345');
      assert.equal(body.error.requestId, 'trace-abc-12345');
      assert.match(body.error.requestId, SAFE_ID);
      assert.doesNotMatch(raw, /\bat \S+/);
      assert.doesNotMatch(raw, /node_modules/);
      assert.doesNotMatch(raw, /secret internal detail/);
    }
  );
});

test('4xx bodies keep their exact shape without a request id', async () => {
  await withServer(
    (_req, _res, next) => next(new ValidationError('email is required')),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/boom`);

      assert.equal(response.status, 400);

      const body = await response.json();

      assert.deepEqual(body, {
        error: { code: 'VALIDATION_ERROR', message: 'email is required' }
      });
    }
  );
});

test('a 5xx failure logs one structured line with the full error', async () => {
  const logger = createCaptureLogger();
  const failure = new Error('prisma blew up');
  failure.code = 'P9999';

  await withServer(
    (_req, _res, next) => next(failure),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/boom?q=1`, {
        headers: { 'X-Request-Id': 'log-trace-12345' }
      });

      assert.equal(response.status, 500);
    },
    logger
  );

  assert.equal(logger.entries.length, 1);

  const [prefix, entry] = logger.entries[0];

  assert.equal(prefix, '[error]');
  assert.equal(entry.requestId, 'log-trace-12345');
  assert.equal(entry.method, 'GET');
  assert.equal(entry.url, '/boom?q=1');
  assert.equal(entry.status, 500);
  assert.equal(entry.code, 'INTERNAL_ERROR');
  assert.equal(typeof entry.durationMs, 'number');
  assert.ok(entry.durationMs >= 0);
  assert.equal(entry.error, failure);
});

test('operational 4xx failures are not logged as errors', async () => {
  const logger = createCaptureLogger();

  await withServer(
    (_req, _res, next) => next(new ValidationError('email is required')),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/boom`);

      assert.equal(response.status, 400);
    },
    logger
  );

  assert.equal(logger.entries.length, 0);
});

test('a malformed JSON body answers 400 INVALID_JSON without parser internals', async () => {
  const app = createApp({ config: { corsOrigin: '*' }, logger: silentLogger });
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{'
    });
    const raw = await response.text();
    const body = JSON.parse(raw);

    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'INVALID_JSON');
    assert.equal(body.error.message, 'El cuerpo de la solicitud no es JSON válido.');
    assert.equal(body.error.requestId, undefined);
    assert.doesNotMatch(raw, /Unexpected token/);
    assert.doesNotMatch(raw, /SyntaxError/);
    assert.doesNotMatch(raw, /node_modules/);
    assert.doesNotMatch(raw, /\bat \S+/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('a body over 100kb answers 413 PAYLOAD_TOO_LARGE', async () => {
  const app = createApp({ config: { corsOrigin: '*' }, logger: silentLogger });
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: 'a'.repeat(120 * 1024) })
    });
    const raw = await response.text();
    const body = JSON.parse(raw);

    assert.equal(response.status, 413);
    assert.equal(body.error.code, 'PAYLOAD_TOO_LARGE');
    assert.equal(
      body.error.message,
      'El cuerpo de la solicitud supera el límite permitido (100kb).'
    );
    assert.equal(body.error.requestId, undefined);
    assert.doesNotMatch(raw, /node_modules/);
    assert.doesNotMatch(raw, /\bat \S+/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
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

test('an unknown prisma failure stays masked as a 500 and is logged whole', async () => {
  const logger = createCaptureLogger();
  const failure = new Error('bad aggregation stage');
  failure.code = 'P2010';
  failure.meta = { message: 'bad aggregation stage' };

  await withServer(
    (_req, _res, next) => next(failure),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/boom`);

      assert.equal(response.status, 500);

      const body = await response.json();

      assert.equal(body.error.code, 'INTERNAL_ERROR');
      assert.equal(body.error.message, 'Unexpected server error');
    },
    logger
  );

  assert.equal(logger.entries.length, 1);
  assert.equal(logger.entries[0][1].error, failure);
});

test('only the known prisma code is mapped', () => {
  assert.equal(mapPrismaError({ code: 'P2002' }), null);
  assert.equal(mapPrismaError(null), null);
  assert.equal(mapPrismaError({ code: 'P2031' }).statusCode, 503);
});

test('a connectivity failure inside P2010 is translated, other raw failures are not', () => {
  const selectionTimeout = mapPrismaError({
    code: 'P2010',
    meta: {
      message:
        'Kind: Server selection timeout: No available servers. Topology: { Type: ReplicaSetNoPrimary }'
    }
  });

  assert.equal(selectionTimeout.statusCode, 503);
  assert.equal(selectionTimeout.code, 'DATABASE_UNAVAILABLE');

  assert.equal(mapPrismaError({ code: 'P2010', meta: { message: 'bad aggregation stage' } }), null);
});
