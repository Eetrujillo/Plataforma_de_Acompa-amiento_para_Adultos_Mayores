'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ListSeniorProfiles } = require('../src/modules/seniors/application/ListSeniorProfiles');
const { GetSeniorProfile } = require('../src/modules/seniors/application/GetSeniorProfile');
const { SeniorNotFoundError } = require('../src/shared/errors');

const OWNER = 'caregiver-1';
const STRANGER = 'caregiver-2';
const SENIOR_ID = '507f1f77bcf86cd799439011';
const OTHER_SENIOR_ID = '507f1f77bcf86cd799439012';

/**
 * HU-005 S4: ownership is decided in the use case, with the caregiver id received as a
 * parameter. These fakes return every row they hold, so a use case that forgets to scope
 * the read cannot pass by accident.
 */
function createFakeUserRepository(seed) {
  const users = new Map(seed.map((user) => [user.id, user]));
  const calls = [];

  return {
    calls,
    async findById(id) {
      calls.push({ method: 'findById', id });
      return users.get(id) ?? null;
    },
    async listSeniorsByCaregiver(caregiverId) {
      calls.push({ method: 'listSeniorsByCaregiver', caregiverId });
      return [...users.values()].filter(
        (user) => user.caregiverId === caregiverId && user.role === 'SENIOR'
      );
    }
  };
}

function buildSeed() {
  return [
    {
      id: SENIOR_ID,
      fullName: 'Rosa Pérez',
      role: 'SENIOR',
      caregiverId: OWNER,
      timezone: 'America/Bogota',
      linkStatus: 'PENDING',
      pinHash: '$2b$12$secret-hash-of-rosa',
      createdAt: new Date('2024-05-01T12:00:00.000Z')
    },
    {
      id: OTHER_SENIOR_ID,
      fullName: 'Ana Gómez',
      role: 'SENIOR',
      caregiverId: STRANGER,
      timezone: 'America/Lima',
      linkStatus: 'LINKED',
      pinHash: '$2b$12$secret-hash-of-ana',
      createdAt: new Date('2024-05-02T12:00:00.000Z')
    },
    {
      // A caregiver id must never resolve as a senior profile even when it is passed to
      // the by-id endpoint: the role is part of the ownership rule.
      id: '507f1f77bcf86cd799439013',
      fullName: 'Otro Familiar',
      role: 'CAREGIVER',
      caregiverId: null,
      createdAt: new Date('2024-05-03T12:00:00.000Z')
    }
  ];
}

function build() {
  const userRepository = createFakeUserRepository(buildSeed());
  return {
    userRepository,
    list: new ListSeniorProfiles({ userRepository }),
    get: new GetSeniorProfile({ userRepository })
  };
}

test('lists only the profiles of the caregiver asking, without the PIN hash', async () => {
  const { list, userRepository } = build();

  const result = await list.execute({ caregiverId: OWNER });

  assert.deepEqual(result.seniors.map((senior) => senior.fullName), ['Rosa Pérez']);
  assert.deepEqual(userRepository.calls, [
    { method: 'listSeniorsByCaregiver', caregiverId: OWNER }
  ]);
  for (const senior of result.seniors) {
    assert.equal(Object.hasOwn(senior, 'pinHash'), false);
    assert.equal(Object.hasOwn(senior, 'email'), false);
  }
});

test('a caregiver without profiles gets an empty list, not an error', async () => {
  const { list } = build();

  const result = await list.execute({ caregiverId: 'caregiver-without-profiles' });

  assert.deepEqual(result, { seniors: [] });
});

test('returns the profile when the caregiver asking is the owner', async () => {
  const { get } = build();

  const result = await get.execute({ caregiverId: OWNER, seniorId: SENIOR_ID });

  assert.deepEqual(result, {
    id: SENIOR_ID,
    fullName: 'Rosa Pérez',
    timezone: 'America/Bogota',
    linkStatus: 'PENDING',
    createdAt: new Date('2024-05-01T12:00:00.000Z')
  });
  assert.equal(Object.hasOwn(result, 'pinHash'), false);
});

test("another caregiver's profile is a 404, indistinguishable from a missing one", async () => {
  const { get } = build();

  const foreign = get.execute({ caregiverId: OWNER, seniorId: OTHER_SENIOR_ID });
  const missing = get.execute({ caregiverId: OWNER, seniorId: '507f1f77bcf86cd7994390ff' });

  await assert.rejects(() => foreign, SeniorNotFoundError);
  await assert.rejects(() => missing, SeniorNotFoundError);

  const foreignError = await foreign.catch((error) => error);
  const missingError = await missing.catch((error) => error);
  assert.equal(foreignError.statusCode, 404);
  assert.equal(foreignError.code, 'SENIOR_NOT_FOUND');
  assert.equal(foreignError.message, missingError.message);
});

test('a caregiver id resolves as a profile only when it is a senior', async () => {
  const { get } = build();

  await assert.rejects(
    () => get.execute({ caregiverId: OWNER, seniorId: '507f1f77bcf86cd799439013' }),
    SeniorNotFoundError
  );
});

test('a document written before HU-005 reads as LINKED, not as pending', async () => {
  const userRepository = createFakeUserRepository([
    {
      id: SENIOR_ID,
      fullName: 'Rosa Pérez',
      role: 'SENIOR',
      caregiverId: OWNER,
      createdAt: new Date('2024-05-01T12:00:00.000Z')
    }
  ]);
  const get = new GetSeniorProfile({ userRepository });

  const result = await get.execute({ caregiverId: OWNER, seniorId: SENIOR_ID });

  assert.equal(result.linkStatus, 'LINKED');
  assert.equal(result.timezone, 'America/Bogota');
});

test('a malformed id is a 404 and never reaches the repository', async () => {
  const { get, userRepository } = build();

  for (const seniorId of ['abc', '', 'x'.repeat(24), null, undefined, 42]) {
    await assert.rejects(() => get.execute({ caregiverId: OWNER, seniorId }), SeniorNotFoundError);
  }

  assert.deepEqual(userRepository.calls, []);
});
