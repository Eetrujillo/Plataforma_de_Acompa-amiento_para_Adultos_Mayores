'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { RedeemPairingToken } = require('../src/modules/pairing/application/RedeemPairingToken');
const {
  PAIRING_TOKEN_INVALID_MESSAGE,
  generatePairingToken,
  hashPairingToken
} = require('../src/modules/pairing/domain/pairingToken');

/**
 * HU-006 T7 (S2, S4): canje de un token que sólo viaja en el QR.
 *
 * El repositorio de mentira modela la escritura atómica del adaptador: `claim` sólo gana cuando
 * el registro sigue sin usar, sin reemplazar y vigente. El canje ya no crea perfiles (L9): todo
 * token apunta a un senior que el familiar creó desde el panel.
 */

const CG = '507f1f77bcf86cd7994390aa';
const OTHER_CG = '507f1f77bcf86cd7994390cc';
const PENDING = '507f1f77bcf86cd7994390bb';
const LINKED = '507f1f77bcf86cd7994390dd';

/** 43 caracteres base64url: el formato exacto que produce el generador. */
const TOKEN = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v';

const CREATED_AT = new Date('2024-05-01T10:00:00.000Z');

function tokenRecord(overrides = {}) {
  return {
    id: 'pairing-1',
    tokenHash: hashPairingToken(TOKEN),
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
    async findByTokenHash(tokenHash) {
      events.push(['findByTokenHash', tokenHash]);
      return tokenHash === state.tokenHash ? { ...state } : null;
    },
    async claim({ id }) {
      events.push(['claim', id]);

      if (id !== state.id || state.usedAt || state.invalidatedAt || state.expiresAt.getTime() <= Date.now()) {
        return { claimed: false };
      }

      state.usedAt = new Date();
      return { claimed: true };
    }
  };
}

function createUserStore(seed = []) {
  const users = new Map(seed.map((user) => [user.id, { ...user }]));
  const created = [];
  const marked = [];

  return {
    users,
    created,
    marked,
    async findById(id) {
      const user = users.get(id);
      return user ? { ...user } : null;
    },
    // L9: el canje ya no crea seniors. Si alguien vuelve a llamar esto, el test lo ve.
    async create(data) {
      created.push(data);
      return { id: `senior-${created.length}`, createdAt: CREATED_AT, ...data };
    },
    async markLinked(id) {
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

function build({ record = tokenRecord(), users = [PENDING_PROFILE] } = {}) {
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
    useCase: new RedeemPairingToken({ pairingRepository, userRepository, tokenService })
  };
}

/** `assert.rejects` resuelve con `undefined`: el error se captura en el predicado. */
async function rejectsWith(promise, statusCode) {
  let captured;

  await assert.rejects(promise, (error) => {
    captured = error;
    assert.equal(error.statusCode, statusCode);
    return true;
  });

  return captured;
}

test('S2: un token vigente marca el perfil como LINKED sin crear ningún senior', async () => {
  const { useCase, userRepository, pairingRepository, tokens } = build();

  const result = await useCase.execute({ token: TOKEN, fullName: 'Intruso', phone: '+573009998877' });

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

  // No nace un perfil nuevo y el cuerpo del canje no edita la ficha del familiar.
  assert.deepEqual(userRepository.created, []);
  assert.equal(userRepository.users.get(PENDING).fullName, 'Rosa Pérez');
  assert.equal(userRepository.users.get(PENDING).phone, '+573001112233');
  assert.equal(userRepository.users.get(PENDING).linkStatus, 'LINKED');
  assert.deepEqual(userRepository.marked, [PENDING]);

  assert.equal(pairingRepository.state.usedAt instanceof Date, true);
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].sub, PENDING);
  // El token del QR no vuelve en la respuesta, ni siquiera como campo extra.
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
});

test('S2: el canje busca por hash, nunca por el token en claro', async () => {
  const { useCase, pairingRepository } = build();

  await useCase.execute({ token: TOKEN });

  assert.deepEqual(pairingRepository.events.map(([name]) => name), ['findByTokenHash', 'claim']);
  assert.equal(pairingRepository.events[0][1], hashPairingToken(TOKEN));
  assert.notEqual(pairingRepository.events[0][1], TOKEN);
});

test('S4: el reclamo ocurre antes de escribir el perfil', async () => {
  const { useCase, pairingRepository, userRepository } = build();

  await useCase.execute({ token: TOKEN });

  assert.deepEqual(pairingRepository.events.map(([name]) => name), ['findByTokenHash', 'claim']);
  assert.deepEqual(userRepository.marked, [PENDING]);
});

test('S2: un token invalidado y uno vencido responden exactamente lo mismo', async () => {
  const invalidated = build({ record: tokenRecord({ invalidatedAt: new Date() }) });
  const expired = build({ record: tokenRecord({ expiresAt: new Date(Date.now() - 1000) }) });

  const answers = [];

  for (const scenario of [invalidated, expired]) {
    const error = await rejectsWith(scenario.useCase.execute({ token: TOKEN }), 400);

    answers.push({ code: error.code, message: error.message });
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal(error.message, PAIRING_TOKEN_INVALID_MESSAGE);
    // El token no aparece en el error: ese cuerpo llega al cliente y al log.
    assert.equal(error.message.includes(TOKEN), false);

    assert.equal(scenario.pairingRepository.state.usedAt, null);
    assert.deepEqual(scenario.userRepository.created, []);
    assert.deepEqual(scenario.userRepository.marked, []);
  }

  assert.deepEqual(answers[0], answers[1]);
});

test('S2: un token desconocido es 404 y uno usado es 409', async () => {
  const unknown = build();

  const notFound = await rejectsWith(unknown.useCase.execute({ token: 'B'.repeat(43) }), 404);
  assert.equal(notFound.code, 'NOT_FOUND');
  assert.equal(notFound.message.includes('B'.repeat(43)), false);
  assert.deepEqual(unknown.userRepository.marked, []);

  const used = build({ record: tokenRecord({ usedAt: new Date() }) });

  const conflict = await rejectsWith(used.useCase.execute({ token: TOKEN }), 409);
  assert.equal(conflict.code, 'CONFLICT');
  assert.equal(conflict.message, 'pairing token already used');
  assert.equal(conflict.message.includes(TOKEN), false);
  assert.deepEqual(used.userRepository.created, []);
  assert.deepEqual(used.userRepository.marked, []);
});

test('S2: un token con formato inválido es 400 sin tocar la base', async () => {
  const { useCase, pairingRepository, userRepository } = build();

  for (const token of [undefined, null, '', '482913', 'a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}=`, 12345]) {
    const error = await rejectsWith(useCase.execute({ token }), 400);

    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal(error.message, PAIRING_TOKEN_INVALID_MESSAGE);
  }

  assert.deepEqual(pairingRepository.events, []);
  assert.deepEqual(userRepository.marked, []);
});

test('S5: un perfil que ya está vinculado es 409 y no quema el token', async () => {
  const { useCase, pairingRepository, userRepository } = build({
    users: [{ ...PENDING_PROFILE, id: LINKED, linkStatus: 'LINKED' }],
    record: tokenRecord({ seniorId: LINKED })
  });

  const error = await rejectsWith(useCase.execute({ token: TOKEN }), 409);

  assert.equal(error.code, 'SENIOR_ALREADY_LINKED');
  assert.equal(pairingRepository.state.usedAt, null);
  assert.deepEqual(userRepository.marked, []);
});

test('S4: dos canjes simultáneos del mismo token dejan un solo ganador', async () => {
  const { useCase, userRepository, tokens } = build();

  const results = await Promise.allSettled([
    useCase.execute({ token: TOKEN }),
    useCase.execute({ token: TOKEN })
  ]);

  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.statusCode, 409);
  assert.equal(rejected[0].reason.message, 'pairing token already used');
  assert.deepEqual(userRepository.marked, [PENDING]);
  assert.deepEqual(userRepository.created, []);
  assert.equal(tokens.length, 1);
});

test('L9: un token del modelo anterior no canjea nada, porque su hash no existe', async () => {
  // El código de 6 dígitos se guardaba en claro en `PairingCode`; ahora el canje busca por hash
  // en `PairingToken`. Un valor viejo no matchea y no crea perfiles: la ventana de corte deja
  // esos códigos inservibles, que es lo que L9 asume al desplegar.
  const { useCase, pairingRepository, userRepository } = build();

  for (const legacy of ['482913', '000000']) {
    const error = await rejectsWith(useCase.execute({ token: legacy }), 400);
    assert.equal(error.code, 'VALIDATION_ERROR');
  }

  // Un token bien formado que nadie emitió tampoco: no hay registro con ese hash.
  const unknown = await rejectsWith(useCase.execute({ token: generatePairingToken() }), 404);
  assert.equal(unknown.code, 'NOT_FOUND');

  assert.deepEqual(userRepository.created, []);
  assert.deepEqual(userRepository.marked, []);
  assert.equal(pairingRepository.state.usedAt, null);
});
