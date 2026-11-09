'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../src/app');
const { createAuthController } = require('../src/modules/auth/infrastructure/AuthController');
const { createAuthRouter } = require('../src/modules/auth/infrastructure/authRoutes');
const { RegisterCaregiver } = require('../src/modules/auth/application/RegisterCaregiver');
const { Login } = require('../src/modules/auth/application/Login');
const { ResendVerificationEmail } = require('../src/modules/auth/application/ResendVerificationEmail');
const { ResendThrottle } = require('../src/modules/auth/application/ResendThrottle');
const { RedeemPairingToken } = require('../src/modules/pairing/application/RedeemPairingToken');
const { hashPairingToken } = require('../src/modules/pairing/domain/pairingToken');
const { ConflictError } = require('../src/shared/errors');

const silentLogger = { info() {}, warn() {}, error() {}, log() {} };

const CONFIG = Object.freeze({
  appUrl: 'http://localhost:3201',
  verification: { ttlHours: 24 },
  terms: { version: '1.0' }
});

const VALID_REGISTRATION = Object.freeze({
  email: 'Cuidador@Example.com',
  password: 'secreto123',
  fullName: 'Esteban Trujillo',
  phone: '+54 11 5555 1234',
  acceptedTerms: true
});

function createFakeUserRepository({ failCreate } = {}) {
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
      if (failCreate) {
        throw failCreate();
      }

      const id = `user-${(counter += 1)}`;
      const user = { id, createdAt: new Date(), emailVerifiedAt: null, ...data };
      users.set(id, user);
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
    async markUsed() {
      return null;
    },
    async invalidateForUser() {
      return null;
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

function buildScenario(options = {}) {
  const userRepository = createFakeUserRepository(options);
  const verificationRepository = createFakeVerificationRepository();
  const emailSender = createFakeEmailSender();

  const registerCaregiver = new RegisterCaregiver({
    userRepository,
    passwordHasher,
    verificationRepository,
    emailSender,
    config: CONFIG,
    logger: silentLogger
  });

  const unreachable = (name) => async () => {
    throw new Error(`${name} is not part of HU-001`);
  };

  const tokenService = { sign: (payload) => `jwt:${payload.sub}`, verify: () => ({}) };

  const controller = createAuthController({
    registerCaregiver,
    login: new Login({ userRepository, passwordHasher, tokenService }),
    getCurrentUser: { execute: unreachable('getCurrentUser') },
    verifyEmail: { execute: unreachable('verifyEmail') },
    resendVerificationEmail: new ResendVerificationEmail({
      userRepository,
      verificationRepository,
      emailSender,
      config: CONFIG,
      logger: silentLogger,
      resendThrottle: new ResendThrottle()
    })
  });

  const router = createAuthRouter({ controller, authMiddleware: (_req, _res, next) => next() });

  return { userRepository, verificationRepository, emailSender, router };
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

async function post(baseUrl, path, body, headers = {}) {
  const response = await fetch(`${baseUrl}/api/auth${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });

  return { status: response.status, body: await response.json() };
}

function postRegister(baseUrl, body, headers) {
  return post(baseUrl, '/register', body, headers);
}

function assertNothingPersisted(scenario) {
  assert.equal(scenario.userRepository.users.size, 0);
  assert.equal(scenario.verificationRepository.byHash.size, 0);
  assert.equal(scenario.emailSender.sent.length, 0);
}

test('S1 - un registro válido responde 201 con la cuenta creada y sin token de verificación', async () => {
  const scenario = buildScenario();

  await withAuthServer(scenario, async (baseUrl) => {
    const { status, body } = await postRegister(baseUrl, VALID_REGISTRATION);

    assert.equal(status, 201);
    assert.equal(body.user.email, 'cuidador@example.com');
    assert.equal(body.user.fullName, 'Esteban Trujillo');
    assert.equal(body.user.role, 'CAREGIVER');
    assert.equal(body.user.emailVerified, false);
    assert.equal(body.verificationSent, true);
    assert.equal('passwordHash' in body.user, false);
    assert.equal('verificationToken' in body, false);
  });

  assert.equal(scenario.userRepository.users.size, 1);
  assert.equal(scenario.emailSender.sent.length, 1);
});

test('S2 - un correo con formato inválido responde 400 con un mensaje claro', async () => {
  const scenario = buildScenario();

  for (const email of ['cuidador-arroba-ejemplo.com', 'cuidador@ejemplo', ' cuidadoor@ejemplo.com @x']) {
    await withAuthServer(scenario, async (baseUrl) => {
      const { status, body } = await postRegister(baseUrl, { ...VALID_REGISTRATION, email });

      assert.equal(status, 400, `email rejected: ${email}`);
      assert.equal(body.error.code, 'VALIDATION_ERROR');
      assert.match(body.error.message, /correo/i);
    });
  }

  assertNothingPersisted(scenario);
});

test('S3 - un correo ya registrado responde 400 sin distinguir mayúsculas', async () => {
  const scenario = buildScenario();

  await withAuthServer(scenario, async (baseUrl) => {
    const first = await postRegister(baseUrl, VALID_REGISTRATION);
    assert.equal(first.status, 201);

    const duplicate = await postRegister(baseUrl, {
      ...VALID_REGISTRATION,
      email: 'CUIDADOR@EXAMPLE.COM'
    });

    assert.equal(duplicate.status, 400);
    assert.equal(duplicate.body.error.code, 'EMAIL_ALREADY_REGISTERED');
    assert.equal(duplicate.body.error.message, 'Este correo ya tiene una cuenta');
  });

  assert.equal(scenario.userRepository.users.size, 1);
  assert.equal(scenario.emailSender.sent.length, 1);
});

test('S4 - se rechazan contraseñas de menos de 8 caracteres o sin letras y dígitos', async () => {
  const scenario = buildScenario();
  const rejected = ['corto1', '12345678', 'sinningundigito', '1234567890'];

  for (const password of rejected) {
    await withAuthServer(scenario, async (baseUrl) => {
      const { status, body } = await postRegister(baseUrl, { ...VALID_REGISTRATION, password });

      assert.equal(status, 400, `password rejected: ${password}`);
      assert.equal(body.error.code, 'VALIDATION_ERROR');
      assert.match(body.error.message, /contraseña/i);
    });
  }

  await withAuthServer(scenario, async (baseUrl) => {
    const { status } = await postRegister(baseUrl, { ...VALID_REGISTRATION, password: 'abcdefgh1' });

    assert.equal(status, 201);
  });

  assert.equal(scenario.emailSender.sent.length, 1);
});

test('S5 - sin aceptación de términos responde 400 y no crea nada', async () => {
  const scenario = buildScenario();

  for (const acceptedTerms of [undefined, false, 'true', 1, null]) {
    await withAuthServer(scenario, async (baseUrl) => {
      const payload = { ...VALID_REGISTRATION };

      if (acceptedTerms === undefined) {
        delete payload.acceptedTerms;
      } else {
        payload.acceptedTerms = acceptedTerms;
      }

      const { status, body } = await postRegister(baseUrl, payload);

      assert.equal(status, 400, `acceptedTerms rejected: ${String(acceptedTerms)}`);
      assert.equal(body.error.code, 'VALIDATION_ERROR');
      assert.match(body.error.message, /t[ée]rminos|consentimiento|datos personales/i);
    });
  }

  assertNothingPersisted(scenario);
});

test('S6 - el consentimiento se guarda con fecha, versión del servidor e IP real', async () => {
  const scenario = buildScenario();

  await withAuthServer(scenario, async (baseUrl) => {
    const before = Date.now();
    const { status } = await postRegister(
      baseUrl,
      {
        ...VALID_REGISTRATION,
        // The client cannot choose what it accepted, from where, nor which role it gets.
        termsVersion: '9.9',
        acceptedTermsAt: '1999-01-01T00:00:00.000Z',
        ipAddress: '10.0.0.9',
        role: 'SENIOR',
        emailVerifiedAt: '2020-01-01T00:00:00.000Z'
      },
      { 'x-forwarded-for': '203.0.113.5' }
    );

    assert.equal(status, 201);

    const stored = [...scenario.userRepository.users.values()][0];

    assert.ok(stored.acceptedTermsAt instanceof Date);
    assert.ok(Math.abs(stored.acceptedTermsAt.getTime() - before) < 60000);
    assert.equal(stored.termsVersion, '1.0');
    // No `trust proxy`: req.ip is the socket peer, never a client supplied header.
    assert.match(stored.ipAddress, /127\.0\.0\.1$/);
    assert.equal(stored.role, 'CAREGIVER');
    assert.equal(stored.emailVerifiedAt, null);
    assert.equal(stored.passwordHash, `hashed:${VALID_REGISTRATION.password}`);
  });
});

test('S3 - la carrera contra el índice único también responde 400 de negocio', async () => {
  const scenario = buildScenario({ failCreate: () => new ConflictError('Email is already registered') });

  await withAuthServer(scenario, async (baseUrl) => {
    const { status, body } = await postRegister(baseUrl, VALID_REGISTRATION);

    assert.equal(status, 400);
    assert.equal(body.error.code, 'EMAIL_ALREADY_REGISTERED');
    assert.equal(body.error.message, 'Este correo ya tiene una cuenta');
  });

  assertNothingPersisted(scenario);
});

// The register flow shares domain/User.js with login, resend and pairing: localizing
// its messages must not change the answers those already published.
test('sin regresión - login y resend-verification conservan su mensaje de correo inválido', async () => {
  const scenario = buildScenario();

  await withAuthServer(scenario, async (baseUrl) => {
    const login = await post(baseUrl, '/login', { email: 'noesuncorreo', password: 'secreto123' });
    const resend = await post(baseUrl, '/resend-verification', { email: 'noesuncorreo' });

    assert.equal(login.status, 400);
    assert.equal(login.body.error.message, 'email format is invalid');
    assert.equal(resend.status, 400);
    assert.equal(resend.body.error.message, 'email format is invalid');
  });
});

test('sin regresión - vincular un adulto mayor ya no crea usuarios ni valida el cuerpo', async () => {
  // HU-006 T7/L9: el canje dejó de crear perfiles. El perfil existe antes del QR y el cuerpo
  // del pedido ya no aporta `fullName` ni `phone`, así que los mensajes localizados del factory
  // compartido (los de registro) no se pueden alcanzar desde acá: eso es lo que se fija.
  const profile = {
    id: 'senior-1',
    email: 'senior+abc123@seniors.local',
    fullName: 'Rosa Perez',
    role: 'SENIOR',
    phone: '+54 11 4444 2222',
    caregiverId: 'caregiver-1',
    linkStatus: 'PENDING',
    timezone: 'America/Bogota',
    createdAt: new Date('2024-04-01T10:00:00.000Z')
  };
  const rawToken = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v';
  const created = [];
  const linked = [];

  const pairingRepository = {
    async findByTokenHash(tokenHash) {
      if (tokenHash !== hashPairingToken(rawToken)) {
        return null;
      }

      return {
        id: 'pairing-1',
        caregiverId: 'caregiver-1',
        seniorId: profile.id,
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        invalidatedAt: null
      };
    },
    async claim({ id }) {
      return { claimed: id === 'pairing-1' };
    }
  };

  const linkSenior = new RedeemPairingToken({
    pairingRepository,
    userRepository: {
      async findById(id) {
        return id === profile.id ? { ...profile } : null;
      },
      async markLinked(id) {
        linked.push(id);
        return { ...profile, linkStatus: 'LINKED' };
      },
      async create(data) {
        created.push(data);
        return data;
      }
    },
    tokenService: { sign: () => 'jwt' }
  });

  // Un `fullName`/`phone` que antes eran un 400 ahora se ignoran: el familiar es el dueño de la
  // ficha y el teléfono del adulto mayor no edita su perfil.
  const redeemed = await linkSenior.execute({ token: rawToken, fullName: 'Ro', phone: 'abc' });

  assert.equal(redeemed.senior.role, 'SENIOR');
  assert.equal(redeemed.senior.caregiverId, 'caregiver-1');
  assert.equal(redeemed.senior.linkStatus, 'LINKED');
  assert.deepEqual(created, []);
  assert.deepEqual(linked, [profile.id]);

  await assert.rejects(
    () => linkSenior.execute({ token: '482913' }),
    (error) => error.message === 'pairing token is invalid or expired'
  );
});
