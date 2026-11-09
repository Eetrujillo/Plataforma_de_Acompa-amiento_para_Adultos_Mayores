'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { createSeniorsModule } = require('../src/modules/seniors');
const { createAuthMiddleware } = require('../src/shared/middlewares/authMiddleware');
const { JwtTokenService } = require('../src/modules/auth/infrastructure/JwtTokenService');

/**
 * HU-005 S5/S6 at the HTTP boundary: status codes, `error.code` values, response shape and
 * the 404 that does not distinguish "not yours" from "does not exist".
 */

const CG = '507f1f77bcf86cd7994390aa';
const OTHER_CG = '507f1f77bcf86cd7994390cc';
const SENIOR = '507f1f77bcf86cd7994390bb';
const FOREIGN = '507f1f77bcf86cd799439011';
const LEGACY = '507f1f77bcf86cd799439022';

function build() {
  const users = new Map([
    [CG, { id: CG, role: 'CAREGIVER', email: 'cg@x.co', sessionVersion: 0 }],
    [SENIOR, { id: SENIOR, role: 'SENIOR', fullName: 'Rosa', caregiverId: CG, sessionVersion: 0 }],
    [OTHER_CG, { id: OTHER_CG, role: 'CAREGIVER', email: 'otro@x.co', sessionVersion: 0 }],
    // A document written before HU-005: no linkStatus, no timezone.
    [LEGACY, { id: LEGACY, role: 'SENIOR', fullName: 'Legacy', caregiverId: CG }],
    [FOREIGN, {
      id: FOREIGN, role: 'SENIOR', fullName: 'Ana', caregiverId: OTHER_CG,
      timezone: 'America/Lima', linkStatus: 'LINKED', pinHash: '$2b$12$ajeno'
    }]
  ]);
  const writes = [];
  let counter = 0;
  const userRepository = {
    writes,
    async findById(id) { return users.get(id) ?? null; },
    async listSeniorsByCaregiver(caregiverId) {
      return [...users.values()].filter((u) => u.caregiverId === caregiverId && u.role === 'SENIOR');
    },
    async create(data) {
      counter += 1;
      const stored = { id: `507f1f77bcf86cd79943${String(counter).padStart(4, '0')}`, createdAt: new Date(), ...data };
      users.set(stored.id, stored);
      writes.push(stored);
      return stored;
    }
  };

  const tokenService = new JwtTokenService({ secret: 's', expiresIn: '1h' });
  const authMiddleware = createAuthMiddleware({
    verifyToken: (token) => tokenService.verify(token),
    userRepository
  });
  const router = createSeniorsModule({ userRepository, authMiddleware }).router;
  const app = createApp({ config: { corsOrigin: '*' }, modules: { seniors: router }, logger: { error() {} } });
  const token = (id) => tokenService.sign({ sub: id, role: users.get(id).role, email: users.get(id).email, sv: 0 });

  return { app, token, writes };
}

async function withServer(run) {
  const { app, token, writes } = build();
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
    await run({ call, writes });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('S5: no token is 401, a SENIOR token is 403', async () => {
  await withServer(async ({ call }) => {
    assert.equal((await call('POST', '/api/seniors', { body: { fullName: 'Rosa Pérez', pin: '4821' } })).status, 401);
    assert.equal((await call('POST', '/api/seniors', { as: SENIOR, body: { fullName: 'Rosa Pérez', pin: '4821' } })).status, 403);
    assert.equal((await call('GET', '/api/seniors')).status, 401);
    assert.equal((await call('GET', `/api/seniors/${SENIOR}`, { as: SENIOR })).status, 403);
  });
});

test('S5: 201 carries exactly the frozen shape, PENDING, and no PIN', async () => {
  await withServer(async ({ call, writes }) => {
    const { status, body, text } = await call('POST', '/api/seniors', {
      as: CG,
      body: { fullName: '  Rosa   Pérez ', pin: '4821', timezone: 'America/Lima', linkStatus: 'LINKED', pinHash: '$2b$10$injected' }
    });

    assert.equal(status, 201);
    assert.deepEqual(Object.keys(body).sort(), ['createdAt', 'fullName', 'id', 'linkStatus', 'timezone']);
    assert.equal(body.fullName, 'Rosa Pérez');
    assert.equal(body.timezone, 'America/Lima');
    assert.equal(body.linkStatus, 'PENDING');
    assert.ok(!Number.isNaN(Date.parse(body.createdAt)));
    assert.equal(/pinHash|"pin"/.test(text), false);

    assert.equal(writes[0].caregiverId, CG);
    assert.equal(writes[0].role, 'SENIOR');
    assert.match(writes[0].pinHash, /^\$2[aby]\$1[2-9]\$/);
    assert.notEqual(writes[0].pinHash, '$2b$10$injected');
    // The use case does not stamp a consent nobody gave (S8): the repository writes nulls.
    assert.equal(writes[0].acceptedTermsAt ?? null, null);
    assert.equal(writes[0].termsVersion ?? null, null);
  });
});

test('S1: the caregiver comes from the session, never from the body', async () => {
  await withServer(async ({ call, writes }) => {
    const { status, body } = await call('POST', '/api/seniors', {
      as: CG,
      body: { fullName: 'Intruso', pin: '1111', caregiverId: OTHER_CG }
    });

    assert.equal(status, 201);
    assert.equal(writes[0].caregiverId, CG);
    assert.equal(Object.hasOwn(body, 'caregiverId'), false);
  });
});

test('S2/S3/S5: each rejected input answers 400 with its own code and writes nothing', async () => {
  await withServer(async ({ call, writes }) => {
    const pins = ['123', '12345', '12a4', ' 1234', '1234 ', '1234\n', '１２３４', '١٢٣٤', '', 4821, null];
    for (const pin of pins) {
      const { status, body } = await call('POST', '/api/seniors', { as: CG, body: { fullName: 'Rosa Pérez', pin } });
      assert.equal(status, 400, `pin ${JSON.stringify(pin)}`);
      assert.equal(body.error.code, 'INVALID_PIN', `pin ${JSON.stringify(pin)}`);
      assert.equal(/4821|1111/.test(body.error.message), false);
    }

    for (const fullName of ['', '   ', 'ab', 42, null]) {
      const { status, body } = await call('POST', '/api/seniors', { as: CG, body: { fullName, pin: '4821' } });
      assert.equal(status, 400);
      assert.equal(body.error.code, 'INVALID_NAME');
    }

    for (const timezone of ['Marte/Olympus', 'America/Bogotá', 'GMT+99', 42]) {
      const { status, body } = await call('POST', '/api/seniors', { as: CG, body: { fullName: 'Rosa Pérez', pin: '4821', timezone } });
      assert.equal(status, 400);
      assert.equal(body.error.code, 'INVALID_TIMEZONE');
    }

    for (const timezone of [undefined, null, '', '   ']) {
      const { status, body } = await call('POST', '/api/seniors', { as: CG, body: { fullName: 'Rosa Pérez', pin: '4821', timezone } });
      assert.equal(status, 201);
      assert.equal(body.timezone, 'America/Bogota');
    }

    assert.equal(writes.length, 4);
    assert.equal(writes.every((w) => w.pinHash !== '4821'), true);
  });
});

test('S4/S6: list and detail never cross the family line and never leak the hash', async () => {
  await withServer(async ({ call }) => {
    const list = await call('GET', '/api/seniors', { as: CG });
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.seniors.map((s) => s.fullName), ['Rosa', 'Legacy']);
    assert.equal(/pinHash|Ana/.test(list.text), false);
    assert.equal(
      list.body.seniors.find((s) => s.fullName === 'Legacy').linkStatus,
      'LINKED'
    );

    const own = await call('GET', `/api/seniors/${SENIOR}`, { as: CG });
    assert.equal(own.status, 200);
    assert.equal(own.body.id, SENIOR);
    assert.equal(/pinHash/.test(own.text), false);

    const answers = await Promise.all([
      call('GET', '/api/seniors/abc', { as: CG }),
      call('GET', `/api/seniors/${FOREIGN}`, { as: CG }),
      call('GET', '/api/seniors/507f1f77bcf86cd799439999', { as: CG }),
      call('GET', `/api/seniors/${OTHER_CG}`, { as: CG })
    ]);
    for (const answer of answers) {
      assert.equal(answer.status, 404);
      assert.equal(answer.body.error.code, 'SENIOR_NOT_FOUND');
    }
    assert.deepEqual(new Set(answers.map((a) => a.text)).size, 1);
  });
});
