'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createRequestContext } = require('../src/shared/middlewares/requestContext');

const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

async function withContextServer(run) {
  const app = express();
  app.use(createRequestContext());
  app.get('/id', (req, res) => {
    res.status(200).json({ id: req.id });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('a safe client supplied X-Request-Id is echoed back', async () => {
  await withContextServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/id`, {
      headers: { 'X-Request-Id': 'client-request-1234' }
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-request-id'), 'client-request-1234');

    const body = await response.json();

    assert.equal(body.id, 'client-request-1234');
  });
});

test('a missing X-Request-Id is generated and always answered', async () => {
  await withContextServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/id`);
    const headerId = response.headers.get('x-request-id');

    assert.match(headerId, SAFE_ID);

    const body = await response.json();

    assert.equal(body.id, headerId);
  });
});

test('hostile X-Request-Id values are replaced by a generated id', async () => {
  const hostile = ['short', 'has spaces', 'x'.repeat(200), 'semi;colon', '../traversal'];

  await withContextServer(async (baseUrl) => {
    for (const value of hostile) {
      const response = await fetch(`${baseUrl}/id`, {
        headers: { 'X-Request-Id': value }
      });
      const headerId = response.headers.get('x-request-id');

      assert.match(headerId, SAFE_ID, `hostile value ${value} was not replaced`);
      assert.notEqual(headerId, value);
    }
  });
});

test('generated ids differ per request', async () => {
  await withContextServer(async (baseUrl) => {
    const first = await fetch(`${baseUrl}/id`);
    const second = await fetch(`${baseUrl}/id`);

    assert.notEqual(first.headers.get('x-request-id'), second.headers.get('x-request-id'));
  });
});
