'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { GeneratePairingToken } = require('../src/modules/pairing/application/GeneratePairingToken');
const { hashPairingToken } = require('../src/modules/pairing/domain/pairingToken');

/**
 * HU-006 T7 (S1, S2, S3): la emisión ya no entrega un código: entrega un QR. El token existe
 * sólo dentro de esa imagen, en la base queda su SHA-256, y el pedido se arma completo —token y
 * QR— antes de invalidar los tokens previos o escribir nada.
 *
 * Toda respuesta de error de acá escribe cero filas: ni token nuevo ni invalidación.
 */

const CG = '507f1f77bcf86cd7994390aa';
const OTHER_CG = '507f1f77bcf86cd7994390cc';
const PENDING = '507f1f77bcf86cd7994390bb';
const LINKED = '507f1f77bcf86cd7994390dd';
const LEGACY = '507f1f77bcf86cd799439022';
const FOREIGN = '507f1f77bcf86cd799439011';
const CAREGIVER_PROFILE = '507f1f77bcf86cd7994390ee';
const GHOST = '507f1f77bcf86cd799439999';

const FIXED_NOW = new Date('2024-05-01T10:00:00.000Z');
const CONFIG = { pairing: { ttlMinutes: 1440 } };

function build({ createFails = false, qrFails = false } = {}) {
  const users = new Map([
    [PENDING, { id: PENDING, role: 'SENIOR', fullName: 'Rosa', caregiverId: CG, linkStatus: 'PENDING' }],
    [LINKED, { id: LINKED, role: 'SENIOR', fullName: 'Ana', caregiverId: CG, linkStatus: 'LINKED' }],
    // Documento anterior a HU-005: sin `linkStatus` cuenta como vinculado.
    [LEGACY, { id: LEGACY, role: 'SENIOR', fullName: 'Vieja', caregiverId: CG }],
    [FOREIGN, { id: FOREIGN, role: 'SENIOR', fullName: 'Otra', caregiverId: OTHER_CG, linkStatus: 'PENDING' }],
    [CAREGIVER_PROFILE, { id: CAREGIVER_PROFILE, role: 'CAREGIVER', email: 'otro@x.co' }]
  ]);

  const events = [];
  const created = [];
  const invalidations = [];
  const qrTokens = [];

  const pairingRepository = {
    created,
    invalidations,
    async invalidateOutstanding(data) {
      events.push(['invalidate', data]);
      invalidations.push(data);
      return { count: 0 };
    },
    async create(data) {
      events.push(['create', data]);

      if (createFails) {
        throw new Error('database is down');
      }

      const record = { id: `pt-${created.length + 1}`, createdAt: FIXED_NOW, ...data };
      created.push(record);
      return record;
    }
  };

  const qrGenerator = {
    qrTokens,
    async toDataUrl(token) {
      events.push(['qr', token]);
      qrTokens.push(token);

      if (qrFails) {
        throw new Error('qr encoder exploded');
      }

      return 'data:image/png;base64,AAAA';
    }
  };

  const useCase = new GeneratePairingToken({
    pairingRepository,
    userRepository: { async findById(id) { return users.get(id) ?? null; } },
    qrGenerator,
    config: CONFIG,
    now: () => FIXED_NOW
  });

  return { useCase, events, created, invalidations, qrTokens };
}

function rejectsWith(promise, statusCode, code) {
  return assert.rejects(promise, (error) => {
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.code, code);
    return true;
  });
}

test('S1: la emisión entrega expiresAt, seniorId y el QR, y el token no sale en la respuesta', async () => {
  const { useCase, created, qrTokens } = build();

  const result = await useCase.execute({ caregiverId: CG, seniorId: PENDING });

  assert.deepEqual(Object.keys(result).sort(), ['expiresAt', 'qrCodeDataUrl', 'seniorId']);
  assert.equal(result.token, undefined);
  assert.equal(result.seniorId, PENDING);
  assert.equal(result.expiresAt.toISOString(), '2024-05-02T10:00:00.000Z');
  assert.match(result.qrCodeDataUrl, /^data:image\/png;base64,/);

  // El token existe una sola vez en el pedido: dentro del QR que se acaba de armar.
  assert.equal(qrTokens.length, 1);
  assert.match(qrTokens[0], /^[A-Za-z0-9_-]{43}$/);
  assert.equal(JSON.stringify(result).includes(qrTokens[0]), false);

  // En la base queda el hash, nunca el token.
  assert.equal(created.length, 1);
  assert.equal(created[0].tokenHash, hashPairingToken(qrTokens[0]));
  assert.notEqual(created[0].tokenHash, qrTokens[0]);
  assert.equal(Object.hasOwn(created[0], 'token'), false);
  assert.equal(created[0].seniorId, PENDING);
  assert.equal(created[0].caregiverId, CG);
  assert.equal(created[0].expiresAt.toISOString(), '2024-05-02T10:00:00.000Z');
});

test('S3: un seniorId ausente o mal formado es 400 y no escribe nada', async () => {
  const { useCase, created, invalidations, qrTokens } = build();

  for (const seniorId of [undefined, null, '', '   ', 'abc', 12345, {}, PENDING.slice(1)]) {
    await rejectsWith(useCase.execute({ caregiverId: CG, seniorId }), 400, 'SENIOR_ID_REQUIRED');
  }

  assert.deepEqual(created, []);
  assert.deepEqual(invalidations, []);
  assert.deepEqual(qrTokens, []);
});

test('S3: perfil de otra familia, id inexistente y cuenta de cuidador son 404 sin escribir', async () => {
  const { useCase, created, invalidations, qrTokens } = build();

  for (const seniorId of [FOREIGN, GHOST, CAREGIVER_PROFILE, CG]) {
    await rejectsWith(useCase.execute({ caregiverId: CG, seniorId }), 404, 'SENIOR_NOT_FOUND');
  }

  assert.deepEqual(created, []);
  assert.deepEqual(invalidations, []);
  assert.deepEqual(qrTokens, []);
});

test('S3: un perfil ya vinculado es 409, y uno anterior a HU-005 también', async () => {
  const { useCase, created, invalidations, qrTokens } = build();

  await rejectsWith(useCase.execute({ caregiverId: CG, seniorId: LINKED }), 409, 'SENIOR_ALREADY_LINKED');
  await rejectsWith(useCase.execute({ caregiverId: CG, seniorId: LEGACY }), 409, 'SENIOR_ALREADY_LINKED');

  assert.deepEqual(created, []);
  assert.deepEqual(invalidations, []);
  assert.deepEqual(qrTokens, []);
});

test('S2: los tokens previos del perfil se invalidan antes de persistir el nuevo', async () => {
  const { useCase, events, invalidations } = build();

  await useCase.execute({ caregiverId: CG, seniorId: PENDING });

  assert.deepEqual(events.map(([name]) => name), ['qr', 'invalidate', 'create']);
  assert.deepEqual(invalidations, [{ caregiverId: CG, seniorId: PENDING }]);
});

test('S2: si la persistencia falla el token anterior queda invalidado igual (falla cerrado)', async () => {
  const { useCase, events, created, invalidations } = build({ createFails: true });

  await assert.rejects(useCase.execute({ caregiverId: CG, seniorId: PENDING }), /database is down/);

  assert.deepEqual(events.map(([name]) => name), ['qr', 'invalidate', 'create']);
  assert.equal(invalidations.length, 1);
  assert.deepEqual(created, []);
});

test('S1/L9: si el QR no se puede generar responde 503 y no toca ningún token existente', async () => {
  const { useCase, events, created, invalidations } = build({ qrFails: true });

  await rejectsWith(useCase.execute({ caregiverId: CG, seniorId: PENDING }), 503, 'PAIRING_QR_UNAVAILABLE');

  // El orden importa: el QR se arma antes de invalidar, así un fallo del codificador no deja
  // al familiar sin QR y con el token anterior muerto, que es el defecto que esto corrige.
  assert.deepEqual(events.map(([name]) => name), ['qr']);
  assert.deepEqual(invalidations, []);
  assert.deepEqual(created, []);
});
