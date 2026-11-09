'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Login } = require('../src/modules/auth/application/Login');
const {
  AccountLockedError,
  UnauthorizedError
} = require('../src/shared/errors');

const LOCKOUT_MESSAGE =
  'Bloqueamos tu cuenta por demasiados intentos fallidos. Esperá unos minutos antes de volver a intentar.';

const LOCK_MINUTES = 15;
const LOCK_MS = LOCK_MINUTES * 60 * 1000;

const CONFIG = Object.freeze({
  appUrl: 'http://localhost:3201',
  verification: { ttlHours: 24 },
  lockout: { maxAttempts: 5, lockMinutes: LOCK_MINUTES }
});

function createClock(start = Date.parse('2024-05-01T12:00:00.000Z')) {
  let current = start;
  return {
    now: () => current,
    advance(ms) {
      current += ms;
    }
  };
}

function createFakeUserRepository(seed = []) {
  const users = new Map(seed.map((user) => [user.id, user]));
  const writes = [];

  return {
    users,
    writes,
    async findByEmail(email) {
      return [...users.values()].find((user) => user.email === email) ?? null;
    },
    async findById(id) {
      return users.get(id) ?? null;
    },
    async updateLoginLock(id, data) {
      writes.push({ id, data });
      const user = users.get(id);
      users.set(id, { ...user, ...data });
      return users.get(id);
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

const tokenService = {
  sign(payload) {
    return `jwt:${payload.sub}`;
  }
};

function buildUser(overrides = {}) {
  return {
    id: 'user-1',
    email: 'cuidador@example.com',
    fullName: 'Esteban Trujillo',
    role: 'CAREGIVER',
    phone: null,
    caregiverId: null,
    passwordHash: 'hashed:secreto-largo1',
    emailVerifiedAt: new Date('2024-04-01T10:00:00.000Z'),
    createdAt: new Date('2024-04-01T09:00:00.000Z'),
    ...overrides
  };
}

function buildScenario({ user = buildUser(), clock = createClock() } = {}) {
  const userRepository = createFakeUserRepository([user]);

  return {
    clock,
    userRepository,
    user,
    login: new Login({
      userRepository,
      passwordHasher,
      tokenService,
      config: CONFIG,
      now: clock.now
    })
  };
}

const GOOD = { email: 'cuidador@example.com', password: 'secreto-largo1' };
const BAD = { email: 'cuidador@example.com', password: 'no-es-la-clave' };

test('S1: con credenciales correctas devuelve el token de sesión y no filtra el estado de bloqueo', async () => {
  const scenario = buildScenario();

  const result = await scenario.login.execute(GOOD);

  assert.equal(result.token, 'jwt:user-1');
  assert.equal(result.user.id, 'user-1');
  assert.equal(result.user.emailVerified, true);
  assert.equal('failedLoginAttempts' in result.user, false);
  assert.equal('lockedUntil' in result.user, false);
});

test('S2: correo inexistente y contraseña incorrecta devuelven el mismo error, sin decir qué falló', async () => {
  const scenario = buildScenario();

  let unknownError;
  await assert.rejects(
    () => scenario.login.execute({ email: 'nadie@example.com', password: 'secreto-largo1' }),
    (error) => {
      unknownError = error;
      return error instanceof UnauthorizedError;
    }
  );

  let wrongPasswordError;
  await assert.rejects(
    () => scenario.login.execute(BAD),
    (error) => {
      wrongPasswordError = error;
      return error instanceof UnauthorizedError;
    }
  );

  assert.equal(unknownError.statusCode, 401);
  assert.equal(wrongPasswordError.statusCode, unknownError.statusCode);
  assert.equal(wrongPasswordError.code, unknownError.code);
  assert.equal(wrongPasswordError.message, unknownError.message);
  assert.equal(unknownError.message, 'Invalid credentials');
});

test('S3: el quinto fallo consecutivo bloquea la cuenta y responde 429', async () => {
  const scenario = buildScenario();

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await assert.rejects(
      () => scenario.login.execute(BAD),
      (error) => error instanceof UnauthorizedError && error.statusCode === 401,
      `el intento ${attempt} tiene que ser 401`
    );
  }

  await assert.rejects(
    () => scenario.login.execute(BAD),
    (error) => {
      assert.ok(error instanceof AccountLockedError);
      assert.equal(error.statusCode, 429);
      assert.equal(error.code, 'ACCOUNT_LOCKED');
      assert.equal(error.message, LOCKOUT_MESSAGE);
      assert.equal(error.details.retryAfterSeconds, LOCK_MINUTES * 60);
      return true;
    }
  );

  const stored = scenario.userRepository.users.get('user-1');
  assert.equal(stored.failedLoginAttempts, 5);
  assert.equal(stored.lockedUntil.getTime(), scenario.clock.now() + LOCK_MS);
});

test('S3: estando bloqueada, la contraseña correcta también se rechaza', async () => {
  const scenario = buildScenario();

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await assert.rejects(() => scenario.login.execute(BAD), () => true);
  }

  await assert.rejects(
    () => scenario.login.execute(GOOD),
    (error) =>
      error instanceof AccountLockedError &&
      error.details.retryAfterSeconds === LOCK_MINUTES * 60 &&
      error.message === LOCKOUT_MESSAGE
  );
});

test('S3: el bloqueo vence solo y deja el contador limpio', async () => {
  const scenario = buildScenario();

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await assert.rejects(() => scenario.login.execute(BAD), () => true);
  }

  scenario.clock.advance(LOCK_MS + 1000);

  const result = await scenario.login.execute(GOOD);

  assert.equal(result.token, 'jwt:user-1');
  const stored = scenario.userRepository.users.get('user-1');
  assert.equal(stored.failedLoginAttempts, 0);
  assert.equal(stored.lockedUntil, null);
});

test('S3: un login correcto corta la racha, cuatro fallos después no bloquean', async () => {
  const scenario = buildScenario();

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await assert.rejects(() => scenario.login.execute(BAD), () => true);
  }

  await scenario.login.execute(GOOD);

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await assert.rejects(
      () => scenario.login.execute(BAD),
      (error) => error instanceof UnauthorizedError && error.statusCode === 401,
      `el fallo ${attempt} tras el login correcto no puede bloquear`
    );
  }

  const stored = scenario.userRepository.users.get('user-1');
  assert.equal(stored.failedLoginAttempts, 4);
  assert.equal(stored.lockedUntil, null);
});

test('S3: el contador vive en el documento del usuario, no en memoria', async () => {
  const scenario = buildScenario();

  await assert.rejects(() => scenario.login.execute(BAD), () => true);
  await assert.rejects(() => scenario.login.execute(BAD), () => true);

  // Un Login nuevo sobre el mismo repositorio tiene que ver la racha: si el contador
  // estuviera en el caso de uso, se reiniciaría y el bloqueo sería decorativo.
  const secondLogin = new Login({
    userRepository: scenario.userRepository,
    passwordHasher,
    tokenService,
    config: CONFIG,
    now: scenario.clock.now
  });

  for (let attempt = 3; attempt <= 5; attempt += 1) {
    await assert.rejects(() => secondLogin.execute(BAD), () => true);
  }

  assert.ok(scenario.userRepository.writes.length >= 5);
  assert.deepEqual(
    scenario.userRepository.writes.map((write) => write.data.failedLoginAttempts),
    [1, 2, 3, 4, 5]
  );

  await assert.rejects(
    () => secondLogin.execute(BAD),
    (error) => error instanceof AccountLockedError
  );
});

test('S3: retryAfterSeconds baja a medida que corre el reloj', async () => {
  const scenario = buildScenario();

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await assert.rejects(() => scenario.login.execute(BAD), () => true);
  }

  const first = await scenario.login.execute(BAD).catch((error) => error);
  scenario.clock.advance(10 * 60 * 1000);
  const later = await scenario.login.execute(BAD).catch((error) => error);

  assert.ok(first instanceof AccountLockedError);
  assert.ok(later instanceof AccountLockedError);
  assert.equal(first.details.retryAfterSeconds, LOCK_MINUTES * 60);
  assert.equal(later.details.retryAfterSeconds, 5 * 60);
});

test('S2/S3: un correo inexistente no escribe estado de bloqueo ni se bloquea', async () => {
  const scenario = buildScenario();

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    await assert.rejects(
      () => scenario.login.execute({ email: 'nadie@example.com', password: 'loquesea1' }),
      (error) => error instanceof UnauthorizedError && error.statusCode === 401,
      `el intento ${attempt} de un correo inexistente tiene que seguir siendo 401`
    );
  }

  assert.deepEqual(scenario.userRepository.writes, []);
});

test('S3: un bloqueo vencido no se rearma con un fallo inmediato', async () => {
  const scenario = buildScenario();

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await assert.rejects(() => scenario.login.execute(BAD), () => true);
  }

  scenario.clock.advance(LOCK_MS + 1000);

  // Sin la limpieza del bloqueo vencido esto sería 429 con el contador en 6: el bloqueo
  // se rearmaría solo y la cuenta quedaría bloqueada para siempre.
  await assert.rejects(
    () => scenario.login.execute(BAD),
    (error) => error instanceof UnauthorizedError && error.statusCode === 401
  );

  const stored = scenario.userRepository.users.get('user-1');
  assert.equal(stored.failedLoginAttempts, 1);
  assert.equal(stored.lockedUntil, null);
});

test('S3: LOCKOUT_MAX_ATTEMPTS y LOCKOUT_MINUTES configuran el bloqueo', async () => {
  const clock = createClock();
  const userRepository = createFakeUserRepository([buildUser()]);
  const login = new Login({
    userRepository,
    passwordHasher,
    tokenService,
    config: { lockout: { maxAttempts: 2, lockMinutes: 1 } },
    now: clock.now
  });

  await assert.rejects(
    () => login.execute(BAD),
    (error) => error instanceof UnauthorizedError && error.statusCode === 401
  );

  await assert.rejects(
    () => login.execute(BAD),
    (error) => {
      assert.ok(error instanceof AccountLockedError);
      assert.equal(error.details.retryAfterSeconds, 60);
      return true;
    }
  );

  const stored = userRepository.users.get('user-1');
  assert.equal(stored.failedLoginAttempts, 2);
  assert.equal(stored.lockedUntil.getTime(), clock.now() + 60 * 1000);
});
