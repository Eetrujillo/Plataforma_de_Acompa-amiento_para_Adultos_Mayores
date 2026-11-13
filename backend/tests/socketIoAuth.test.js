'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createSocketServer } = require('../src/config/socket');

const silentLogger = { error() {}, warn() {}, log() {} };

/**
 * Unit under test: the Socket.IO handshake gate.
 *
 * The client protocol is spoken directly over engine.io long-polling so the test
 * observes exactly what a real client would get, without adding a client dependency:
 *  0{...}            engine.io handshake (sid)
 *  40{...}           socket.io namespace connect accepted
 *  44{...}           connect_error (middleware rejected the handshake)
 *  42[...]           event delivered to this socket
 */

const CAREGIVER = { id: 'caregiver-1', role: 'CAREGIVER', email: 'c@example.com', sessionVersion: 1 };
const OTHER_CAREGIVER = { id: 'caregiver-2', role: 'CAREGIVER', email: 'o@example.com', sessionVersion: 1 };
const SENIOR = { id: 'senior-1', role: 'SENIOR', email: 's@example.com', sessionVersion: 1 };

async function withSocketServer({ users = [CAREGIVER, OTHER_CAREGIVER, SENIOR], tokens = {} }, run) {
  const httpServer = http.createServer((_req, res) => {
    res.writeHead(404).end();
  });

  const userRepository = {
    findById: async (id) => users.find((user) => user.id === id) ?? null
  };
  const verifyToken = (token) => {
    const claims = tokens[token];
    if (!claims) {
      throw new Error('invalid token');
    }
    return claims;
  };

  const io = createSocketServer(httpServer, { corsOrigin: '*' }, {
    verifyToken,
    userRepository,
    logger: silentLogger
  });

  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${httpServer.address().port}/socket.io/?EIO=4&transport=polling`;

  try {
    await run({ io, base });
  } finally {
    io.close();
    await new Promise((resolve) => httpServer.close(resolve));
  }
}

async function engineHandshake(base) {
  const response = await fetch(base);
  const body = await response.text();
  const sid = JSON.parse(body.slice(1)).sid;
  return { sid, body };
}

async function poll(base, sid, payload) {
  const response = await fetch(`${base}&sid=${sid}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: payload
  });
  return { status: response.status, body: await response.text() };
}

async function readPending(base, sid, waitMs = 300) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), waitMs);

  try {
    const response = await fetch(`${base}&sid=${sid}`, { signal: controller.signal });
    return await response.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function connect(base, authPayload) {
  const { sid } = await engineHandshake(base);
  const handshake = await poll(base, sid, `40${authPayload ? JSON.stringify(authPayload) : ''}`);
  return { sid, body: handshake.body + (await readPending(base, sid)) };
}

test('an anonymous socket is rejected before the room is joined', async () => {
  await withSocketServer({}, async ({ base }) => {
    // Legacy attack surface: the room used to be derived from this query parameter.
    const hostile = base.replace('/socket.io/?', '/socket.io/?caregiverId=caregiver-1&');
    const { sid } = await engineHandshake(hostile);
    const body = (await poll(hostile, sid, '40')).body + (await readPending(hostile, sid));

    assert.match(body, /44\{/, `el servidor tiene que rechazar la conexión anónima, recibí: ${body}`);
    assert.doesNotMatch(body, /40\{/, 'un cliente sin token no puede completar el connect');
  });
});

test('a socket with an invalid token is rejected', async () => {
  await withSocketServer({}, async ({ base }) => {
    const { body } = await connect(base, { token: 'nope' });
    assert.match(body, /44\{/, `token inválido tiene que dar connect_error, recibí: ${body}`);
  });
});

test('a SENIOR token cannot open the caregiver channel', async () => {
  await withSocketServer({ tokens: { 'senior-token': { sub: SENIOR.id, role: 'SENIOR', sv: 1 } } }, async ({ base }) => {
    const { body } = await connect(base, { token: 'senior-token' });
    assert.match(body, /44\{/, `un SENIOR no recibe alertas de cuidador, recibí: ${body}`);
  });
});

test('a revoked session token cannot open the socket', async () => {
  await withSocketServer({ tokens: { 'revoked-token': { sub: CAREGIVER.id, role: 'CAREGIVER', sv: 0 } } }, async ({ base }) => {
    const { body } = await connect(base, { token: 'revoked-token' });
    assert.match(body, /44\{/, `una sesión revocada no puede abrir el socket, recibí: ${body}`);
  });
});

test('a caregiver token joins its own room and receives its SOS alert', async () => {
  await withSocketServer({ tokens: { 'caregiver-token': { sub: CAREGIVER.id, role: 'CAREGIVER', sv: 1 } } }, async ({ io, base }) => {
    const { sid, body } = await connect(base, { token: 'caregiver-token' });

    assert.match(body, /40\{/, `un caregiver con token válido tiene que conectar, recibí: ${body}`);

    io.to(`caregiver:${CAREGIVER.id}`).emit('sos:triggered', { seniorName: 'Rosa', severity: 'HIGH' });

    const delivered = await readPending(base, sid);
    assert.match(delivered, /sos:triggered/, `el socket tiene que estar unido a caregiver:${CAREGIVER.id}, recibí: ${delivered}`);
    assert.match(delivered, /Rosa/, 'el payload de la alerta tiene que llegar completo');
  });
});

test('a caregiver cannot subscribe to another caregiver by query parameter', async () => {
  await withSocketServer({ tokens: { 'caregiver-token': { sub: CAREGIVER.id, role: 'CAREGIVER', sv: 1 } } }, async ({ io, base }) => {
    const hostile = base.replace('/socket.io/?', `/socket.io/?caregiverId=${OTHER_CAREGIVER.id}&`);
    const { sid } = await engineHandshake(hostile);
    const handshake = await poll(hostile, sid, `40${JSON.stringify({ token: 'caregiver-token' })}`);
    assert.match(handshake.body + (await readPending(hostile, sid)), /40\{/, 'el token válido tiene que conectar a pesar del query hostil');

    io.to(`caregiver:${OTHER_CAREGIVER.id}`).emit('sos:triggered', { seniorName: 'AJENA' });
    io.to(`caregiver:${CAREGIVER.id}`).emit('sos:triggered', { seniorName: 'PROPIA' });

    const delivered = await readPending(base, sid, 500);

    assert.match(delivered, /PROPIA/, `el cuidador tiene que recibir lo suyo, recibí: ${delivered}`);
    assert.doesNotMatch(delivered, /AJENA/, `el query parameter no puede cambiar de room, recibí: ${delivered}`);
  });
});

test('the socket server refuses to start without an injected verifier', () => {
  const httpServer = http.createServer();
  assert.throws(
    () => createSocketServer(httpServer, { corsOrigin: '*' }, {}),
    /requires|cannot start|verifyToken|userRepository/i,
    'sin auth inyectada el servidor de sockets tiene que fallar cerrado'
  );
});
