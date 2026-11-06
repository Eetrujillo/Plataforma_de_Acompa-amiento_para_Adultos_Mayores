'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { PrismaPairingRepository } = require('../src/modules/pairing/infrastructure/PrismaPairingRepository');

/**
 * HU-006 S2/S4: la atomicidad del canje y la invalidación viven en el filtro de la escritura,
 * no en el código que la llama. Estos tests fijan la forma exacta de cada `where`: si alguien
 * quita `usedAt: null` del reclamo, el "un solo uso" vuelve a ser un leer-y-después-marcar.
 *
 * `isSet: false` no es decorativo: MongoDB no guarda un campo sólo porque el schema lo
 * permita, y los códigos emitidos antes de esta HU no tienen `usedAt` ni `invalidatedAt`.
 */

function build({ count = 1 } = {}) {
  const calls = [];
  const prisma = {
    calls,
    pairingCode: {
      async findUnique(args) {
        calls.push(['findUnique', args]);
        return null;
      },
      async create(args) {
        calls.push(['create', args]);
        return { id: 'pc-1', ...args.data };
      },
      async updateMany(args) {
        calls.push(['updateMany', args]);
        return { count };
      },
      async update(args) {
        calls.push(['update', args]);
        return { id: args.where.id, ...args.data };
      }
    }
  };

  return { calls, repository: new PrismaPairingRepository({ prisma }) };
}

const NOT_USED = { OR: [{ usedAt: null }, { usedAt: { isSet: false } }] };
const NOT_INVALIDATED = { OR: [{ invalidatedAt: null }, { invalidatedAt: { isSet: false } }] };

test('S4: claim wins only if the code is unused, not invalidated and still valid', async () => {
  const { calls, repository } = build();

  const result = await repository.claim({ id: 'pc-1' });
  const [, args] = calls[0];

  assert.deepEqual(result, { claimed: true });
  assert.equal(calls[0][0], 'updateMany');
  assert.equal(args.where.id, 'pc-1');
  assert.deepEqual(args.where.AND[0], NOT_USED);
  assert.deepEqual(args.where.AND[1], NOT_INVALIDATED);
  assert.equal(args.where.AND[2].expiresAt.gt instanceof Date, true);
  assert.equal(args.data.usedAt instanceof Date, true);
});

test('S4: a claim that matches nothing reports the loss instead of throwing', async () => {
  const { repository } = build({ count: 0 });

  assert.deepEqual(await repository.claim({ id: 'pc-1' }), { claimed: false });
});

test('S2: invalidating the previous codes is scoped to the profile and skips used ones', async () => {
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

test('S2: a new code stores usedAt/invalidatedAt explicitly and carries its profile', async () => {
  const { calls, repository } = build();

  await repository.create({
    code: '482913',
    caregiverId: '507f1f77bcf86cd7994390aa',
    seniorId: '507f1f77bcf86cd7994390bb',
    expiresAt: new Date('2024-05-02T10:00:00.000Z')
  });

  const [name, args] = calls[0];

  assert.equal(name, 'create');
  assert.equal(args.data.code, '482913');
  assert.equal(args.data.seniorId, '507f1f77bcf86cd7994390bb');
  assert.equal(args.data.usedAt, null);
  assert.equal(args.data.invalidatedAt, null);
  // Escribir los nulos es lo que hace que el filtro `usedAt: null` matchee en Mongo.
  assert.equal(Object.hasOwn(args.data, 'usedAt'), true);
  assert.equal(Object.hasOwn(args.data, 'invalidatedAt'), true);
});

test('PRESERVE: setSenior only stamps the profile, never the consumption', async () => {
  const { calls, repository } = build();

  await repository.setSenior({ id: 'pc-1', seniorId: 'senior-1' });

  const [name, args] = calls[0];

  assert.equal(name, 'update');
  assert.deepEqual(args.where, { id: 'pc-1' });
  assert.deepEqual(args.data, { seniorId: 'senior-1' });
});
