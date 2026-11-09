'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CreateSeniorProfile } = require('../src/modules/seniors/application/CreateSeniorProfile');
const { ListLinkedSeniors } = require('../src/modules/pairing/application/ListLinkedSeniors');
const { BcryptPasswordHasher } = require('../src/modules/auth/infrastructure/BcryptPasswordHasher');
const { PrismaUserRepository } = require('../src/modules/auth/infrastructure/PrismaUserRepository');
const { PIN_HASH_ROUNDS } = require('../src/modules/seniors/domain/seniorProfile');

/**
 * HU-005 S2/S7: the PIN is validated before any bcrypt work, the shared hasher keeps the
 * password cost, and a caregiver row is still created with the schema defaults.
 */

function createSpyHasher() {
  const calls = [];
  return {
    calls,
    async hash(plain) {
      calls.push(plain);
      return `hashed:${plain}`;
    }
  };
}

function build() {
  const writes = [];
  const hasher = createSpyHasher();
  const useCase = new CreateSeniorProfile({
    userRepository: { async create(data) { writes.push(data); return { id: 'u1', createdAt: new Date(), ...data }; } },
    pinHasher: hasher
  });
  return { useCase, writes, hasher };
}

test('S2: no rejected input reaches the hasher', async () => {
  const rejected = [
    ['pin', '1234\n'], ['pin', ' 1234'], ['pin', '1234 '], ['pin', '１２３４'], ['pin', '١٢٣٤'],
    ['pin', '12a4'], ['pin', '123'], ['pin', '12345'], ['pin', ''], ['pin', 4821], ['pin', null],
    ['fullName', ''], ['fullName', 'ab'], ['timezone', 'Marte/Olympus'], ['timezone', 42]
  ];

  for (const [field, value] of rejected) {
    const { useCase, writes, hasher } = build();
    await assert.rejects(
      () => useCase.execute({ caregiverId: 'cg-1', fullName: 'Rosa Pérez', pin: '4821', [field]: value }),
      `accepted ${field}=${JSON.stringify(value)}`
    );
    assert.deepEqual(hasher.calls, [], `hashed before validating ${field}=${JSON.stringify(value)}`);
    assert.deepEqual(writes, []);
  }
});

test('S2: the real hasher stores a cost 12 bcrypt hash of the PIN', async () => {
  const writes = [];
  const useCase = new CreateSeniorProfile({
    userRepository: { async create(data) { writes.push(data); return { id: 'u1', createdAt: new Date(), ...data }; } },
    pinHasher: new BcryptPasswordHasher({ saltRounds: PIN_HASH_ROUNDS })
  });

  const result = await useCase.execute({ caregiverId: 'cg-1', fullName: 'Rosa Pérez', pin: '0007' });

  assert.match(writes[0].pinHash, /^\$2[aby]\$12\$/);
  assert.equal(Object.hasOwn(result, 'pinHash'), false);
  assert.equal(Object.hasOwn(result, 'pin'), false);
});

test('regression: the login/register hasher keeps cost 10', async () => {
  const hash = await new BcryptPasswordHasher().hash('una contraseña');
  assert.match(hash, /^\$2[aby]\$10\$/);
});

test('regression: a caregiver row is created without touching the senior columns', async () => {
  const captured = [];
  const repository = new PrismaUserRepository({
    prisma: { user: { async create({ data }) { captured.push(data); return { id: 'u1', ...data }; } } }
  });

  await repository.create({ email: 'cg@x.co', fullName: 'Carla', role: 'CAREGIVER' });
  await repository.create({
    email: 's@x.co', fullName: 'Rosa', role: 'SENIOR', caregiverId: 'cg-1',
    pinHash: '$2a$12$h', timezone: 'America/Lima', linkStatus: 'PENDING'
  });

  assert.equal(Object.hasOwn(captured[0], 'pinHash'), false);
  assert.equal(Object.hasOwn(captured[0], 'timezone'), false);
  assert.equal(Object.hasOwn(captured[0], 'linkStatus'), false);
  assert.equal(captured[1].pinHash, '$2a$12$h');
  assert.equal(captured[1].timezone, 'America/Lima');
  assert.equal(captured[1].linkStatus, 'PENDING');
  // S8: no consent is stamped for a profile the senior did not create.
  assert.equal(captured[1].acceptedTermsAt, null);
  assert.equal(captured[1].termsVersion, null);
});

test('S7: the picker drops PENDING but keeps a document written before HU-005', async () => {
  const seed = [
    { id: 'linked', fullName: 'Rosa', phone: null, caregiverId: 'cg-1', linkStatus: 'LINKED' },
    { id: 'legacy', fullName: 'Legacy', phone: '+57300', caregiverId: 'cg-1' },
    { id: 'pending', fullName: 'Pendiente', phone: null, caregiverId: 'cg-1', linkStatus: 'PENDING' }
  ];
  const useCase = new ListLinkedSeniors({
    userRepository: { async listSeniorsByCaregiver() { return seed; } }
  });

  const { seniors } = await useCase.execute({ caregiverId: 'cg-1' });

  assert.deepEqual(seniors.map((s) => s.id), ['linked', 'legacy']);
});

test('S3: every zone the panel offers is accepted unchanged by the domain', async () => {
  const { isValidTimeZone } = require('../src/modules/seniors/domain/seniorProfile');
  const zones = [
    'America/Bogota', 'America/Lima', 'America/Guayaquil', 'America/Caracas',
    'America/Mexico_City', 'America/Argentina/Buenos_Aires', 'America/Santiago'
  ];

  for (const zone of zones) {
    assert.equal(isValidTimeZone(zone), true, zone);
    assert.equal(isValidTimeZone('Marte/Olympus'), false);
  }
});
