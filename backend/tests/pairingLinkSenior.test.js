'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { LinkSeniorApp } = require('../src/modules/pairing/application/LinkSeniorApp');
const { LINK_STATUS } = require('../src/modules/seniors/domain/seniorProfile');

/**
 * HU-005 S7: the two creation paths share one factory, so the only difference between a
 * profile born in the caregiver panel and one born by redeeming a code is the link state.
 */
function createDependencies({ now = new Date('2024-05-01T12:00:00.000Z') } = {}) {
  const writes = [];
  const marked = [];
  const record = {
    id: 'pairing-1',
    code: '123456',
    caregiverId: 'caregiver-1',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    usedAt: null
  };

  return {
    writes,
    marked,
    pairingRepository: {
      async findByCode(code) {
        return code === record.code ? record : null;
      },
      async markUsed(data) {
        marked.push(data);
      }
    },
    userRepository: {
      async create(data) {
        writes.push(data);
        return { id: 'senior-1', createdAt: now, ...data };
      }
    },
    tokenService: {
      sign() {
        return 'jwt:senior-1';
      }
    }
  };
}

test('a senior linked by code is born LINKED, not pending', async () => {
  const dependencies = createDependencies();
  const useCase = new LinkSeniorApp(dependencies);

  const result = await useCase.execute({ code: '123456', fullName: 'Rosa Pérez' });

  assert.equal(dependencies.writes[0].linkStatus, LINK_STATUS.LINKED);
  assert.equal(dependencies.writes[0].timezone, 'America/Bogota');
  assert.equal(result.senior.id, 'senior-1');
  // The public projection of the pairing answer still carries no secrets.
  assert.equal(Object.hasOwn(result.senior, 'pinHash'), false);
  assert.deepEqual(dependencies.marked, [{ id: 'pairing-1', seniorId: 'senior-1' }]);
});

test('a reused code is still rejected as a conflict', async () => {
  const dependencies = createDependencies();
  dependencies.pairingRepository.findByCode = async () => ({
    id: 'pairing-1',
    code: '123456',
    caregiverId: 'caregiver-1',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: new Date()
  });
  const useCase = new LinkSeniorApp(dependencies);

  await assert.rejects(
    () => useCase.execute({ code: '123456', fullName: 'Rosa Pérez' }),
    /already used/
  );
  assert.equal(dependencies.writes.length, 0);
});
