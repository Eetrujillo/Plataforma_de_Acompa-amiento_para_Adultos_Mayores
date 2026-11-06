'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { LinkSeniorApp } = require('../src/modules/pairing/application/LinkSeniorApp');

/**
 * HU-006 T2/T3 (S2, S4, S5, S6): canje de un solo uso reclamado con una escritura
 * condicional, y las dos ramas del código: el que apunta a un perfil (lo pasa a LINKED) y el
 * que viene sin perfil, emitido antes de esta HU (crea el senior, rama transitoria).
 *
 * El repositorio de mentira modela la escritura atómica del adaptador: `claim` sólo gana
 * cuando el registro sigue sin usar, sin invalidar y vigente.
 */

const CG = '507f1f77bcf86cd7994390aa';
const OTHER_CG = '507f1f77bcf86cd7994390cc';
const PENDING = '507f1f77bcf86cd7994390bb';
const LINKED = '507f1f77bcf86cd7994390dd';
const CODE = '482913';

const CREATED_AT = new Date('2024-05-01T10:00:00.000Z');

function codeRecord(overrides = {}) {
  return {
    id: 'pairing-1',
    code: CODE,
    caregiverId: CG,
    seniorId: PENDING,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    usedAt: null,
    invalidatedAt: null,
    ...overrides
  };
}

function createPairingStore(record) {
  const state = { ...record };
  const events = [];

  return {
    state,
    events,
    async findByCode(code) {
      events.push(['findByCode', code]);
      return code === state.code ? { ...state } : null;
    },
    async claim({ id }) {
      events.push(['claim', id]);

      if (id !== state.id || state.usedAt || state.invalidatedAt) {
        return { claimed: false };
      }

      state.usedAt = new Date();
      return { claimed: true };
    },
    async setSenior({ id, seniorId }) {
      events.push(['setSenior', { id, seniorId }]);
      state.seniorId = seniorId;
    }
  };
}

function createUserStore(seed = []) {
  const users = new Map(seed.map((user) => [user.id, { ...user }]));
  const created = [];
  const marked = [];
  let failWrite = false;

  return {
    users,
    created,
    marked,
    failNextWrite() {
      failWrite = true;
    },
    async findById(id) {
      const user = users.get(id);
      return user ? { ...user } : null;
    },
    async create(data) {
      if (failWrite) {
        failWrite = false;
        throw new Error('write failed');
      }

      const stored = { id: `senior-${created.length + 1}`, createdAt: CREATED_AT, ...data };
      created.push(stored);
      users.set(stored.id, stored);
      return { ...stored };
    },
    async markLinked(id) {
      if (failWrite) {
        failWrite = false;
        throw new Error('write failed');
      }

      marked.push(id);
      users.get(id).linkStatus = 'LINKED';
      return { ...users.get(id) };
    }
  };
}

const PENDING_PROFILE = {
  id: PENDING,
  role: 'SENIOR',
  email: 'senior+abc123@seniors.local',
  fullName: 'Rosa Pérez',
  phone: '+573001112233',
  caregiverId: CG,
  pinHash: '$2b$12$hash',
  timezone: 'America/Bogota',
  linkStatus: 'PENDING',
  createdAt: CREATED_AT
};

function build({ record = codeRecord(), users = [PENDING_PROFILE] } = {}) {
  const pairingRepository = createPairingStore(record);
  const userRepository = createUserStore(users);
  const tokens = [];
  const tokenService = {
    tokens,
    sign(claims) {
      tokens.push(claims);
      return `jwt:${claims.sub}`;
    }
  };

  return {
    pairingRepository,
    userRepository,
    tokens,
    useCase: new LinkSeniorApp({ pairingRepository, userRepository, tokenService })
  };
}

test('S5: a code with seniorId links that profile, creates no senior and signs its token', async () => {
  const { useCase, userRepository, pairingRepository, tokens } = build();

  const result = await useCase.execute({ code: CODE, fullName: 'Intruso', phone: '+573009998877' });

  assert.equal(result.token, `jwt:${PENDING}`);
  // S5 (L5): la proyección de auth se conserva completa y linkStatus/timezone son aditivos.
  assert.deepEqual(Object.keys(result.senior).sort(), [
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
  assert.equal(result.senior.id, PENDING);
  assert.equal(result.senior.role, 'SENIOR');
  assert.equal(result.senior.email, 'senior+abc123@seniors.local');
  assert.equal(result.senior.caregiverId, CG);
  assert.equal(result.senior.linkStatus, 'LINKED');
  assert.equal(result.senior.timezone, 'America/Bogota');
  assert.equal(Object.hasOwn(result.senior, 'pinHash'), false);

  // No se crea otro senior y el teléfono no edita la ficha del familiar.
  assert.deepEqual(userRepository.created, []);
  assert.equal(userRepository.users.get(PENDING).fullName, 'Rosa Pérez');
  assert.equal(userRepository.users.get(PENDING).phone, '+573001112233');
  assert.equal(userRepository.users.get(PENDING).linkStatus, 'LINKED');

  assert.deepEqual(userRepository.marked, [PENDING]);
  assert.equal(pairingRepository.state.usedAt instanceof Date, true);
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].sub, PENDING);
});

test('S5: a code whose profile is already linked answers 409 and does not burn the code', async () => {
  const { useCase, pairingRepository, userRepository } = build({
    users: [{ ...PENDING_PROFILE, id: LINKED, linkStatus: 'LINKED' }],
    record: codeRecord({ seniorId: LINKED })
  });

  await assert.rejects(useCase.execute({ code: CODE }), (error) => {
    assert.equal(error.statusCode, 409);
    assert.equal(error.code, 'SENIOR_ALREADY_LINKED');
    return true;
  });

  assert.equal(pairingRepository.state.usedAt, null);
  assert.deepEqual(userRepository.marked, []);
});

test('S5: the owner comes from the code, never from the body', async () => {
  const { useCase, userRepository } = build({ record: codeRecord({ seniorId: null }) });

  await useCase.execute({
    code: CODE,
    fullName: 'Rosa Pérez',
    phone: '+573001112233',
    caregiverId: OTHER_CG
  });

  assert.equal(userRepository.created[0].caregiverId, CG);
  assert.equal(userRepository.created[0].role, 'SENIOR');
});

test('S6: a code without seniorId keeps the previous behaviour and creates a LINKED senior', async () => {
  const { useCase, userRepository, pairingRepository, tokens } = build({
    record: codeRecord({ seniorId: null })
  });

  const result = await useCase.execute({ code: CODE, fullName: 'Rosa Pérez', phone: '+573001112233' });

  assert.equal(userRepository.created.length, 1);
  assert.equal(userRepository.created[0].linkStatus, 'LINKED');
  assert.equal(userRepository.created[0].caregiverId, CG);
  assert.equal(result.senior.id, userRepository.created[0].id);
  assert.equal(result.senior.linkStatus, 'LINKED');
  // La rama de compatibilidad responde el mismo contrato que la rama con perfil.
  assert.equal(result.senior.role, 'SENIOR');
  assert.equal(result.senior.caregiverId, CG);
  assert.equal(result.senior.timezone, 'America/Bogota');
  assert.equal(typeof result.senior.email, 'string');
  assert.deepEqual(pairingRepository.state.seniorId, userRepository.created[0].id);
  assert.equal(tokens.length, 1);
});

test('S4: the claim happens before the profile write', async () => {
  const { useCase, pairingRepository } = build();

  await useCase.execute({ code: CODE });

  const writes = pairingRepository.events.map(([name]) => name).filter((name) => name !== 'findByCode');
  assert.deepEqual(writes, ['claim']);
  assert.deepEqual(pairingRepository.events.map(([name]) => name), ['findByCode', 'claim']);
});

test('S4: if the profile write fails the code stays burnt, which fails closed', async () => {
  const { useCase, pairingRepository, userRepository } = build({ record: codeRecord({ seniorId: null }) });

  userRepository.failNextWrite();

  await assert.rejects(useCase.execute({ code: CODE, fullName: 'Rosa Pérez' }), /write failed/);
  assert.equal(pairingRepository.state.usedAt instanceof Date, true);
});

test('S2: an invalidated code and an expired code answer exactly the same', async () => {
  const invalidated = build({ record: codeRecord({ invalidatedAt: new Date() }) });
  const expired = build({ record: codeRecord({ expiresAt: new Date(Date.now() - 1000) }) });

  const answers = [];

  for (const { useCase, pairingRepository, userRepository } of [invalidated, expired]) {
    await assert.rejects(useCase.execute({ code: CODE }), (error) => {
      answers.push({ statusCode: error.statusCode, code: error.code, message: error.message });
      return true;
    });

    assert.equal(pairingRepository.state.usedAt, null);
    assert.deepEqual(userRepository.created, []);
    assert.deepEqual(userRepository.marked, []);
  }

  assert.equal(answers[0].statusCode, 400);
  assert.deepEqual(answers[0], answers[1]);
});

test('PRESERVE: a used code is a 409, a missing code a 404 and a malformed code a 400', async () => {
  const used = build({ record: codeRecord({ usedAt: new Date() }) });

  await assert.rejects(used.useCase.execute({ code: CODE }), (error) => {
    assert.equal(error.statusCode, 409);
    assert.equal(error.message, 'pairing code already used');
    return true;
  });
  assert.deepEqual(used.userRepository.created, []);

  const missing = build();

  await assert.rejects(missing.useCase.execute({ code: '000000' }), (error) => {
    assert.equal(error.statusCode, 404);
    assert.equal(error.code, 'NOT_FOUND');
    return true;
  });

  const malformed = build();

  await assert.rejects(malformed.useCase.execute({ code: '48a913' }), (error) => {
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, 'VALIDATION_ERROR');
    return true;
  });
  assert.deepEqual(malformed.pairingRepository.events, []);
});

test('S4: two redemptions of the same legacy code create one senior and one token', async () => {
  const { useCase, userRepository, tokens } = build({ record: codeRecord({ seniorId: null }) });

  const results = await Promise.allSettled([
    useCase.execute({ code: CODE, fullName: 'Rosa Pérez' }),
    useCase.execute({ code: CODE, fullName: 'Rosa Pérez' })
  ]);

  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.statusCode, 409);
  assert.equal(rejected[0].reason.message, 'pairing code already used');

  assert.equal(userRepository.created.length, 1);
  assert.equal(tokens.length, 1);
});

test('S4: two redemptions of a code with seniorId link the profile once', async () => {
  const { useCase, userRepository, tokens } = build();

  const results = await Promise.allSettled([useCase.execute({ code: CODE }), useCase.execute({ code: CODE })]);

  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.statusCode, 409);
  assert.equal(rejected[0].reason.message, 'pairing code already used');

  assert.deepEqual(userRepository.marked, [PENDING]);
  assert.equal(tokens.length, 1);
});
