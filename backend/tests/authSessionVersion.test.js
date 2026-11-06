'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Login } = require('../src/modules/auth/application/Login');
const { ResetPassword } = require('../src/modules/auth/application/ResetPassword');
const {
  sessionClaims,
  sessionVersionOf,
  tokenVersionOf,
  SESSION_VERSION_CLAIM
} = require('../src/shared/session/sessionVersion');
const { createAuthMiddleware } = require('../src/shared/middlewares/authMiddleware');
const { UnauthorizedError } = require('../src/shared/errors');

const CONFIG = Object.freeze({
  appUrl: 'http://localhost:3201',
  passwordReset: { ttlMinutes: 60 },
  lockout: { maxAttempts: 5, lockMinutes: 15 }
});

const NEW_PASSWORD = 'nueva-clave1';

function createClock(start = Date.parse('2024-05-01T12:00:00.000Z')) {
  let current = start;
  return {
    now: () => current,
    advance(ms) {
      current += ms;
    }
  };
}

function createFakeUserRepository(user) {
  const users = new Map([[user.id, user]]);
  const writes = [];

  return {
    users,
    writes,
    async findByEmail(email) {
      return [...users.values()].find((candidate) => candidate.email === email) ?? null;
    },
    async findById(id) {
      return users.get(id) ?? null;
    },
    async updateLoginLock(id, data) {
      users.set(id, { ...users.get(id), ...data });
      return users.get(id);
    },
    async updatePasswordAfterReset(id, data) {
      writes.push({ id, data });
      const updated = { ...users.get(id), ...data };
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
      record.usedAt = new Date();
      return record;
    },
    async invalidateForUser() {}
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

/** Verificador de mentira: el token "jwt:<payload json>" se decodifica tal cual. */
const tokenService = {
  sign(payload) {
    return `jwt:${JSON.stringify(payload)}`;
  },
  verify(token) {
    if (!token.startsWith('jwt:')) {
      throw new Error('invalid token');
    }
    return JSON.parse(token.slice(4));
  }
};

function buildUser(overrides = {}) {
  return {
    id: 'user-1',
    email: 'cuidador@example.com',
    fullName: 'Esteban Trujillo',
    role: 'CAREGIVER',
    passwordHash: 'hashed:vieja-clave1',
    emailVerifiedAt: new Date('2024-04-01T10:00:00.000Z'),
    sessionVersion: null,
    ...overrides
  };
}

function buildScenario(user = buildUser()) {
  const clock = createClock();
  const userRepository = createFakeUserRepository(user);
  const resetRepository = createFakeResetRepository();
  const tokens = tokenService;

  return {
    clock,
    userRepository,
    resetRepository,
    tokens,
    login: new Login({
      userRepository,
      passwordHasher,
      tokenService: tokens,
      config: CONFIG,
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

/** Corre el middleware y devuelve el error que le pasó a next(), si hubo. */
async function runMiddleware(middleware, token) {
  const req = { headers: {}, user: undefined };

  if (token) {
    req.headers.authorization = `Bearer ${token}`;
  }

  let capturedError;

  await new Promise((resolve, reject) => {
    Promise.resolve(
      middleware(req, {}, (error) => {
        capturedError = error;
        resolve();
      })
    )
      .then(() => resolve())
      .catch(reject);
  });

  return { error: capturedError, user: req.user };
}

async function issueResetLink(scenario) {
  const rawToken = 'a'.repeat(64);
  const { hashToken } = require('../src/modules/auth/domain/verificationToken');

  await scenario.resetRepository.create({
    userId: 'user-1',
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(scenario.clock.now() + 60 * 60 * 1000)
  });

  return rawToken;
}

test('el claim de versión de sesión: null y ausente se leen como 0', () => {
  assert.equal(sessionVersionOf({ sessionVersion: null }), 0);
  assert.equal(sessionVersionOf({}), 0);
  assert.equal(sessionVersionOf({ sessionVersion: 3 }), 3);
  assert.equal(tokenVersionOf({}), 0);
  assert.equal(tokenVersionOf({ [SESSION_VERSION_CLAIM]: 2 }), 2);
});

test('sessionClaims arma el payload con sub, role, email y sv', () => {
  assert.deepEqual(sessionClaims(buildUser({ sessionVersion: 4 })), {
    sub: 'user-1',
    role: 'CAREGIVER',
    email: 'cuidador@example.com',
    sv: 4
  });

  assert.deepEqual(sessionClaims(buildUser()), {
    sub: 'user-1',
    role: 'CAREGIVER',
    email: 'cuidador@example.com',
    sv: 0
  });
});

test('el middleware acepta un token cuya versión coincide con la del usuario', async () => {
  const scenario = buildScenario();
  const { token } = await scenario.login.execute({
    email: 'cuidador@example.com',
    password: 'vieja-clave1'
  });

  const middleware = createAuthMiddleware({
    verifyToken: scenario.tokens.verify,
    userRepository: scenario.userRepository
  });

  const { error, user } = await runMiddleware(middleware, token);

  assert.equal(error, undefined);
  assert.deepEqual(user, { id: 'user-1', role: 'CAREGIVER', email: 'cuidador@example.com' });
});

test('S3: después del reset, el token de la sesión anterior deja de servir', async () => {
  const scenario = buildScenario();

  const { token: oldToken } = await scenario.login.execute({
    email: 'cuidador@example.com',
    password: 'vieja-clave1'
  });

  const middleware = createAuthMiddleware({
    verifyToken: scenario.tokens.verify,
    userRepository: scenario.userRepository
  });

  assert.equal((await runMiddleware(middleware, oldToken)).error, undefined);

  const resetToken = await issueResetLink(scenario);
  await scenario.reset.execute({ token: resetToken, password: NEW_PASSWORD });

  const rejected = await runMiddleware(middleware, oldToken);

  assert.ok(rejected.error instanceof UnauthorizedError);
  assert.equal(rejected.error.statusCode, 401);
  assert.equal(rejected.user, undefined);
});

test('S3: después del reset, un login nuevo sí sirve', async () => {
  const scenario = buildScenario();
  const resetToken = await issueResetLink(scenario);

  await scenario.reset.execute({ token: resetToken, password: NEW_PASSWORD });

  const { token } = await scenario.login.execute({
    email: 'cuidador@example.com',
    password: NEW_PASSWORD
  });

  const middleware = createAuthMiddleware({
    verifyToken: scenario.tokens.verify,
    userRepository: scenario.userRepository
  });

  const { error, user } = await runMiddleware(middleware, token);

  assert.equal(error, undefined);
  assert.equal(user.id, 'user-1');
});

test('S3: el reset sube la versión de sesión en el documento del usuario', async () => {
  const scenario = buildScenario();

  const first = await issueResetLink(scenario);
  await scenario.reset.execute({ token: first, password: NEW_PASSWORD });
  assert.equal(scenario.userRepository.users.get('user-1').sessionVersion, 1);

  const second = await issueResetLink(scenario);
  await scenario.reset.execute({ token: second, password: 'otra-clave1' });
  assert.equal(scenario.userRepository.users.get('user-1').sessionVersion, 2);
});

test('un token emitido antes de este cambio (sin claim) sobrevive hasta el primer reset', async () => {
  const scenario = buildScenario();
  const middleware = createAuthMiddleware({
    verifyToken: scenario.tokens.verify,
    userRepository: scenario.userRepository
  });

  // Token viejo: sin `sv`. Nadie pierde la sesión por el despliegue.
  const legacyToken = `jwt:${JSON.stringify({
    sub: 'user-1',
    role: 'CAREGIVER',
    email: 'cuidador@example.com'
  })}`;

  assert.equal((await runMiddleware(middleware, legacyToken)).error, undefined);

  const resetToken = await issueResetLink(scenario);
  await scenario.reset.execute({ token: resetToken, password: NEW_PASSWORD });

  const rejected = await runMiddleware(middleware, legacyToken);
  assert.ok(rejected.error instanceof UnauthorizedError);
});

test('el middleware rechaza un token de un usuario que ya no existe', async () => {
  const scenario = buildScenario();
  const middleware = createAuthMiddleware({
    verifyToken: scenario.tokens.verify,
    userRepository: scenario.userRepository
  });

  scenario.userRepository.users.delete('user-1');

  const { token } = { token: `jwt:${JSON.stringify({ sub: 'user-1', role: 'CAREGIVER', sv: 0 })}` };
  const rejected = await runMiddleware(middleware, token);

  assert.ok(rejected.error instanceof UnauthorizedError);
  assert.equal(rejected.error.statusCode, 401);
});

test('el middleware sigue rechazando sin header y con un token ilegible', async () => {
  const scenario = buildScenario();
  const middleware = createAuthMiddleware({
    verifyToken: scenario.tokens.verify,
    userRepository: scenario.userRepository
  });

  const noHeader = await runMiddleware(middleware, '');
  assert.ok(noHeader.error instanceof UnauthorizedError);

  const garbage = await runMiddleware(middleware, 'basura');
  assert.ok(garbage.error instanceof UnauthorizedError);
});
