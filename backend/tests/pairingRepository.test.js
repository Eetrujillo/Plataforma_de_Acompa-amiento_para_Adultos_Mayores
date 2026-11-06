'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { PrismaPairingRepository } = require('../src/modules/pairing/infrastructure/PrismaPairingRepository');
const { hashPairingToken } = require('../src/modules/pairing/domain/pairingToken');

/**
 * S2/S4: la atomicidad del canje y la invalidación viven en el filtro de la escritura, no en el
 * código que la llama. Estos tests fijan la forma exacta de cada `where`: si alguien quita
 * `usedAt: null` del reclamo, el "un solo uso" vuelve a ser un leer-y-después-marcar.
 *
 * T7/L9: la colección es `PairingToken` y la única columna que identifica la credencial es
 * `tokenHash`. Un valor en claro no puede ni siquiera pasar por acá.
 */

const RAW_TOKEN = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v';

function build({ count = 1 } = {}) {
  const calls = [];
  const prisma = {
    calls,
    pairingToken: {
      async findUnique(args) {
        calls.push(['findUnique', args]);
        return null;
      },
      async create(args) {
        calls.push(['create', args]);
        return { id: 'pt-1', ...args.data };
      },
      async updateMany(args) {
        calls.push(['updateMany', args]);
        return { count };
      }
    }
  };

  return { calls, repository: new PrismaPairingRepository({ prisma }) };
}

const NOT_USED = { OR: [{ usedAt: null }, { usedAt: { isSet: false } }] };
const NOT_INVALIDATED = { OR: [{ invalidatedAt: null }, { invalidatedAt: { isSet: false } }] };

test('S4: el reclamo gana sólo si el token sigue sin usar, sin invalidar y vigente', async () => {
  const { calls, repository } = build();

  const result = await repository.claim({ id: 'pt-1' });
  const [, args] = calls[0];

  assert.deepEqual(result, { claimed: true });
  assert.equal(calls[0][0], 'updateMany');
  assert.equal(args.where.id, 'pt-1');
  assert.deepEqual(args.where.AND[0], NOT_USED);
  assert.deepEqual(args.where.AND[1], NOT_INVALIDATED);
  assert.equal(args.where.AND[2].expiresAt.gt instanceof Date, true);
  assert.equal(args.data.usedAt instanceof Date, true);
});

test('S4: un reclamo que no matchea nada informa la derrota en vez de lanzar', async () => {
  const { repository } = build({ count: 0 });

  assert.deepEqual(await repository.claim({ id: 'pt-1' }), { claimed: false });
});

test('S2: la invalidación se limita al perfil y salta los tokens ya usados', async () => {
  const { calls, repository } = build();

  await repository.invalidateOutstanding({
    caregiverId: '507f1f77bcf86cd7994390aa',
    seniorId: '507f1f77bcf86cd7994390bb'
  });

  const [, args] = calls[0];

  assert.equal(calls[0][0], 'updateMany');
  assert.equal(args.where.caregiverId, '507f1f77bcf86cd7994390aa');
  assert.equal(args.where.seniorId, '507f1f77bcf86cd7994390bb');
  assert.deepEqual(args.where.AND[0], NOT_USED);
  assert.deepEqual(args.where.AND[1], NOT_INVALIDATED);
  assert.equal(args.data.invalidatedAt instanceof Date, true);
});

test('S1: un token nuevo se guarda como hash, con su perfil y con los nulos explícitos', async () => {
  const { calls, repository } = build();

  await repository.create({
    tokenHash: hashPairingToken(RAW_TOKEN),
    caregiverId: '507f1f77bcf86cd7994390aa',
    seniorId: '507f1f77bcf86cd7994390bb',
    expiresAt: new Date('2024-05-02T10:00:00.000Z')
  });

  const [name, args] = calls[0];

  assert.equal(name, 'create');
  assert.equal(args.data.tokenHash, hashPairingToken(RAW_TOKEN));
  assert.match(args.data.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(args.data.seniorId, '507f1f77bcf86cd7994390bb');
  // Escribir los nulos es lo que hace que el filtro `usedAt: null` matchee en Mongo.
  assert.equal(Object.hasOwn(args.data, 'usedAt'), true);
  assert.equal(Object.hasOwn(args.data, 'invalidatedAt'), true);
  assert.equal(args.data.usedAt, null);
  assert.equal(args.data.invalidatedAt, null);

  // Ni el token en claro ni una columna de código: la credencial sólo viaja en el QR.
  assert.deepEqual(Object.keys(args.data).sort(), [
    'caregiverId',
    'expiresAt',
    'invalidatedAt',
    'seniorId',
    'tokenHash',
    'usedAt'
  ]);
  assert.equal(Object.values(args.data).includes(RAW_TOKEN), false);
});

test('S1: el canje busca por hash, y ya no existe una búsqueda por código', async () => {
  const { calls, repository } = build();

  await repository.findByTokenHash(hashPairingToken(RAW_TOKEN));

  const [name, args] = calls[0];

  assert.equal(name, 'findUnique');
  assert.deepEqual(args, { where: { tokenHash: hashPairingToken(RAW_TOKEN) } });
  assert.equal(args.where.tokenHash === RAW_TOKEN, false);

  // Superficie retirada: nada del modelo anterior puede volver a colarse.
  for (const removed of ['findByCode', 'existsByCode', 'setSenior']) {
    assert.equal(typeof repository[removed], 'undefined', removed);
  }
});
