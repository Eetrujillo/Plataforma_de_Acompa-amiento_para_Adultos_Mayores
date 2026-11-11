'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { buildApplication } = require('../src/server');
const { createErrorHandler } = require('../src/shared/middlewares/errorHandler');

test('socket.io es duenio de /socket.io y Express no lo atiende', async (t) => {
  const { httpServer, io } = buildApplication();
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    io.close();
    httpServer.close();
  });

  const port = httpServer.address().port;
  const response = await fetch('http://127.0.0.1:' + port + '/socket.io/?EIO=4&transport=polling');
  const body = await response.text();

  assert.equal(response.status, 200, 'el handshake de engine.io tiene que responder 200');
  assert.equal(response.headers.get('x-request-id'), null, 'Express no debe procesar /socket.io');
  assert.match(body, /^0\{/, 'el cuerpo tiene que ser el handshake de engine.io');
});

test('el errorHandler no vuelve a responder cuando los headers ya salieron', async (t) => {
  const logger = { error() { throw new Error('no deberia loguear un 5xx aca'); }, warn() {}, log() {} };
  const app = express();

  app.get('/boom', (_req, res, next) => {
    res.status(200).send('primera respuesta');
    next(new Error('error posterior a la respuesta'));
  });
  app.use(createErrorHandler({ logger }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const port = server.address().port;
  const response = await fetch('http://127.0.0.1:' + port + '/boom');

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'primera respuesta');
});
