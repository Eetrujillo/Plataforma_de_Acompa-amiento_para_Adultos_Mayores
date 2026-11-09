'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { GeneratePairingToken } = require('../src/modules/pairing/application/GeneratePairingToken');
const { RedeemPairingToken } = require('../src/modules/pairing/application/RedeemPairingToken');
const { ListLinkedSeniors } = require('../src/modules/pairing/application/ListLinkedSeniors');
const { createPairingController } = require('../src/modules/pairing/infrastructure/PairingController');
const { createPairingRouter } = require('../src/modules/pairing/infrastructure/pairingRoutes');
const { QrGenerator } = require('../src/modules/pairing/infrastructure/QrGenerator');
const { createAuthMiddleware } = require('../src/shared/middlewares/authMiddleware');
const { JwtTokenService } = require('../src/modules/auth/infrastructure/JwtTokenService');
const { hashPairingToken } = require('../src/modules/pairing/domain/pairingToken');

/**
 * HU-006 T7 en el borde HTTP: `POST /api/pairing/qr` (cuidador) emite el QR y
 * `POST /api/pairing/redeem` (público) canjea el token que viaja adentro. El token no aparece
 * en ninguna respuesta; el generador de QR se espía sólo para poder canjear en el test.
 */

const CG = '507f1f77bcf86cd7994390aa';
const OTHER_CG = '507f1f77bcf86cd7994390cc';
const PENDING = '507f1f77bcf86cd7994390bb';
const LINKED = '507f1f77bcf86cd7994390dd';
const FOREIGN = '507f1f77bcf86cd799439011';

const CONFIG = { pairing: { ttlMinutes: 1440 } };
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

  const records = new Map();
  const createdSeniors = [];
  const qrTokens = [];
  let counter = 0;

  const pairingRepository = {
    records,
    async invalidateOutstanding({ caregiverId, seniorId }) {
      for (const record of records.values()) {
        if (record.caregiverId === caregiverId && record.seniorId === seniorId && !record.usedAt && !record.invalidatedAt) {
          record.invalidatedAt = new Date();
        }
      }
    },
    async create({ tokenHash, caregiverId, seniorId, expiresAt }) {
      counter += 1;
      const record = { id: `pt-${counter}`, tokenHash, caregiverId, seniorId, expiresAt, usedAt: null, invalidatedAt: null };
      records.set(tokenHash, record);
      return record;
    },
    async findByTokenHash(tokenHash) {
      const record = records.get(tokenHash);
      return record ? { ...record } : null;
    },
    async claim({ id }) {
      const record = [...records.values()].find((candidate) => candidate.id === id);

      if (!record || record.usedAt || record.invalidatedAt || record.expiresAt.getTime() <= Date.now()) {
        return { claimed: false };
      }

      record.usedAt = new Date();
      return { claimed: true };
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

  // El QR se genera de verdad; el espía guarda el token para poder canjearlo desde el test.
  const realQr = new QrGenerator();
  const qrGenerator = {
    tokens: qrTokens,
    async toDataUrl(token) {
      qrTokens.push(token);
      return realQr.toDataUrl(token);
    }
  };

  const tokenService = new JwtTokenService({ secret: 's', expiresIn: '1h' });
  const authMiddleware = createAuthMiddleware({ verifyToken: (token) => tokenService.verify(token), userRepository });

  const controller = createPairingController({
    generatePairingToken: new GeneratePairingToken({ pairingRepository, userRepository, qrGenerator, config: CONFIG }),
    redeemPairingToken: new RedeemPairingToken({ pairingRepository, userRepository, tokenService }),
    listLinkedSeniors: new ListLinkedSeniors({ userRepository })
  });

  const router = createPairingRouter({ controller, authMiddleware });
  const app = createApp({ config: { corsOrigin: '*' }, modules: { pairing: router }, logger: { error() {} } });
  const token = (id) => tokenService.sign({ sub: id, role: users.get(id).role, email: users.get(id).email, sv: 0 });

  return { app, token, users, records, createdSeniors, qrTokens };
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

test('S1/S5: el 201 trae expiresAt, seniorId y el QR, nunca el token', async () => {
  await withServer(async ({ call, records, qrTokens }) => {
    const before = Date.now();
    const { status, body, text } = await call('POST', '/api/pairing/qr', { as: CG, body: { seniorId: PENDING } });

    assert.equal(status, 201);
    assert.deepEqual(Object.keys(body).sort(), ['expiresAt', 'qrCodeDataUrl', 'seniorId']);
    assert.equal(body.token, undefined);
    assert.equal(body.seniorId, PENDING);
    assert.match(body.qrCodeDataUrl, /^data:image\/png;base64,/);

    // El token que viaja dentro del QR: 43 caracteres base64url, y ni una copia en el cuerpo.
    assert.equal(qrTokens.length, 1);
    assert.match(qrTokens[0], /^[A-Za-z0-9_-]{43}$/);
    assert.equal(text.includes(qrTokens[0]), false);

    const ttl = Date.parse(body.expiresAt) - before;
    assert.equal(ttl >= A_DAY - 1_000 && ttl < A_DAY + A_DAY, true, `ttl ${ttl}`);

    // En la base queda sólo el hash de ese token, y el valor crudo no está en ningún registro.
    const record = records.get(hashPairingToken(qrTokens[0]));
    assert.equal(Boolean(record), true);
    assert.equal(record.seniorId, PENDING);
    assert.equal(record.tokenHash, hashPairingToken(qrTokens[0]));
    assert.notEqual(record.tokenHash, qrTokens[0]);
    assert.equal(JSON.stringify([...records.values()]).includes(qrTokens[0]), false);
  });
});

test('S3: cada rechazo de la emisión responde su estado y no escribe nada', async () => {
  await withServer(async ({ call, records, qrTokens, users }) => {
    const missing = await call('POST', '/api/pairing/qr', { as: CG, body: {} });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error.code, 'SENIOR_ID_REQUIRED');

    const malformed = await call('POST', '/api/pairing/qr', { as: CG, body: { seniorId: 'abc' } });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error.code, 'SENIOR_ID_REQUIRED');

    for (const seniorId of [FOREIGN, '507f1f77bcf86cd799439999', CG]) {
      const answer = await call('POST', '/api/pairing/qr', { as: CG, body: { seniorId } });
      assert.equal(answer.status, 404, seniorId);
      assert.equal(answer.body.error.code, 'SENIOR_NOT_FOUND', seniorId);
    }

    const linked = await call('POST', '/api/pairing/qr', { as: CG, body: { seniorId: LINKED } });
    assert.equal(linked.status, 409);
    assert.equal(linked.body.error.code, 'SENIOR_ALREADY_LINKED');

    // El dueño sale de la sesión: mandar otro caregiverId no abre otra familia.
    const smuggled = await call('POST', '/api/pairing/qr', {
      as: CG,
      body: { seniorId: FOREIGN, caregiverId: OTHER_CG }
    });
    assert.equal(smuggled.status, 404);
    assert.equal(smuggled.body.error.code, 'SENIOR_NOT_FOUND');

    assert.equal(records.size, 0);
    assert.equal(qrTokens.length, 0);
    assert.equal(users.get(PENDING).linkStatus, 'PENDING');
  });
});

test('S3: sólo una sesión de cuidador puede pedir un QR', async () => {
  await withServer(async ({ call }) => {
    assert.equal((await call('POST', '/api/pairing/qr', { body: { seniorId: PENDING } })).status, 401);

    const asSenior = await call('POST', '/api/pairing/qr', { as: PENDING, body: { seniorId: PENDING } });
    assert.equal(asSenior.status, 403);
  });
});

test('S2: el token anterior del perfil deja de canjearse cuando se emite otro', async () => {
  await withServer(async ({ call, qrTokens }) => {
    const first = await call('POST', '/api/pairing/qr', { as: CG, body: { seniorId: PENDING } });
    const second = await call('POST', '/api/pairing/qr', { as: CG, body: { seniorId: PENDING } });

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);

    const replaced = await call('POST', '/api/pairing/redeem', { body: { token: qrTokens[0] } });
    assert.equal(replaced.status, 400);
    assert.equal(replaced.body.error.code, 'VALIDATION_ERROR');

    const redeemed = await call('POST', '/api/pairing/redeem', { body: { token: qrTokens[1] } });
    assert.equal(redeemed.status, 201);
    assert.equal(redeemed.body.senior.id, PENDING);
  });
});

test('S5: /redeem responde 201 con la proyección publicada y no crea seniors', async () => {
  await withServer(async ({ call, users, createdSeniors, qrTokens }) => {
    await call('POST', '/api/pairing/qr', { as: CG, body: { seniorId: PENDING } });

    const { status, body, text } = await call('POST', '/api/pairing/redeem', {
      body: { token: qrTokens[0], fullName: 'Intruso', phone: '+573009998877' }
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
    // L9: el canje no crea el perfil, lo vincula.
    assert.equal(createdSeniors.length, 0);
    assert.equal(users.get(PENDING).linkStatus, 'LINKED');
    assert.equal(users.get(PENDING).fullName, 'Rosa Pérez');
  });
});

test('S2/S5: /redeem conserva 400 para mal formado/vencido/invalidado, 404 y 409', async () => {
  await withServer(async ({ call, qrTokens, records }) => {
    const malformed = await call('POST', '/api/pairing/redeem', { body: { token: '482913' } });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error.code, 'VALIDATION_ERROR');

    const missing = await call('POST', '/api/pairing/redeem', { body: { token: 'B'.repeat(43) } });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'NOT_FOUND');

    await call('POST', '/api/pairing/qr', { as: CG, body: { seniorId: PENDING } });
    const expired = qrTokens[0];
    records.get(hashPairingToken(expired)).expiresAt = new Date(Date.now() - 1_000);

    const expiredAnswer = await call('POST', '/api/pairing/redeem', { body: { token: expired } });
    assert.equal(expiredAnswer.status, 400);
    assert.equal(expiredAnswer.body.error.message, 'pairing token is invalid or expired');

    // Un segundo QR invalida el token del primero: mismo 400 y mismo mensaje que el vencido.
    await call('POST', '/api/pairing/qr', { as: CG, body: { seniorId: PENDING } });
    const invalidated = qrTokens[1];
    // El tercero es el que invalida al segundo y queda vivo.
    await call('POST', '/api/pairing/qr', { as: CG, body: { seniorId: PENDING } });
    const replacedAnswer = await call('POST', '/api/pairing/redeem', { body: { token: invalidated } });
    assert.equal(replacedAnswer.status, 400);
    assert.deepEqual(replacedAnswer.body, expiredAnswer.body);

    const fresh = qrTokens[2];
    assert.equal((await call('POST', '/api/pairing/redeem', { body: { token: fresh } })).status, 201);

    const again = await call('POST', '/api/pairing/redeem', { body: { token: fresh } });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.message, 'pairing token already used');

    // El token del QR nunca aparece en una respuesta de error.
    for (const answer of [expiredAnswer, replacedAnswer, again]) {
      assert.equal(answer.text.includes(fresh), false);
      assert.equal(answer.text.includes(expired), false);
      assert.equal(answer.text.includes(invalidated), false);
    }
  });
});

test('PRESERVE: GET /api/pairing/seniors sigue listando sólo los perfiles vinculados', async () => {
  await withServer(async ({ call }) => {
    const { status, body } = await call('GET', '/api/pairing/seniors', { as: CG });

    assert.equal(status, 200);
    assert.deepEqual(body, { seniors: [{ id: LINKED, fullName: 'Ana', phone: null }] });
  });
});
