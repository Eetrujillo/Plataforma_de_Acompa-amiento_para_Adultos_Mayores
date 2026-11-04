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
  PrismaEmailVerificationRepository
} = require('../src/modules/auth/infrastructure/PrismaEmailVerificationRepository');
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

// The fake repository above cannot catch a filter that the real driver ignores. This
// one mimics MongoDB: a missing field and an explicit null are different things, and
// Prisma's `usedAt: null` only matches the second one.
function createMongoLikePrisma() {
  const docs = [];
  let counter = 0;

  function matches(doc, where) {
    if (where.userId !== undefined && doc.userId !== where.userId) {
      return false;
    }

    if (where.OR) {
      return where.OR.some((clause) => matches(doc, clause));
    }

    if ('usedAt' in where) {
      const filter = where.usedAt;

      if (filter && filter.isSet === false) {
        return !('usedAt' in doc);
      }

      return 'usedAt' in doc && doc.usedAt === null;
    }

    return true;
  }

  return {
    docs,
    emailVerificationToken: {
      async create({ data }) {
        const doc = { id: `doc-${(counter += 1)}`, ...data };
        // MongoDB stores exactly the keys it is given: absent stays absent.
        for (const key of Object.keys(doc)) {
          if (doc[key] === undefined) {
            delete doc[key];
          }
        }
        docs.push(doc);
        return doc;
      },
      async updateMany({ where, data }) {
        const target = docs.filter((doc) => matches(doc, where));
        for (const doc of target) {
          Object.assign(doc, data);
        }
        return { count: target.length };
      }
    }
  };
}

test('reiniciar el reenvío quema el enlace anterior también contra la semántica de MongoDB', async () => {
  const prisma = createMongoLikePrisma();
  const repository = new PrismaEmailVerificationRepository({ prisma });

  const issued = await repository.create({
    userId: 'user-1',
    tokenHash: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 60_000)
  });

  // A token written before `usedAt` was persisted explicitly: the field is absent.
  prisma.docs.push({ id: 'legacy', userId: 'user-1', tokenHash: 'b'.repeat(64), expiresAt: new Date() });
  prisma.docs.push({ id: 'other-user', userId: 'user-2', tokenHash: 'c'.repeat(64), expiresAt: new Date(), usedAt: null });

  assert.equal(issued.usedAt, null);
  assert.ok('usedAt' in prisma.docs[0], 'el token nuevo guarda usedAt nulo explícito');

  await repository.invalidateForUser('user-1');

  assert.ok(prisma.docs[0].usedAt instanceof Date, 'el token recién emitido queda quemado');
  assert.ok(prisma.docs[1].usedAt instanceof Date, 'el token sin el campo también queda quemado');
  assert.equal(prisma.docs[2].usedAt, null, 'los tokens de otro usuario no se tocan');
});
