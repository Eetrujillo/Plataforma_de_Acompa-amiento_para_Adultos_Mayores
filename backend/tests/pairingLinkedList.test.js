'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ListLinkedSeniors } = require('../src/modules/pairing/application/ListLinkedSeniors');

/**
 * HU-005 introduced a second kind of senior: the profile the caregiver creates from the
 * panel is PENDING until the phone redeems a code. The dashboard picker feeds the activity
 * composer, so a pending profile must not appear there, and a pre-HU-005 document (no
 * `linkStatus` at all) must keep appearing because the pairing flow was the only way in.
 */
function build(seed) {
  return new ListLinkedSeniors({
    userRepository: {
      async listSeniorsByCaregiver(caregiverId) {
        return seed.filter((senior) => senior.caregiverId === caregiverId);
      }
    }
  });
}

const SEED = [
  { id: 's-linked', fullName: 'Rosa Pérez', phone: null, caregiverId: 'cg-1', linkStatus: 'LINKED' },
  { id: 's-legacy', fullName: 'Ana Gómez', phone: '+573001112233', caregiverId: 'cg-1' },
  { id: 's-pending', fullName: 'Nuevo Perfil', phone: null, caregiverId: 'cg-1', linkStatus: 'PENDING' },
  { id: 's-foreign', fullName: 'Otra Familia', phone: null, caregiverId: 'cg-2', linkStatus: 'LINKED' }
];

test('only linked profiles reach the picker, and legacy documents still count as linked', async () => {
  const result = await build(SEED).execute({ caregiverId: 'cg-1' });

  assert.deepEqual(result.seniors, [
    { id: 's-linked', fullName: 'Rosa Pérez', phone: null },
    { id: 's-legacy', fullName: 'Ana Gómez', phone: '+573001112233' }
  ]);
});

test('a pending profile is the only thing filtered out', async () => {
  const result = await build(SEED).execute({ caregiverId: 'cg-2' });

  assert.deepEqual(result.seniors, [{ id: 's-foreign', fullName: 'Otra Familia', phone: null }]);
});

test('a pending state written in another case is still pending', async () => {
  const lowercase = [
    { id: 's-lower', fullName: 'Perfil Importado', phone: null, caregiverId: 'cg-3', linkStatus: 'pending' }
  ];

  const result = await build(lowercase).execute({ caregiverId: 'cg-3' });

  assert.deepEqual(result.seniors, []);
});
