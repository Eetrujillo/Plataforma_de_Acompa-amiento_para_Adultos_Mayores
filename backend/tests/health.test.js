'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp, HEALTH_PAYLOAD } = require('../src/app');

const silentLogger = { error() {}, warn() {}, log() {} };

async function withServer(run) {
  const app = createApp({ config: { corsOrigin: '*' }, logger: silentLogger });
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /api/health responds 200 with the exact health contract', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^application\/json/);

    const body = await response.json();

    assert.deepEqual(body, { status: 'ok', db: 'mongodb' });
    assert.deepEqual(body, HEALTH_PAYLOAD);
  });
});

test('unknown API routes answer 404 with a machine readable error code', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/does-not-exist`);

    assert.equal(response.status, 404);

    const body = await response.json();

    assert.equal(body.error.code, 'NOT_FOUND');
    assert.equal(body.error.message, 'Route GET /api/does-not-exist not found');
  });
});

test('POST /api/health is not accepted: the contract is read-only', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`, { method: 'POST' });

    assert.equal(response.status, 404);
  });
});
