'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generateVerificationToken,
  hashToken,
  isTokenExpired,
  computeTokenExpiration,
  buildVerificationLink
} = require('../src/modules/auth/domain/verificationToken');
const {
  RegisterCaregiver
} = require('../src/modules/auth/application/RegisterCaregiver');
const { Login } = require('../src/modules/auth/application/Login');
const { VerifyEmail, INVALID_LINK_MESSAGE } = require('../src/modules/auth/application/VerifyEmail');
const {
  ResendVerificationEmail
} = require('../src/modules/auth/application/ResendVerificationEmail');
const {
  EmailAlreadyRegisteredError,
  EmailNotVerifiedError,
  ValidationError
} = require('../src/shared/errors');

const CONFIG = Object.freeze({
  appUrl: 'http://localhost:3201',
  verification: { ttlHours: 24 }
});

const silentLogger = { info() {}, warn() {}, error() {} };

function createFakeUserRepository() {
  const users = new Map();
  let counter = 0;

  return {
    users,
    async findByEmail(email) {
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
    },
    async listSeniorsByCaregiver() {
      return [];
    }
  };
}

function createFakeVerificationRepository() {
  const byHash = new Map();
  let counter = 0;

  return {
    byHash,
    async create({ userId, tokenHash, expiresAt }) {
      const record = { id: `token-${(counter += 1)}`, userId, tokenHash, expiresAt, usedAt: null };
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

const tokenService = {
  sign(payload) {
    return `jwt:${payload.sub}`;
  },
  verify() {
    throw new Error('not used in these tests');
  }
};

function buildScenario() {
  const userRepository = createFakeUserRepository();
  const verificationRepository = createFakeVerificationRepository();
  const emailSender = createFakeEmailSender();

  const deps = { userRepository, verificationRepository, emailSender };

  return {
    ...deps,
    register: new RegisterCaregiver({ ...deps, passwordHasher, config: CONFIG, logger: silentLogger }),
    login: new Login({ userRepository, passwordHasher, tokenService }),
    verifyEmail: new VerifyEmail({ verificationRepository, userRepository, tokenService }),
    resend: new ResendVerificationEmail({ ...deps, config: CONFIG, logger: silentLogger })
  };
}

const VALID_REGISTRATION = Object.freeze({
  email: 'Cuidador@Example.com',
  password: 'secreto-largo1',
  fullName: 'Esteban Trujillo',
  phone: '+54 11 5555 1234',
  acceptedTerms: true
});

function tokenFromLink(link) {
  return new URL(link).searchParams.get('token');
}

test('a verification token is 64 hex characters and only its hash is stable', () => {
  const raw = generateVerificationToken();

  assert.equal(raw.length, 64);
  assert.match(raw, /^[a-f0-9]{64}$/);
  assert.equal(hashToken(raw).length, 64);
  assert.match(hashToken(raw), /^[a-f0-9]{64}$/);
  assert.equal(hashToken(raw), hashToken(raw));
  assert.notEqual(hashToken(raw), hashToken(generateVerificationToken()));
});

test('a token expires at its exact expiration instant', () => {
  const now = new Date('2024-05-01T10:00:00.000Z');

  assert.equal(isTokenExpired(new Date('2024-05-01T10:00:00.000Z'), now), true);
  assert.equal(isTokenExpired(new Date('2024-05-01T09:59:59.000Z'), now), true);
  assert.equal(isTokenExpired(new Date('2024-05-01T10:00:01.000Z'), now), false);
  assert.equal(isTokenExpired('not-a-date', now), true);
});

test('expiration adds the ttl in hours and the link has no double slash', () => {
  const now = new Date('2024-05-01T10:00:00.000Z');

  assert.equal(computeTokenExpiration(now, 24).toISOString(), '2024-05-02T10:00:00.000Z');
  assert.equal(
    buildVerificationLink({ appUrl: 'https://app.example.com/', rawToken: 'abc' }),
    'https://app.example.com/verify-email?token=abc'
  );
});

test('registering creates an unverified caregiver and sends exactly one email', async () => {
  const scenario = buildScenario();

  const result = await scenario.register.execute(VALID_REGISTRATION);

  assert.equal(result.user.email, 'cuidador@example.com');
  assert.equal(result.user.emailVerified, false);
  assert.equal(result.verificationSent, true);
  assert.equal(scenario.emailSender.sent.length, 1);
  assert.equal(scenario.emailSender.sent[0].to, 'cuidador@example.com');
  assert.equal(scenario.userRepository.users.size, 1);

  const stored = [...scenario.userRepository.users.values()][0];
  assert.equal(stored.emailVerifiedAt, null);
  assert.equal(stored.passwordHash, 'hashed:secreto-largo1');
  assert.equal('verificationToken' in result, false);

  const link = scenario.emailSender.sent[0].link;
  assert.ok(link.startsWith('http://localhost:3201/verify-email?token='));
  assert.match(tokenFromLink(link), /^[a-f0-9]{64}$/);
});

test('registering an existing email is rejected and sends nothing', async () => {
  const scenario = buildScenario();

  await scenario.register.execute(VALID_REGISTRATION);

  await assert.rejects(
    () => scenario.register.execute(VALID_REGISTRATION),
    (error) =>
      error instanceof EmailAlreadyRegisteredError &&
      error.statusCode === 400 &&
      error.message === 'Este correo ya tiene una cuenta'
  );
  assert.equal(scenario.emailSender.sent.length, 1);
});

test('login is blocked until the email is verified, then it works', async () => {
  const scenario = buildScenario();
  await scenario.register.execute(VALID_REGISTRATION);

  await assert.rejects(
    () => scenario.login.execute({ email: 'cuidador@example.com', password: 'secreto-largo1' }),
    (error) =>
      error instanceof EmailNotVerifiedError &&
      error.code === 'EMAIL_NOT_VERIFIED' &&
      error.statusCode === 403 &&
      error.message === 'Tenés que verificar tu correo antes de ingresar.'
  );

  const token = tokenFromLink(scenario.emailSender.sent[0].link);
  const verified = await scenario.verifyEmail.execute({ token });

  assert.equal(verified.user.emailVerified, true);
  assert.equal(verified.token, `jwt:${verified.user.id}`);

  const session = await scenario.login.execute({
    email: 'cuidador@example.com',
    password: 'secreto-largo1'
  });

  assert.equal(session.user.emailVerified, true);
  assert.equal(session.token, `jwt:${session.user.id}`);
});

test('a verification token is single use', async () => {
  const scenario = buildScenario();
  await scenario.register.execute(VALID_REGISTRATION);

  const token = tokenFromLink(scenario.emailSender.sent[0].link);
  await scenario.verifyEmail.execute({ token });

  await assert.rejects(
    () => scenario.verifyEmail.execute({ token }),
    (error) => error instanceof ValidationError && error.message === INVALID_LINK_MESSAGE
  );
});

test('a malformed or unknown token is rejected with the same message', async () => {
  const scenario = buildScenario();

  await assert.rejects(
    () => scenario.verifyEmail.execute({ token: 'not-a-token' }),
    (error) => error instanceof ValidationError && error.message === INVALID_LINK_MESSAGE
  );

  await assert.rejects(
    () => scenario.verifyEmail.execute({ token: 'a'.repeat(64) }),
    (error) => error instanceof ValidationError && error.message === INVALID_LINK_MESSAGE
  );
});

test('resending invalidates the previous link and always answers accepted', async () => {
  const scenario = buildScenario();
  await scenario.register.execute(VALID_REGISTRATION);

  const firstToken = tokenFromLink(scenario.emailSender.sent[0].link);

  const resendResult = await scenario.resend.execute({ email: 'cuidador@example.com' });

  assert.deepEqual(resendResult, { accepted: true });
  assert.equal(scenario.emailSender.sent.length, 2);

  await assert.rejects(
    () => scenario.verifyEmail.execute({ token: firstToken }),
    (error) => error instanceof ValidationError && error.message === INVALID_LINK_MESSAGE
  );

  const secondToken = tokenFromLink(scenario.emailSender.sent[1].link);
  const verified = await scenario.verifyEmail.execute({ token: secondToken });

  assert.equal(verified.user.emailVerified, true);
});

test('resending for an unknown or already verified email reveals nothing and sends nothing', async () => {
  const scenario = buildScenario();

  assert.deepEqual(await scenario.resend.execute({ email: 'nadie@example.com' }), {
    accepted: true
  });
  assert.equal(scenario.emailSender.sent.length, 0);

  await scenario.register.execute(VALID_REGISTRATION);
  await scenario.verifyEmail.execute({ token: tokenFromLink(scenario.emailSender.sent[0].link) });

  assert.deepEqual(await scenario.resend.execute({ email: 'cuidador@example.com' }), {
    accepted: true
  });
  assert.equal(scenario.emailSender.sent.length, 1);
});
