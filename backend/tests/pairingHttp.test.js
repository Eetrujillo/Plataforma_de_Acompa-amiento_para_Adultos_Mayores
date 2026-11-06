'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { GeneratePairingCode } = require('../src/modules/pairing/application/GeneratePairingCode');
const { LinkSeniorApp } = require('../src/modules/pairing/application/LinkSeniorApp');
const { ListLinkedSeniors } = require('../src/modules/pairing/application/ListLinkedSeniors');
const { createPairingController } = require('../src/modules/pairing/infrastructure/PairingController');
const { createPairingRouter } = require('../src/modules/pairing/infrastructure/pairingRoutes');
const { QrGenerator } = require('../src/modules/pairing/infrastructure/QrGenerator');
const { createAuthMiddleware } = require('../src/shared/middlewares/authMiddleware');
const { JwtTokenService } = require('../src/modules/auth/infrastructure/JwtTokenService');

/**
 * HU-006 S3/S5 en el borde HTTP: códigos de estado, `error.code` y la forma congelada de las
 * dos respuestas. El caregiver sale siempre de la sesión y el código pertenece a un perfil.
 */

const CG = '507f1f77bcf86cd7994390aa';
const OTHER_CG = '507f1f77bcf86cd7994390cc';
const PENDING = '507f1f77bcf86cd7994390bb';
const LINKED = '507f1f77bcf86cd7994390dd';
const FOREIGN = '507f1f77bcf86cd799439011';

const CONFIG = { pairing: { codeLength: 6, ttlMinutes: 1440, maxGenerationAttempts: 5 } };
const A_DAY = 24 * 60 * 60 * 1000;

function build() {
  const users = new Map([
    [CG, { id: CG, role: 'CAREGIVER', email: 'cg@x.co', sessionVersion: 0 }],
    [OTHER_CG, { id: OTHER_CG, role: 'CAREGIVER', email: 'otro@x.co', sessionVersion: 0 }],
    [PENDING, {
      id: PENDING, role: 'SENIOR', email: 'senior+abc123@seniors.local', fullName: 'Rosa Pérez',
      phone: '+573001112233', caregiverId: CG, linkStatus: 'PENDING', timezone: 'America/Bogota',
      createdAt: new Date('2024-04-01T10:00:00.000Z')
    }],
    [LINKED, { id: LINKED, role: 'SENIOR', fullName: 'Ana', caregiverId: CG, linkStatus: 'LINKED' }],
    [FOREIGN, { id: FOREIGN, role: 'SENIOR', fullName: 'Otra', caregiverId: OTHER_CG, linkStatus: 'PENDING' }]
  ]);

  const codes = new Map();
  const createdSeniors = [];
  let counter = 0;

  const pairingRepository = {
    codes,
    async existsByCode(code) {
      return codes.has(code);
    },
    async create(data) {
      counter += 1;
      const record = { id: `pc-${counter}`, usedAt: null, invalidatedAt: null, ...data };
      codes.set(record.code, record);
      return record;
    },
    async invalidateOutstanding({ caregiverId, seniorId }) {
      for (const record of codes.values()) {
        if (record.caregiverId === caregiverId && record.seniorId === seniorId && !record.usedAt && !record.invalidatedAt) {
          record.invalidatedAt = new Date();
        }
      }
    },
    async findByCode(code) {
      const record = codes.get(code);
      return record ? { ...record } : null;
    },
    async claim({ id }) {
      const record = [...codes.values()].find((candidate) => candidate.id === id);

      if (!record || record.usedAt || record.invalidatedAt || record.expiresAt.getTime() <= Date.now()) {
        return { claimed: false };
      }

      record.usedAt = new Date();
      return { claimed: true };
    },
    async setSenior({ id, seniorId }) {
      const record = [...codes.values()].find((candidate) => candidate.id === id);
      record.seniorId = seniorId;
    }
  };

  const userRepository = {
    createdSeniors,
    async findById(id) {
      return users.get(id) ?? null;
    },
    async listSeniorsByCaregiver(caregiverId) {
      return [...users.values()].filter((user) => user.caregiverId === caregiverId && user.role === 'SENIOR');
    },
    async create(data) {
      const stored = {
        id: `507f1f77bcf86cd79943${String(createdSeniors.length + 1).padStart(4, '0')}`,
        createdAt: new Date(),
        ...data
      };
      createdSeniors.push(stored);
      users.set(stored.id, stored);
      return stored;
    },
    async markLinked(id) {
      const senior = users.get(id);
      senior.linkStatus = 'LINKED';
      return senior;
    }
  };

  const tokenService = new JwtTokenService({ secret: 's', expiresIn: '1h' });
  const authMiddleware = createAuthMiddleware({ verifyToken: (token) => tokenService.verify(token), userRepository });

  const controller = createPairingController({
    generatePairingCode: new GeneratePairingCode({ pairingRepository, userRepository, config: CONFIG }),
    linkSeniorApp: new LinkSeniorApp({ pairingRepository, userRepository, tokenService }),
    listLinkedSeniors: new ListLinkedSeniors({ userRepository }),
    qrGenerator: new QrGenerator()
  });

  const router = createPairingRouter({ controller, authMiddleware });
  const app = createApp({ config: { corsOrigin: '*' }, modules: { pairing: router }, logger: { error() {} } });
  const token = (id) => tokenService.sign({ sub: id, role: users.get(id).role, email: users.get(id).email, sv: 0 });

  return { app, token, users, codes, createdSeniors };
}

async function withServer(run) {
  const context = build();
  const { app, token } = context;
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { as, body } = {}) => {
    const headers = {};
    if (as) headers.authorization = `Bearer ${token(as)}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${base}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    return { status: response.status, text, body: text ? JSON.parse(text) : null };
  };

  try {
    await run({ ...context, call });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('S5: 201 carries exactly code, expiresAt, seniorId and the QR', async () => {
  await withServer(async ({ call, codes }) => {
    const before = Date.now();
    const { status, body } = await call('POST', '/api/pairing/codes', { as: CG, body: { seniorId: PENDING } });

    assert.equal(status, 201);
    assert.deepEqual(Object.keys(body).sort(), ['code', 'expiresAt', 'qrCodeDataUrl', 'seniorId']);
    assert.match(body.code, /^\d{6}$/);
    assert.equal(body.seniorId, PENDING);
    assert.match(body.qrCodeDataUrl, /^data:image\/png;base64,/);

    const ttl = Date.parse(body.expiresAt) - before;
    assert.equal(ttl >= A_DAY - 1_000 && ttl < A_DAY + A_DAY, true, `ttl ${ttl}`);
    assert.equal(codes.get(body.code).seniorId, PENDING);
  });
});

test('S3/S5: each rejection answers its own status and code, and writes nothing', async () => {
  await withServer(async ({ call, codes, users }) => {
    const missing = await call('POST', '/api/pairing/codes', { as: CG, body: {} });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error.code, 'SENIOR_ID_REQUIRED');

    const malformed = await call('POST', '/api/pairing/codes', { as: CG, body: { seniorId: 'abc' } });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error.code, 'SENIOR_ID_REQUIRED');

    for (const seniorId of [FOREIGN, '507f1f77bcf86cd799439999', CG]) {
      const answer = await call('POST', '/api/pairing/codes', { as: CG, body: { seniorId } });
      assert.equal(answer.status, 404, seniorId);
      assert.equal(answer.body.error.code, 'SENIOR_NOT_FOUND', seniorId);
    }

    const linked = await call('POST', '/api/pairing/codes', { as: CG, body: { seniorId: LINKED } });
    assert.equal(linked.status, 409);
    assert.equal(linked.body.error.code, 'SENIOR_ALREADY_LINKED');

    // El dueño sale de la sesión: mandar otro caregiverId no abre otra familia.
    const smuggled = await call('POST', '/api/pairing/codes', {
      as: CG,
      body: { seniorId: FOREIGN, caregiverId: OTHER_CG }
    });
    assert.equal(smuggled.status, 404);
    assert.equal(smuggled.body.error.code, 'SENIOR_NOT_FOUND');

    assert.equal(codes.size, 0);
    assert.equal(users.get(PENDING).linkStatus, 'PENDING');
  });
});

test('S3: only a caregiver session can ask for a code', async () => {
  await withServer(async ({ call }) => {
    assert.equal((await call('POST', '/api/pairing/codes', { body: { seniorId: PENDING } })).status, 401);

    const asSenior = await call('POST', '/api/pairing/codes', { as: PENDING, body: { seniorId: PENDING } });
    assert.equal(asSenior.status, 403);
  });
});

test('S2/S5: the previous code of the profile stops working once a new one is generated', async () => {
  await withServer(async ({ call }) => {
    const first = await call('POST', '/api/pairing/codes', { as: CG, body: { seniorId: PENDING } });
    const second = await call('POST', '/api/pairing/codes', { as: CG, body: { seniorId: PENDING } });

    const replaced = await call('POST', '/api/pairing/link', { body: { code: first.body.code } });
    assert.equal(replaced.status, 400);
    assert.equal(replaced.body.error.code, 'VALIDATION_ERROR');

    const redeemed = await call('POST', '/api/pairing/link', { body: { code: second.body.code } });
    assert.equal(redeemed.status, 201);
    assert.equal(redeemed.body.senior.id, PENDING);
  });
});

test('S5: /link answers 201 conserving the published projection plus linkStatus/timezone', async () => {
  await withServer(async ({ call, users, createdSeniors }) => {
    const generated = await call('POST', '/api/pairing/codes', { as: CG, body: { seniorId: PENDING } });

    const { status, body, text } = await call('POST', '/api/pairing/link', {
      body: { code: generated.body.code, fullName: 'Intruso', phone: '+573009998877' }
    });

    assert.equal(status, 201);
    assert.deepEqual(Object.keys(body).sort(), ['senior', 'token']);
    // L5: ningún campo de la proyección publicada desaparece; linkStatus/timezone se suman.
    assert.deepEqual(Object.keys(body.senior).sort(), [
      'caregiverId',
      'createdAt',
      'email',
      'emailVerified',
      'fullName',
      'id',
      'linkStatus',
      'phone',
      'role',
      'timezone'
    ]);
    assert.equal(body.senior.id, PENDING);
    assert.equal(body.senior.role, 'SENIOR');
    assert.equal(body.senior.email, 'senior+abc123@seniors.local');
    assert.equal(body.senior.caregiverId, CG);
    assert.equal(body.senior.linkStatus, 'LINKED');
    assert.equal(body.senior.timezone, 'America/Bogota');
    assert.equal(typeof body.token, 'string');
    assert.equal(/pinHash|Intruso|573009998877/.test(text), false);

    assert.equal(users.get(PENDING).linkStatus, 'LINKED');
    assert.equal(users.get(PENDING).fullName, 'Rosa Pérez');
    assert.equal(createdSeniors.length, 0);
  });
});

test('S5: /link keeps its 400/404/409 answers', async () => {
  await withServer(async ({ call }) => {
    const malformed = await call('POST', '/api/pairing/link', { body: { code: '48291a' } });
    assert.equal(malformed.status, 400);

    const missing = await call('POST', '/api/pairing/link', { body: { code: '000000' } });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'NOT_FOUND');

    const generated = await call('POST', '/api/pairing/codes', { as: CG, body: { seniorId: PENDING } });
    assert.equal((await call('POST', '/api/pairing/link', { body: { code: generated.body.code } })).status, 201);

    const again = await call('POST', '/api/pairing/link', { body: { code: generated.body.code } });
    assert.equal(again.status, 409);
  });
});
