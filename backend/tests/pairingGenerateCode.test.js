'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { GeneratePairingCode } = require('../src/modules/pairing/application/GeneratePairingCode');

/**
 * HU-006 T1 (S1, S3, S5): the code belongs to a profile, not to the account, and it lives
 * 24 hours. Every rejection here must write nothing: neither a code nor an invalidation.
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
const CONFIG = { pairing: { codeLength: 6, ttlMinutes: 1440, maxGenerationAttempts: 5 } };

function build({ createFails = false, collisions = 0 } = {}) {
  const users = new Map([
    [PENDING, { id: PENDING, role: 'SENIOR', fullName: 'Rosa', caregiverId: CG, linkStatus: 'PENDING' }],
    [LINKED, { id: LINKED, role: 'SENIOR', fullName: 'Ana', caregiverId: CG, linkStatus: 'LINKED' }],
    // Documento anterior a HU-005: sin `linkStatus` cuenta como vinculado.
    [LEGACY, { id: LEGACY, role: 'SENIOR', fullName: 'Vieja', caregiverId: CG }],
    [FOREIGN, { id: FOREIGN, role: 'SENIOR', fullName: 'Otra', caregiverId: OTHER_CG, linkStatus: 'PENDING' }],
    [CAREGIVER_PROFILE, { id: CAREGIVER_PROFILE, role: 'CAREGIVER', email: 'otro@x.co' }]
  ]);

  const events = [];
  const codes = [];
  const invalidations = [];
  let remainingCollisions = collisions;

  const pairingRepository = {
    async existsByCode() {
      if (remainingCollisions > 0) {
        remainingCollisions -= 1;
        return true;
      }

      return false;
    },
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

      const record = { id: `pc-${codes.length + 1}`, createdAt: FIXED_NOW, ...data };
      codes.push(record);
      return record;
    }
  };

  const useCase = new GeneratePairingCode({
    pairingRepository,
    userRepository: { async findById(id) { return users.get(id) ?? null; } },
    config: CONFIG,
    now: () => FIXED_NOW
  });

  return { useCase, events, codes, invalidations };
}

function rejectsWith(promise, statusCode, code) {
  return assert.rejects(promise, (error) => {
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.code, code);
    return true;
  });
}

test('S1: the code is six digits, belongs to the profile and lives 24 hours', async () => {
  const { useCase, codes } = build();

  const result = await useCase.execute({ caregiverId: CG, seniorId: PENDING });

  assert.match(result.code, /^\d{6}$/);
  assert.equal(result.seniorId, PENDING);
  assert.equal(result.expiresAt.toISOString(), '2024-05-02T10:00:00.000Z');
  assert.equal(codes.length, 1);
  assert.equal(codes[0].seniorId, PENDING);
  assert.equal(codes[0].caregiverId, CG);
  assert.equal(codes[0].expiresAt.toISOString(), '2024-05-02T10:00:00.000Z');
});

test('S3: a missing or malformed seniorId is a 400 and writes nothing', async () => {
  const { useCase, codes, invalidations } = build();

  for (const seniorId of [undefined, null, '', '   ', 'abc', 12345, {}, PENDING.slice(1)]) {
    await rejectsWith(useCase.execute({ caregiverId: CG, seniorId }), 400, 'SENIOR_ID_REQUIRED');
  }

  assert.deepEqual(codes, []);
  assert.deepEqual(invalidations, []);
});

test('S3: another family profile, an unknown id and a caregiver account are all a 404', async () => {
  const { useCase, codes, invalidations } = build();

  for (const seniorId of [FOREIGN, GHOST, CAREGIVER_PROFILE, CG]) {
    await rejectsWith(useCase.execute({ caregiverId: CG, seniorId }), 404, 'SENIOR_NOT_FOUND');
  }

  assert.deepEqual(codes, []);
  assert.deepEqual(invalidations, []);
});

test('S3: a linked profile is a 409, and a pre-HU-005 profile without linkStatus counts as linked', async () => {
  const { useCase, codes, invalidations } = build();

  await rejectsWith(useCase.execute({ caregiverId: CG, seniorId: LINKED }), 409, 'SENIOR_ALREADY_LINKED');
  await rejectsWith(useCase.execute({ caregiverId: CG, seniorId: LEGACY }), 409, 'SENIOR_ALREADY_LINKED');

  assert.deepEqual(codes, []);
  assert.deepEqual(invalidations, []);
});

test('S2: the previous codes of that profile are invalidated before the new one is created', async () => {
  const { useCase, events, invalidations } = build();

  await useCase.execute({ caregiverId: CG, seniorId: PENDING });

  assert.deepEqual(events.map(([name]) => name), ['invalidate', 'create']);
  assert.deepEqual(invalidations, [{ caregiverId: CG, seniorId: PENDING }]);
});

test('S2: if creating the new code fails the previous one is already invalidated', async () => {
  const { useCase, events, codes, invalidations } = build({ createFails: true });

  await assert.rejects(useCase.execute({ caregiverId: CG, seniorId: PENDING }), /database is down/);

  assert.deepEqual(events.map(([name]) => name), ['invalidate', 'create']);
  assert.equal(invalidations.length, 1);
  assert.deepEqual(codes, []);
});

test('PRESERVE: a colliding code is retried, and exhausting the attempts is a 503', async () => {
  const retried = build({ collisions: 2 });
  const result = await retried.useCase.execute({ caregiverId: CG, seniorId: PENDING });

  assert.match(result.code, /^\d{6}$/);
  assert.equal(retried.codes.length, 1);

  const exhausted = build({ collisions: 10 });

  await rejectsWith(
    exhausted.useCase.execute({ caregiverId: CG, seniorId: PENDING }),
    503,
    'PAIRING_CODE_UNAVAILABLE'
  );
  assert.deepEqual(exhausted.codes, []);
});
