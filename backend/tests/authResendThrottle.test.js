'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../src/app');
const { createAuthController } = require('../src/modules/auth/infrastructure/AuthController');
const { createAuthRouter } = require('../src/modules/auth/infrastructure/authRoutes');
const { RegisterCaregiver } = require('../src/modules/auth/application/RegisterCaregiver');
const {
  ResendVerificationEmail
} = require('../src/modules/auth/application/ResendVerificationEmail');
const {
  ResendThrottle,
  RESEND_THROTTLE_MESSAGE
} = require('../src/modules/auth/application/ResendThrottle');
const { TooManyRequestsError } = require('../src/shared/errors');

const silentLogger = { info() {}, warn() {}, error() {}, log() {} };

const CONFIG = Object.freeze({
  appUrl: 'http://localhost:3201',
  verification: { ttlHours: 24 },
  terms: { version: '1.0' }
});

const HOUR_MS = 60 * 60 * 1000;

const VALID_REGISTRATION = Object.freeze({
  email: 'Cuidador@Example.com',
  password: 'secreto-largo1',
  fullName: 'Esteban Trujillo',
  phone: '+54 11 5555 1234',
  acceptedTerms: true
});

function createFakeUserRepository() {
  const users = new Map();
  const lookups = [];
  let counter = 0;

  return {
    users,
    lookups,
    async findByEmail(email) {
      lookups.push(email);
      return [...users.values()].find((user) => user.email === email) ?? null;
    },
    async findById(id) {
      return users.get(id) ?? null;
    },
    async create(data) {
      const id = `user-${(counter += 1)}`;
      const user = { id, createdAt: new Date(), emailVerifiedAt: null, ...data };
      users.set(id, user);
      return user;
    },
    async markEmailVerified(id) {
      const user = users.get(id);
      user.emailVerifiedAt = new Date();
      return user;
    }
  };
}

function createFakeVerificationRepository() {
  const records = [];
  let counter = 0;

  return {
    records,
    async create({ userId, tokenHash, expiresAt }) {
      const record = { id: `token-${(counter += 1)}`, userId, tokenHash, expiresAt, usedAt: null };
      records.push(record);
      return record;
    },
    async markUsed({ id }) {
      const record = records.find((candidate) => candidate.id === id);
      record.usedAt = new Date();
      return record;
    },
    async invalidateForUser(userId) {
      for (const record of records) {
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
    async sendVerificationEmail(payload) {
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

/**
 * A controllable clock: the sliding window is business logic, so it must be provable
 * without sleeping.
 */
function createClock(start = Date.parse('2024-05-01T12:00:00.000Z')) {
  let current = start;

  return {
    now: () => current,
    advance(ms) {
      current += ms;
    }
  };
}

function buildScenario({ clock = createClock(), throttleOptions = {} } = {}) {
  const userRepository = createFakeUserRepository();
  const verificationRepository = createFakeVerificationRepository();
  const emailSender = createFakeEmailSender();

  const throttle = new ResendThrottle({
    maxAttempts: 3,
    windowMs: HOUR_MS,
    now: clock.now,
    ...throttleOptions
  });

  return {
    clock,
    userRepository,
    verificationRepository,
    emailSender,
    throttle,
    register: new RegisterCaregiver({
      userRepository,
      passwordHasher,
      verificationRepository,
      emailSender,
      config: CONFIG,
      logger: silentLogger
    }),
    resend: new ResendVerificationEmail({
      userRepository,
      verificationRepository,
      emailSender,
      config: CONFIG,
      logger: silentLogger,
      resendThrottle: throttle
    })
  };
}

function assertThrottled(error) {
  assert.ok(error instanceof TooManyRequestsError, `se esperaba TooManyRequestsError, llegó ${error?.name}`);
  assert.equal(error.statusCode, 429);
  assert.equal(error.code, 'TOO_MANY_REQUESTS');
  assert.equal(error.message, RESEND_THROTTLE_MESSAGE);
  assert.equal(typeof error.details?.retryAfterSeconds, 'number');
  assert.ok(error.details.retryAfterSeconds > 0);
  assert.ok(error.details.retryAfterSeconds <= HOUR_MS / 1000);
  return true;
}

test('el cuarto reenvío dentro de la hora responde 429 y no vuelve a enviar correo', async () => {
  const scenario = buildScenario();
  await scenario.register.execute(VALID_REGISTRATION);
  assert.equal(scenario.emailSender.sent.length, 1);

  for (const attempt of [1, 2, 3]) {
    assert.deepEqual(await scenario.resend.execute({ email: 'cuidador@example.com' }), {
      accepted: true
    });
    assert.equal(scenario.emailSender.sent.length, attempt + 1);
  }

  await assert.rejects(
    () => scenario.resend.execute({ email: 'cuidador@example.com' }),
    assertThrottled
  );

  // El intento bloqueado no puede además disparar un envío: son 1 registro + 3 reenvíos.
  assert.equal(scenario.emailSender.sent.length, 4);
});

test('pasada la ventana de una hora el reenvío vuelve a estar permitido', async () => {
  const scenario = buildScenario();
  await scenario.register.execute(VALID_REGISTRATION);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await scenario.resend.execute({ email: 'cuidador@example.com' });
  }

  await assert.rejects(() => scenario.resend.execute({ email: 'cuidador@example.com' }), assertThrottled);

  scenario.clock.advance(HOUR_MS + 1);

  assert.deepEqual(await scenario.resend.execute({ email: 'cuidador@example.com' }), {
    accepted: true
  });
  assert.equal(scenario.emailSender.sent.length, 5);
});

test('la clave del contador ignora mayúsculas y espacios del correo', async () => {
  const scenario = buildScenario();
  await scenario.register.execute(VALID_REGISTRATION);

  await scenario.resend.execute({ email: 'cuidador@example.com' });
  await scenario.resend.execute({ email: 'Cuidador@Example.com' });
  await scenario.resend.execute({ email: '  CUIDADOR@EXAMPLE.COM  ' });

  await assert.rejects(
    () => scenario.resend.execute({ email: 'cUiDaDoR@eXaMpLe.CoM' }),
    assertThrottled
  );
});

test('un correo desconocido se bloquea igual: el 429 no revela si la cuenta existe', async () => {
  const scenario = buildScenario();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.deepEqual(await scenario.resend.execute({ email: 'nadie@example.com' }), {
      accepted: true
    });
  }
  assert.equal(scenario.emailSender.sent.length, 0);

  let unknownError;
  await assert.rejects(
    () => scenario.resend.execute({ email: 'nadie@example.com' }),
    (error) => {
      unknownError = error;
      return assertThrottled(error);
    }
  );

  // Mismo error para una cuenta real que para una inexistente: sin oráculo de existencia.
  await scenario.register.execute(VALID_REGISTRATION);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await scenario.resend.execute({ email: 'cuidador@example.com' });
  }

  await assert.rejects(
    () => scenario.resend.execute({ email: 'cuidador@example.com' }),
    (error) => {
      assert.equal(error.name, unknownError.name);
      assert.equal(error.statusCode, unknownError.statusCode);
      assert.equal(error.code, unknownError.code);
      assert.equal(error.message, unknownError.message);
      return assertThrottled(error);
    }
  );
});

test('un intento bloqueado no alarga la ventana', async () => {
  const scenario = buildScenario();
  await scenario.register.execute(VALID_REGISTRATION);

  await scenario.resend.execute({ email: 'cuidador@example.com' });
  await scenario.resend.execute({ email: 'cuidador@example.com' });
  await scenario.resend.execute({ email: 'cuidador@example.com' });

  // Casi al borde: bloqueado, pero el bloqueo no debe contar como intento.
  scenario.clock.advance(HOUR_MS - 60 * 1000);
  await assert.rejects(() => scenario.resend.execute({ email: 'cuidador@example.com' }), assertThrottled);

  // Un minuto después cae el primer intento de la ventana y vuelve a haber cupo.
  scenario.clock.advance(2 * 60 * 1000);
  assert.deepEqual(await scenario.resend.execute({ email: 'cuidador@example.com' }), {
    accepted: true
  });
});

test('el endpoint de reenvío responde 429 con el contrato de errores del backend', async () => {
  const scenario = buildScenario({ clock: createClock(Date.now()) });

  const controller = createAuthController({
    registerCaregiver: scenario.register,
    login: { execute: async () => ({}) },
    getCurrentUser: { execute: async () => ({}) },
    verifyEmail: { execute: async () => ({}) },
    resendVerificationEmail: scenario.resend
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

  async function postResend(email) {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/resend-verification`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email })
    });
    return { status: response.status, body: await response.json() };
  }

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      assert.equal((await postResend('cuidador@example.com')).status, 202);
    }

    const blocked = await postResend('cuidador@example.com');

    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'TOO_MANY_REQUESTS');
    assert.equal(blocked.body.error.message, RESEND_THROTTLE_MESSAGE);
    assert.ok(blocked.body.error.details.retryAfterSeconds > 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('el mensaje del 429 es el que documenta docs/auth-api.md', () => {
  const throttle = new ResendThrottle({ maxAttempts: 1, windowMs: HOUR_MS, now: () => 0 });
  throttle.consume('cuidador@example.com');

  // Literal on purpose: comparing against the module constant would let the message
  // drift away from the documented contract without any test noticing.
  assert.throws(
    () => throttle.consume('cuidador@example.com'),
    (error) =>
      error.statusCode === 429 &&
      error.code === 'TOO_MANY_REQUESTS' &&
      error.message ===
        'Pediste demasiados enlaces de verificación. Esperá unos minutos antes de pedir otro.' &&
      error.details.retryAfterSeconds === 3600
  );
});

test('un correo con formato inválido responde 400 y no consume cupo', async () => {
  const scenario = buildScenario();

  for (const invalid of ['no-es-mail', 'a@b', '', '   ']) {
    await assert.rejects(
      () => scenario.resend.execute({ email: invalid }),
      (error) => error.code === 'VALIDATION_ERROR'
    );
  }

  assert.equal(scenario.throttle.attempts.size, 0);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.deepEqual(await scenario.resend.execute({ email: 'cuidador@example.com' }), {
      accepted: true
    });
  }

  await assert.rejects(
    () => scenario.resend.execute({ email: 'cuidador@example.com' }),
    assertThrottled
  );
});

test('una cuenta ya verificada consume cupo y no recibe correo', async () => {
  const scenario = buildScenario();
  await scenario.register.execute(VALID_REGISTRATION);

  const [user] = [...scenario.userRepository.users.values()];
  await scenario.userRepository.markEmailVerified(user.id);
  const sentAfterRegister = scenario.emailSender.sent.length;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.deepEqual(await scenario.resend.execute({ email: 'cuidador@example.com' }), {
      accepted: true
    });
  }

  await assert.rejects(
    () => scenario.resend.execute({ email: 'cuidador@example.com' }),
    assertThrottled
  );

  assert.equal(scenario.emailSender.sent.length, sentAfterRegister);
});

test('el intento bloqueado no consulta el repositorio de usuarios', async () => {
  const scenario = buildScenario();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await scenario.resend.execute({ email: 'nadie@example.com' });
  }

  const lookupsBefore = scenario.userRepository.lookups.length;

  await assert.rejects(
    () => scenario.resend.execute({ email: 'nadie@example.com' }),
    assertThrottled
  );

  // El 429 se decide sin tocar la base: no hay nada que pueda delatar si la cuenta existe.
  assert.equal(scenario.userRepository.lookups.length, lookupsBefore);
});

test('un flood de correos inventados no revive el cupo de un correo bloqueado', async () => {
  const scenario = buildScenario({ throttleOptions: { maxKeys: 4 } });
  await scenario.register.execute(VALID_REGISTRATION);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await scenario.resend.execute({ email: 'cuidador@example.com' });
  }

  // Con el store lleno de ventanas vivas se falla cerrado: la clave nueva se rechaza
  // en lugar de expulsar el contador de alguien más.
  for (let index = 0; index < 3; index += 1) {
    assert.deepEqual(
      await scenario.resend.execute({ email: `inventado${index}@example.com` }),
      { accepted: true }
    );
  }

  await assert.rejects(
    () => scenario.resend.execute({ email: 'inventado3@example.com' }),
    assertThrottled
  );

  await assert.rejects(
    () => scenario.resend.execute({ email: 'cuidador@example.com' }),
    assertThrottled
  );
});

test('un valor malformado en el entorno no desactiva el límite', () => {
  const ENV_PATH = require.resolve('../src/config/env');
  const originalMax = process.env.RESEND_THROTTLE_MAX;
  const originalWindow = process.env.RESEND_THROTTLE_WINDOW_MINUTES;

  function load(max, window) {
    if (max === undefined) {
      delete process.env.RESEND_THROTTLE_MAX;
    } else {
      process.env.RESEND_THROTTLE_MAX = max;
    }

    if (window === undefined) {
      delete process.env.RESEND_THROTTLE_WINDOW_MINUTES;
    } else {
      process.env.RESEND_THROTTLE_WINDOW_MINUTES = window;
    }

    delete require.cache[ENV_PATH];
    return require(ENV_PATH).resendThrottle;
  }

  try {
    assert.deepEqual(load(undefined, undefined), { maxAttempts: 3, windowMinutes: 60 });

    for (const malformed of ['0', '-5', 'abc', '', '3.9']) {
      assert.deepEqual(
        load(malformed, 'abc'),
        { maxAttempts: 3, windowMinutes: 60 },
        `valor ${malformed}`
      );
    }

    assert.deepEqual(load('7', '15'), { maxAttempts: 7, windowMinutes: 15 });
  } finally {
    if (originalMax === undefined) {
      delete process.env.RESEND_THROTTLE_MAX;
    } else {
      process.env.RESEND_THROTTLE_MAX = originalMax;
    }

    if (originalWindow === undefined) {
      delete process.env.RESEND_THROTTLE_WINDOW_MINUTES;
    } else {
      process.env.RESEND_THROTTLE_WINDOW_MINUTES = originalWindow;
    }

    delete require.cache[ENV_PATH];
  }
});
