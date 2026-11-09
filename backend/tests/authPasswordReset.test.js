'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RequestPasswordReset
} = require('../src/modules/auth/application/RequestPasswordReset');
const {
  ResetPassword,
  INVALID_RESET_TOKEN_MESSAGE
} = require('../src/modules/auth/application/ResetPassword');
const { ResendThrottle } = require('../src/modules/auth/application/ResendThrottle');
const { hashToken } = require('../src/modules/auth/domain/verificationToken');
const {
  buildPasswordResetLink,
  PASSWORD_RESET_TTL_MINUTES
} = require('../src/modules/auth/domain/passwordResetToken');
const {
  ValidationError,
  TooManyRequestsError
} = require('../src/shared/errors');

const silentLogger = { info() {}, warn() {}, error() {} };

const CONFIG = Object.freeze({
  appUrl: 'http://localhost:3201',
  passwordReset: { ttlMinutes: 60 }
});

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const GOOD_PASSWORD = 'nueva-clave1';

function createClock(start = Date.parse('2024-05-01T12:00:00.000Z')) {
  let current = start;
  return {
    now: () => current,
    advance(ms) {
      current += ms;
    }
  };
}

function createFakeUserRepository(user = null) {
  const users = new Map(user ? [[user.id, user]] : []);

  return {
    users,
    async findByEmail(email) {
      return [...users.values()].find((candidate) => candidate.email === email) ?? null;
    },
    async findById(id) {
      return users.get(id) ?? null;
    },
    async updatePasswordAfterReset(id, { passwordHash }) {
      const stored = users.get(id);
      // Un reset exitoso también levanta el bloqueo de HU-003: quien demuestra que
      // controla el correo no puede quedar 15 minutos afuera por los fallos previos.
      const updated = { ...stored, passwordHash, failedLoginAttempts: 0, lockedUntil: null };
      users.set(id, updated);
      return updated;
    }
  };
}

function createFakeResetRepository() {
  const byHash = new Map();
  let counter = 0;

  return {
    byHash,
    async create({ userId, tokenHash, expiresAt }) {
      const record = { id: `reset-${(counter += 1)}`, userId, tokenHash, expiresAt, usedAt: null };
      byHash.set(tokenHash, record);
      return record;
    },
    async findByHash(tokenHash) {
      return byHash.get(tokenHash) ?? null;
    },
    async markUsed({ id }) {
      const record = [...byHash.values()].find((candidate) => candidate.id === id);

      // Contrato atómico: solo el primero en llegar se queda con el token.
      if (!record || record.usedAt) {
        return { claimed: false };
      }

      record.usedAt = new Date();
      return { claimed: true };
    },
    async invalidateForUser(userId) {
      for (const record of byHash.values()) {
        if (record.userId === userId && !record.usedAt) {
          record.usedAt = new Date();
        }
      }
    }
  };
}

function createFakeEmailSender() {
  const sent = [];

  return {
    sent,
    async sendPasswordResetEmail(payload) {
      sent.push(payload);
      return { delivered: true, channel: 'fake' };
    }
  };
}

const passwordHasher = {
  async hash(password) {
    return `hashed:${password}`;
  },
  async compare(password, hash) {
    return hash === `hashed:${password}`;
  }
};

function buildUser(overrides = {}) {
  return {
    id: 'user-1',
    email: 'cuidador@example.com',
    fullName: 'Esteban Trujillo',
    role: 'CAREGIVER',
    passwordHash: 'hashed:vieja-clave1',
    emailVerifiedAt: null,
    failedLoginAttempts: 5,
    lockedUntil: new Date('2030-01-01T00:00:00.000Z'),
    ...overrides
  };
}

function buildScenario({ user = buildUser(), clock = createClock() } = {}) {
  const userRepository = createFakeUserRepository(user);
  const resetRepository = createFakeResetRepository();
  const emailSender = createFakeEmailSender();
  const throttle = new ResendThrottle({
    maxAttempts: 3,
    windowMs: HOUR_MS,
    now: clock.now,
    message: 'Pediste demasiados enlaces de restablecimiento. Esperá unos minutos.'
  });

  return {
    clock,
    userRepository,
    resetRepository,
    emailSender,
    throttle,
    request: new RequestPasswordReset({
      userRepository,
      resetRepository,
      emailSender,
      throttle,
      config: CONFIG,
      logger: silentLogger,
      now: clock.now
    }),
    reset: new ResetPassword({
      userRepository,
      resetRepository,
      passwordHasher,
      config: CONFIG,
      now: clock.now
    })
  };
}

function tokenFromLastEmail(scenario) {
  const { link } = scenario.emailSender.sent[scenario.emailSender.sent.length - 1];
  return new URL(link).searchParams.get('token');
}

test('S1: con una cuenta existente responde la confirmación genérica y manda el enlace', async () => {
  const scenario = buildScenario();

  const result = await scenario.request.execute({ email: 'Cuidador@Example.com' });

  assert.deepEqual(result, { accepted: true });
  assert.equal(scenario.emailSender.sent.length, 1);

  const [payload] = scenario.emailSender.sent;
  assert.equal(payload.to, 'cuidador@example.com');
  assert.equal(payload.fullName, 'Esteban Trujillo');
  assert.equal(payload.expiresInMinutes, 60);
  assert.match(payload.link, /^http:\/\/localhost:3201\/reset-password\?token=[a-f0-9]{64}$/);
});

test('S1: con un correo desconocido responde exactamente lo mismo y no manda nada', async () => {
  const known = await buildScenario().request.execute({ email: 'cuidador@example.com' });
  const unknownScenario = buildScenario();
  const unknown = await unknownScenario.request.execute({ email: 'nadie@example.com' });

  assert.deepEqual(unknown, known);
  assert.deepEqual(unknown, { accepted: true });
  assert.equal(unknownScenario.emailSender.sent.length, 0);
});

test('S1: el cuarto pedido dentro de la hora responde 429, también para un correo sin cuenta', async () => {
  const scenario = buildScenario();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.deepEqual(await scenario.request.execute({ email: 'nadie@example.com' }), {
      accepted: true
    });
  }

  await assert.rejects(
    () => scenario.request.execute({ email: 'nadie@example.com' }),
    (error) =>
      error instanceof TooManyRequestsError &&
      error.statusCode === 429 &&
      typeof error.details.retryAfterSeconds === 'number'
  );
});

test('S1: un correo con formato inválido es 400 y no consume cupo', async () => {
  const scenario = buildScenario();

  await assert.rejects(
    () => scenario.request.execute({ email: 'no-es-un-correo' }),
    (error) => error instanceof ValidationError && error.code === 'VALIDATION_ERROR'
  );

  assert.equal(scenario.throttle.attempts.size, 0);
});

test('S2: el token tiene 64 hex, dura 60 minutos y solo se guarda su hash', async () => {
  const scenario = buildScenario();

  await scenario.request.execute({ email: 'cuidador@example.com' });

  const rawToken = tokenFromLastEmail(scenario);
  assert.match(rawToken, /^[a-f0-9]{64}$/);

  const [record] = [...scenario.resetRepository.byHash.values()];
  assert.equal(record.tokenHash, hashToken(rawToken));
  assert.notEqual(record.tokenHash, rawToken);
  assert.equal(
    record.expiresAt.getTime(),
    scenario.clock.now() + PASSWORD_RESET_TTL_MINUTES * MINUTE_MS
  );
});

test('S2: el enlace cambia la contraseña una sola vez y el segundo uso se rechaza', async () => {
  const scenario = buildScenario();
  await scenario.request.execute({ email: 'cuidador@example.com' });
  const rawToken = tokenFromLastEmail(scenario);

  const result = await scenario.reset.execute({ token: rawToken, password: GOOD_PASSWORD });

  assert.deepEqual(result, { reset: true });

  const stored = scenario.userRepository.users.get('user-1');
  assert.equal(stored.passwordHash, `hashed:${GOOD_PASSWORD}`);
  // El reset exitoso levanta el bloqueo de los intentos fallidos previos.
  assert.equal(stored.failedLoginAttempts, 0);
  assert.equal(stored.lockedUntil, null);

  await assert.rejects(
    () => scenario.reset.execute({ token: rawToken, password: 'otra-clave1' }),
    (error) => error instanceof ValidationError && error.message === INVALID_RESET_TOKEN_MESSAGE
  );
});

test('S2: pasados 60 minutos el enlace ya no sirve', async () => {
  const scenario = buildScenario();
  await scenario.request.execute({ email: 'cuidador@example.com' });
  const rawToken = tokenFromLastEmail(scenario);

  scenario.clock.advance(PASSWORD_RESET_TTL_MINUTES * MINUTE_MS + 1000);

  await assert.rejects(
    () => scenario.reset.execute({ token: rawToken, password: GOOD_PASSWORD }),
    (error) => error instanceof ValidationError && error.message === INVALID_RESET_TOKEN_MESSAGE
  );

  const stored = scenario.userRepository.users.get('user-1');
  assert.equal(stored.passwordHash, 'hashed:vieja-clave1');
});

test('S2: pedir un enlace nuevo quema el anterior', async () => {
  const scenario = buildScenario();
  await scenario.request.execute({ email: 'cuidador@example.com' });
  const firstToken = tokenFromLastEmail(scenario);

  await scenario.request.execute({ email: 'cuidador@example.com' });
  const secondToken = tokenFromLastEmail(scenario);

  await assert.rejects(
    () => scenario.reset.execute({ token: firstToken, password: GOOD_PASSWORD }),
    (error) => error instanceof ValidationError && error.message === INVALID_RESET_TOKEN_MESSAGE
  );

  assert.deepEqual(await scenario.reset.execute({ token: secondToken, password: GOOD_PASSWORD }), {
    reset: true
  });
});

test('S2: un token inventado, mal formado o vacío da el mismo error genérico', async () => {
  const scenario = buildScenario();

  for (const token of ['a'.repeat(64), 'no-es-un-token', '', undefined]) {
    await assert.rejects(
      () => scenario.reset.execute({ token, password: GOOD_PASSWORD }),
      (error) => error instanceof ValidationError && error.message === INVALID_RESET_TOKEN_MESSAGE,
      `token ${JSON.stringify(token)}`
    );
  }
});

test('S2: una contraseña débil se rechaza y no quema el enlace', async () => {
  const scenario = buildScenario();
  await scenario.request.execute({ email: 'cuidador@example.com' });
  const rawToken = tokenFromLastEmail(scenario);

  for (const weak of ['corta1', 'sinnumeros', '12345678']) {
    await assert.rejects(
      () => scenario.reset.execute({ token: rawToken, password: weak }),
      (error) => error instanceof ValidationError && error.code === 'VALIDATION_ERROR',
      `contraseña ${weak}`
    );
  }

  const [record] = [...scenario.resetRepository.byHash.values()];
  assert.equal(record.usedAt, null);

  assert.deepEqual(await scenario.reset.execute({ token: rawToken, password: GOOD_PASSWORD }), {
    reset: true
  });
});

test('S2: buildPasswordResetLink arma la ruta del frontend', () => {
  assert.equal(
    buildPasswordResetLink({ appUrl: 'https://app.example.com/', rawToken: 'abc123' }),
    'https://app.example.com/reset-password?token=abc123'
  );
});

test('S2: dos canjes simultáneos del mismo enlace: gana uno solo', async () => {
  const scenario = buildScenario();
  await scenario.request.execute({ email: 'cuidador@example.com' });
  const rawToken = tokenFromLastEmail(scenario);

  const outcomes = await Promise.allSettled([
    scenario.reset.execute({ token: rawToken, password: 'atacante-clave1' }),
    scenario.reset.execute({ token: rawToken, password: 'victima-clave9' })
  ]);

  const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
  const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');

  assert.equal(fulfilled.length, 1, 'solo un pedido puede canjear el enlace');
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.message, INVALID_RESET_TOKEN_MESSAGE);

  // La contraseña que queda es la del ganador, no la del último que escribió.
  const winner = fulfilled[0].value;
  assert.deepEqual(winner, { reset: true });
  assert.equal(
    new Set([...scenario.userRepository.users.values()].map((user) => user.passwordHash)).size,
    1
  );
});

test('S2: si consumir el token falla, la contraseña no se toca', async () => {
  const scenario = buildScenario();
  await scenario.request.execute({ email: 'cuidador@example.com' });
  const rawToken = tokenFromLastEmail(scenario);

  scenario.resetRepository.markUsed = async () => {
    throw new Error('fallo transitorio de escritura');
  };

  await assert.rejects(() => scenario.reset.execute({ token: rawToken, password: GOOD_PASSWORD }));

  const stored = scenario.userRepository.users.get('user-1');
  assert.equal(stored.passwordHash, 'hashed:vieja-clave1');
  assert.equal(stored.lockedUntil !== undefined, true);
});

test('S2: la vigencia sale de la config, no de un 60 escrito a mano', async () => {
  const clock = createClock();
  const userRepository = createFakeUserRepository(buildUser());
  const resetRepository = createFakeResetRepository();
  const emailSender = createFakeEmailSender();

  const request = new RequestPasswordReset({
    userRepository,
    resetRepository,
    emailSender,
    throttle: new ResendThrottle({ now: clock.now }),
    config: { appUrl: 'http://localhost:3201', passwordReset: { ttlMinutes: 15 } },
    logger: silentLogger,
    now: clock.now
  });

  await request.execute({ email: 'cuidador@example.com' });

  const [record] = [...resetRepository.byHash.values()];
  assert.equal(record.expiresAt.getTime(), clock.now() + 15 * MINUTE_MS);
});

test('S1/S2: el contrato HTTP real de las dos rutas nuevas', async () => {
  const http = require('node:http');
  const { createApp } = require('../src/app');
  const { createAuthController } = require('../src/modules/auth/infrastructure/AuthController');
  const { createAuthRouter } = require('../src/modules/auth/infrastructure/authRoutes');

  const scenario = buildScenario();

  const unreachable = (name) => ({
    execute: async () => {
      throw new Error(`${name} is not part of HU-004`);
    }
  });

  const controller = createAuthController({
    registerCaregiver: unreachable('registerCaregiver'),
    login: unreachable('login'),
    getCurrentUser: unreachable('getCurrentUser'),
    verifyEmail: unreachable('verifyEmail'),
    resendVerificationEmail: unreachable('resendVerificationEmail'),
    requestPasswordReset: scenario.request,
    resetPassword: scenario.reset
  });

  const router = createAuthRouter({ controller, authMiddleware: (_req, _res, next) => next() });
  const app = createApp({
    config: { corsOrigin: '*' },
    modules: { auth: router },
    logger: silentLogger
  });
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/api/auth`;

  async function post(path, body) {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  }

  try {
    await scenario.request.execute({ email: 'cuidador@example.com' });
    const rawToken = tokenFromLastEmail(scenario);

    const known = await post('/forgot-password', { email: 'cuidador@example.com' });
    const unknown = await post('/forgot-password', { email: 'nadie@example.com' });

    assert.equal(known.status, 202);
    assert.deepEqual(known.body, { accepted: true });
    assert.deepEqual(unknown, known);

    const garbage = await post('/reset-password', { token: 'x'.repeat(64), password: 'otra-clave1' });
    assert.equal(garbage.status, 400);
    assert.equal(garbage.body.error.message, INVALID_RESET_TOKEN_MESSAGE);

    // El enlace del último correo sigue vigente: el pedido de "nadie@example.com" no lo quemó.
    const currentToken = tokenFromLastEmail(scenario);
    const ok = await post('/reset-password', { token: currentToken, password: 'otra-clave1' });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { reset: true });

    const reuse = await post('/reset-password', { token: currentToken, password: 'otra-clave2' });
    assert.equal(reuse.status, 400);
    assert.equal(reuse.body.error.message, INVALID_RESET_TOKEN_MESSAGE);

    assert.ok(rawToken.length === 64);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
