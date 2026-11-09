'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CreateSeniorProfile } = require('../src/modules/seniors/application/CreateSeniorProfile');
const {
  DEFAULT_TIMEZONE,
  PIN_HASH_ROUNDS
} = require('../src/modules/seniors/domain/seniorProfile');
const {
  BcryptPasswordHasher
} = require('../src/modules/auth/infrastructure/BcryptPasswordHasher');
const {
  InvalidFullNameError,
  InvalidPinError,
  InvalidTimeZoneError
} = require('../src/shared/errors');

const CAREGIVER_ID = 'caregiver-1';
const VALID = Object.freeze({ caregiverId: CAREGIVER_ID, fullName: 'Rosa Pérez', pin: '4821' });

function createFakeUserRepository(seed = []) {
  const users = new Map(seed.map((user) => [user.id, user]));
  const writes = [];
  let counter = 0;

  return {
    users,
    writes,
    async create(data) {
      counter += 1;
      const stored = {
        id: `user-${counter}`,
        createdAt: new Date('2024-05-01T12:00:00.000Z'),
        ...data
      };
      users.set(stored.id, stored);
      writes.push(stored);
      return stored;
    }
  };
}

function createFakeHasher() {
  const hashed = [];

  return {
    hashed,
    async hash(plain) {
      hashed.push(plain);
      return `hashed:${plain}`;
    }
  };
}

function build({ hasher = createFakeHasher(), repository = createFakeUserRepository() } = {}) {
  return {
    hasher,
    repository,
    useCase: new CreateSeniorProfile({ userRepository: repository, pinHasher: hasher })
  };
}

test('creates a pending profile owned by the caregiver, with the default time zone', async () => {
  const { useCase, repository } = build();

  const result = await useCase.execute(VALID);

  assert.equal(result.linkStatus, 'PENDING');
  assert.equal(result.timezone, DEFAULT_TIMEZONE);
  assert.equal(result.fullName, 'Rosa Pérez');
  assert.equal(typeof result.id, 'string');

  const stored = repository.writes[0];
  assert.equal(stored.caregiverId, CAREGIVER_ID);
  assert.equal(stored.role, 'SENIOR');
  assert.equal(stored.linkStatus, 'PENDING');
  assert.equal(stored.timezone, DEFAULT_TIMEZONE);
});

test('the PIN is stored as a bcrypt hash with a cost of at least 12, never in clear text', async () => {
  const { useCase, repository } = build({
    hasher: new BcryptPasswordHasher({ saltRounds: PIN_HASH_ROUNDS })
  });

  const result = await useCase.execute(VALID);

  const stored = repository.writes[0];
  assert.notEqual(stored.pinHash, VALID.pin);
  assert.match(stored.pinHash, /^\$2[aby]\$/);
  assert.equal(Number(stored.pinHash.split('$')[2]), PIN_HASH_ROUNDS);
  assert.ok(Number(stored.pinHash.split('$')[2]) >= 12);
  // The hash is a persistence detail: the response cannot carry it.
  assert.equal(Object.hasOwn(result, 'pinHash'), false);
  assert.equal(Object.hasOwn(result, 'pin'), false);
});

test('rejects any PIN that is not exactly four ASCII digits, without hashing or writing', async () => {
  const rejected = ['123', '12345', '12a4', ' 1234', '1234 ', '', '１２３４', '+4821', 4821, null, undefined];

  for (const pin of rejected) {
    const { useCase, repository, hasher } = build();

    await assert.rejects(() => useCase.execute({ ...VALID, pin }), InvalidPinError);

    assert.equal(repository.writes.length, 0, `stored something for pin ${String(pin)}`);
    assert.equal(hasher.hashed.length, 0, `hashed ${String(pin)} before validating it`);
  }
});

test('accepts a PIN with a leading zero', async () => {
  const { useCase, repository } = build();

  await useCase.execute({ ...VALID, pin: '0007' });

  assert.equal(repository.writes[0].pinHash, 'hashed:0007');
});

test('time zone: absent, null or blank falls back to America/Bogota', async () => {
  for (const timezone of [undefined, null, '', '   ']) {
    const { useCase, repository } = build();

    const result = await useCase.execute({ ...VALID, timezone });

    assert.equal(result.timezone, 'America/Bogota');
    assert.equal(repository.writes[0].timezone, 'America/Bogota');
  }
});

test('time zone: an explicit valid zone is kept, trimmed and canonicalized', async () => {
  const { useCase, repository } = build();

  const result = await useCase.execute({ ...VALID, timezone: ' America/Lima ' });

  assert.equal(result.timezone, 'America/Lima');
  assert.equal(repository.writes[0].timezone, 'America/Lima');
});

test('time zone: a differently cased zone is stored in its canonical spelling', async () => {
  const { useCase, repository } = build();

  const result = await useCase.execute({ ...VALID, timezone: 'america/lima' });

  assert.equal(result.timezone, 'America/Lima');
  assert.equal(repository.writes[0].timezone, 'America/Lima');
});

test('time zone: an invalid zone is rejected instead of silently becoming Bogota', async () => {
  for (const timezone of ['America/Bogotá', 'Marte/Olympus', 'GMT+99', 42]) {
    const { useCase, repository } = build();

    await assert.rejects(() => useCase.execute({ ...VALID, timezone }), InvalidTimeZoneError);

    assert.equal(repository.writes.length, 0);
  }
});

test('rejects an empty or too short full name before hashing the PIN', async () => {
  for (const fullName of ['', '   ', 'ab', null, undefined, 42]) {
    const { useCase, repository, hasher } = build();

    await assert.rejects(() => useCase.execute({ ...VALID, fullName }), InvalidFullNameError);

    assert.equal(repository.writes.length, 0);
    assert.equal(hasher.hashed.length, 0);
  }
});

test('normalizes the full name before storing it', async () => {
  const { useCase, repository } = build();

  const result = await useCase.execute({ ...VALID, fullName: '  Rosa   Pérez  ' });

  assert.equal(result.fullName, 'Rosa Pérez');
  assert.equal(repository.writes[0].fullName, 'Rosa Pérez');
});

test('the senior never gets a password nor a mailbox of its own', async () => {
  const { useCase, repository } = build();

  await useCase.execute(VALID);

  const stored = repository.writes[0];
  assert.equal(stored.passwordHash ?? null, null);
  assert.match(stored.email, /^senior\+[0-9a-f-]{12}@seniors\.local$/);
});
