'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../src/app');
const { createAuthController } = require('../src/modules/auth/infrastructure/AuthController');
const { createAuthRouter } = require('../src/modules/auth/infrastructure/authRoutes');
const { LoginWithGoogle } = require('../src/modules/auth/application/LoginWithGoogle');
const { GoogleIdTokenVerifier } = require('../src/modules/auth/infrastructure/GoogleIdTokenVerifier');

const silentLogger = { info() {}, warn() {}, error() {}, log() {} };

const CLIENT_ID = 'cliente-de-prueba.apps.googleusercontent.com';

const CONFIG = Object.freeze({
  appUrl: 'http://localhost:3201',
  google: Object.freeze({ clientId: CLIENT_ID })
});

// Any internal detail that leaks into a response body shows up here.
const INTERNALS = /node_modules|at Object\.|at async|\.js:\d+|verifyIdToken|Error:/i;

function createFakeUserRepository({ users = [] } = {}) {
  const byId = new Map();
  let counter = 0;

  for (const user of users) {
    const id = user.id ?? `user-${(counter += 1)}`;
    byId.set(id, { emailVerifiedAt: null, role: 'CAREGIVER', createdAt: new Date(), ...user, id });
  }

  return {
    users: byId,
    calls: { findByEmail: 0, markEmailVerified: 0, create: 0 },
    async findByEmail(email) {
      this.calls.findByEmail += 1;
      return [...byId.values()].find((user) => user.email === email) ?? null;
    },
    async findById(id) {
      return byId.get(id) ?? null;
    },
    async create() {
      this.calls.create += 1;
      throw new Error('Google login must never create accounts');
    },
    async markEmailVerified(id) {
      this.calls.markEmailVerified += 1;
      const user = byId.get(id);
      user.emailVerifiedAt = new Date();
      return user;
    }
  };
}

function createFakeIdTokenVerifier({ payloadByToken = {}, errorByToken = {} } = {}) {
  const calls = [];

  return {
    calls,
    async verify({ idToken, audience }) {
      calls.push({ idToken, audience });

      const error = errorByToken[idToken];
      if (error) {
        throw error;
      }

      const payload = payloadByToken[idToken];
      if (!payload) {
        // Deliberately noisy: the response must mask it anyway.
        throw new Error(
          'Token used too late: 1234567890. at OAuth2Client.verifyIdToken (/app/node_modules/google-auth-library/build/src/auth/oauth2client.js:123:45)'
        );
      }

      return payload;
    }
  };
}

function buildScenario({ clientId = CLIENT_ID, users = [], verifier } = {}) {
  const userRepository = createFakeUserRepository({ users });
  const idTokenVerifier = verifier ?? createFakeIdTokenVerifier();

  const unreachable = (name) => ({ async execute() { throw new Error(`${name} is not part of T2`); } });
  const tokenService = {
    sign: (payload) => `jwt:${payload.sub}:${payload.role}`,
    verify: () => ({})
  };

  const controller = createAuthController({
    registerCaregiver: unreachable('registerCaregiver'),
    login: unreachable('login'),
    getCurrentUser: unreachable('getCurrentUser'),
    verifyEmail: unreachable('verifyEmail'),
    resendVerificationEmail: unreachable('resendVerificationEmail'),
    loginWithGoogle: new LoginWithGoogle({
      userRepository,
      tokenService,
      idTokenVerifier,
      config: { ...CONFIG, google: { clientId } }
    }),
    googleConfig: { enabled: Boolean(clientId), clientId: clientId || null }
  });

  const router = createAuthRouter({ controller, authMiddleware: (_req, _res, next) => next() });

  return { userRepository, idTokenVerifier, router };
}

async function withAuthServer(scenario, run) {
  const app = createApp({
    config: { corsOrigin: '*' },
    modules: { auth: scenario.router },
    logger: silentLogger
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

async function postGoogle(baseUrl, body) {
  const response = await fetch(`${baseUrl}/api/auth/google`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  return { status: response.status, body: await response.json() };
}

async function getGoogleConfig(baseUrl) {
  const response = await fetch(`${baseUrl}/api/auth/google/config`);

  return { status: response.status, body: await response.json() };
}

function assertNoInternals(body) {
  assert.doesNotMatch(JSON.stringify(body), INTERNALS);
}

const EXISTING_USER = Object.freeze({
  id: 'user-1',
  email: 'user@example.com',
  fullName: 'Esteban Trujillo',
  role: 'CAREGIVER',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  emailVerifiedAt: new Date('2024-01-02T00:00:00.000Z')
});

test('S7 - un id_token válido de una cuenta existente responde 200 con JWT y usuario', async () => {
  const verifier = createFakeIdTokenVerifier({
    payloadByToken: { 'token-valido': { email: 'user@example.com', email_verified: true } }
  });
  const scenario = buildScenario({ users: [EXISTING_USER], verifier });

  await withAuthServer(scenario, async (baseUrl) => {
    const { status, body } = await postGoogle(baseUrl, { idToken: 'token-valido' });

    assert.equal(status, 200);
    assert.equal(body.token, 'jwt:user-1:CAREGIVER');
    assert.equal(body.user.id, 'user-1');
    assert.equal(body.user.email, 'user@example.com');
    assert.equal(body.user.fullName, 'Esteban Trujillo');
    assert.equal(body.user.role, 'CAREGIVER');
    assert.equal('passwordHash' in body.user, false);
  });

  assert.equal(scenario.userRepository.calls.create, 0);
});

test('S8 - un correo de Google sin cuenta responde 404 EMAIL_NOT_REGISTERED sin crear nada', async () => {
  const verifier = createFakeIdTokenVerifier({
    payloadByToken: { 'token-desconocido': { email: 'nadie@example.com', email_verified: true } }
  });
  const scenario = buildScenario({ users: [EXISTING_USER], verifier });

  await withAuthServer(scenario, async (baseUrl) => {
    const { status, body } = await postGoogle(baseUrl, { idToken: 'token-desconocido' });

    assert.equal(status, 404);
    assert.equal(body.error.code, 'EMAIL_NOT_REGISTERED');
    assert.equal(body.error.message, 'Este correo no tiene una cuenta en la plataforma');
    assert.equal('token' in body, false);
    assertNoInternals(body);
  });

  assert.equal(scenario.userRepository.users.size, 1);
  assert.equal(scenario.userRepository.calls.create, 0);
});

test('S9 - un token que falla la verificación responde 401 sin detalles internos', async () => {
  const verifier = createFakeIdTokenVerifier({
    errorByToken: {
      'token-vencido': new Error('Token used too late at /app/node_modules/google-auth-library/build/src/auth/oauth2client.js:123')
    }
  });
  const scenario = buildScenario({ users: [EXISTING_USER], verifier });

  await withAuthServer(scenario, async (baseUrl) => {
    const { status, body } = await postGoogle(baseUrl, { idToken: 'token-vencido' });

    assert.equal(status, 401);
    assert.equal(body.error.code, 'UNAUTHORIZED');
    assert.equal('token' in body, false);
    assert.equal('user' in body, false);
    assertNoInternals(body);
  });

  assert.equal(scenario.userRepository.calls.markEmailVerified, 0);
});

test('S9 - un token emitido para otro client_id responde 401', async () => {
  // The fake mirrors Google: it rejects when the audience it receives is not the token's.
  const verifier = {
    calls: [],
    async verify({ idToken, audience }) {
      this.calls.push({ idToken, audience });
      if (audience !== 'otro-cliente.apps.googleusercontent.com') {
        throw new Error('Wrong recipient, payload audience != requiredAudience');
      }
      return { email: 'user@example.com', email_verified: true };
    }
  };
  const scenario = buildScenario({ users: [EXISTING_USER], verifier });

  await withAuthServer(scenario, async (baseUrl) => {
    const { status, body } = await postGoogle(baseUrl, { idToken: 'token-de-otro-cliente' });

    assert.equal(status, 401);
    assert.equal(body.error.code, 'UNAUTHORIZED');
    assert.equal('token' in body, false);
    assertNoInternals(body);
  });

  assert.equal(scenario.userRepository.calls.markEmailVerified, 0);
});

test('S9 - un token sin correo responde 401', async () => {
  const verifier = createFakeIdTokenVerifier({
    payloadByToken: {
      'token-sin-correo': { email_verified: true },
      'token-correo-vacio': { email: '   ', email_verified: true }
    }
  });
  const scenario = buildScenario({ users: [EXISTING_USER], verifier });

  await withAuthServer(scenario, async (baseUrl) => {
    for (const idToken of ['token-sin-correo', 'token-correo-vacio']) {
      const { status, body } = await postGoogle(baseUrl, { idToken });

      assert.equal(status, 401, `rejected: ${idToken}`);
      assert.equal(body.error.code, 'UNAUTHORIZED');
      assert.equal('token' in body, false);
      assertNoInternals(body);
    }
  });
});

test('S7 - sin idToken, vacío o no string responde 400 VALIDATION_ERROR', async () => {
  const scenario = buildScenario({ users: [EXISTING_USER] });

  await withAuthServer(scenario, async (baseUrl) => {
    for (const body of [{}, { idToken: '' }, { idToken: '   ' }, { idToken: 42 }, { idToken: null }]) {
      const { status, body: responseBody } = await postGoogle(baseUrl, body);

      assert.equal(status, 400, `rejected: ${JSON.stringify(body)}`);
      assert.equal(responseBody.error.code, 'VALIDATION_ERROR');
      assertNoInternals(responseBody);
    }
  });

  assert.equal(scenario.idTokenVerifier.calls.length, 0);
});

test('S11 - sin GOOGLE_CLIENT_ID el login responde 503 GOOGLE_NOT_CONFIGURED', async () => {
  const verifier = createFakeIdTokenVerifier({
    payloadByToken: { 'token-valido': { email: 'user@example.com', email_verified: true } }
  });
  const scenario = buildScenario({ clientId: '', users: [EXISTING_USER], verifier });

  await withAuthServer(scenario, async (baseUrl) => {
    const { status, body } = await postGoogle(baseUrl, { idToken: 'token-valido' });

    assert.equal(status, 503);
    assert.equal(body.error.code, 'GOOGLE_NOT_CONFIGURED');
    assert.equal('token' in body, false);
    assertNoInternals(body);
  });

  assert.equal(verifier.calls.length, 0);
  assert.equal(scenario.userRepository.calls.findByEmail, 0);
});

test('S10 - una cuenta sin verificar queda verificada al ingresar con Google', async () => {
  const unverified = { ...EXISTING_USER, emailVerifiedAt: null };
  const verifier = createFakeIdTokenVerifier({
    payloadByToken: { 'token-valido': { email: 'user@example.com', email_verified: true } }
  });
  const scenario = buildScenario({ users: [unverified], verifier });

  await withAuthServer(scenario, async (baseUrl) => {
    const { status, body } = await postGoogle(baseUrl, { idToken: 'token-valido' });

    assert.equal(status, 200);
    assert.equal(body.user.emailVerified, true);
  });

  const stored = await scenario.userRepository.findByEmail('user@example.com');
  assert.equal(stored.emailVerifiedAt instanceof Date, true);
  assert.equal(scenario.userRepository.calls.markEmailVerified, 1);
});

test('S7 - el correo del token matchea sin distinguir mayúsculas', async () => {
  const verifier = createFakeIdTokenVerifier({
    payloadByToken: { 'token-mayusculas': { email: 'User@Example.com', email_verified: true } }
  });
  const scenario = buildScenario({ users: [EXISTING_USER], verifier });

  await withAuthServer(scenario, async (baseUrl) => {
    const { status, body } = await postGoogle(baseUrl, { idToken: 'token-mayusculas' });

    assert.equal(status, 200);
    assert.equal(body.user.email, 'user@example.com');
  });
});

test('S11 - el verificador recibe el client_id configurado como audience', async () => {
  const verifier = createFakeIdTokenVerifier({
    payloadByToken: { 'token-valido': { email: 'user@example.com', email_verified: true } }
  });
  const scenario = buildScenario({ users: [EXISTING_USER], verifier });

  await withAuthServer(scenario, async (baseUrl) => {
    const { status } = await postGoogle(baseUrl, { idToken: 'token-valido' });

    assert.equal(status, 200);
  });

  assert.equal(verifier.calls.length, 1);
  assert.equal(verifier.calls[0].audience, CLIENT_ID);
  assert.equal(verifier.calls[0].idToken, 'token-valido');
});

test('el adaptador real de Google se construye sin argumentos y manda el audience al cliente OAuth', async () => {
  const calls = [];
  const client = {
    async verifyIdToken(params) {
      calls.push(params);
      return { getPayload: () => ({ email: 'user@example.com', email_verified: true }) };
    }
  };

  // The composition root builds it with no arguments; a crash here would only show at boot.
  const withoutClient = new GoogleIdTokenVerifier();
  assert.equal(typeof withoutClient.verify, 'function');

  const verifier = new GoogleIdTokenVerifier({ client });
  const identity = await verifier.verify({ idToken: 'token', audience: CLIENT_ID });

  assert.deepEqual(calls, [{ idToken: 'token', audience: CLIENT_ID }]);
  assert.deepEqual(identity, { email: 'user@example.com', emailVerified: true });
});

test('S11 - GET /api/auth/google/config expone enabled y clientId sin secretos', async () => {
  const enabled = buildScenario({ users: [EXISTING_USER] });

  await withAuthServer(enabled, async (baseUrl) => {
    const { status, body } = await getGoogleConfig(baseUrl);

    assert.equal(status, 200);
    assert.deepEqual(body, { enabled: true, clientId: CLIENT_ID });
  });

  const disabled = buildScenario({ clientId: '', users: [EXISTING_USER] });

  await withAuthServer(disabled, async (baseUrl) => {
    const { status, body } = await getGoogleConfig(baseUrl);

    assert.equal(status, 200);
    assert.deepEqual(body, { enabled: false, clientId: null });
  });
});

test('S10 - un token con el correo sin certificar por Google no inicia sesión ni marca verificado', async () => {
  const verifier = createFakeIdTokenVerifier({
    payloadByToken: {
      'token-sin-certificar': { email: 'user@example.com', emailVerified: false }
    }
  });
  const scenario = buildScenario({ users: [{ ...EXISTING_USER, emailVerifiedAt: null }], verifier });

  await withAuthServer(scenario, async (baseUrl) => {
    const { status, body } = await postGoogle(baseUrl, { idToken: 'token-sin-certificar' });

    assert.equal(status, 401);
    assert.equal(body.error.code, 'UNAUTHORIZED');
    assert.equal('token' in body, false);
  });

  assert.equal(scenario.userRepository.calls.markEmailVerified, 0);
  assert.equal(scenario.userRepository.calls.create, 0);
});
