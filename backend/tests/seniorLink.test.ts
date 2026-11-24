/**
 * HU-005 — reglas puras del vínculo adulto mayor ↔ familiar.
 * S1-S3 del documento odd/tasks/hu-005-seniors-vinculos.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  canCaregiverAccessSenior,
  createFamilyLink,
  createOwnerLink,
  isObjectIdHex,
  linkedCaregiverIds,
} from '../src/modules/seniors/domain/seniorLink.ts';
import type { SeniorLinkRecord } from '../src/modules/seniors/domain/seniorLink.ts';

const SENIOR_ID = '507f1f77bcf86cd799439011';
const OWNER_ID = '507f1f77bcf86cd799439012';
const FAMILY_ID = '507f1f77bcf86cd799439013';
const CREATED_AT = new Date('2026-11-05T20:41:00.000Z');

function link(overrides: Partial<SeniorLinkRecord> = {}): SeniorLinkRecord {
  return {
    seniorId: SENIOR_ID,
    caregiverId: OWNER_ID,
    role: 'OWNER',
    status: 'ACTIVE',
    invitedBy: null,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

// S1 — el alta deja el primero de N vínculos.
test('createOwnerLink marca el vínculo del alta como OWNER activo', () => {
  const owner = createOwnerLink({ seniorId: SENIOR_ID, caregiverId: OWNER_ID, createdAt: CREATED_AT });

  assert.equal(owner.seniorId, SENIOR_ID);
  assert.equal(owner.caregiverId, OWNER_ID);
  assert.equal(owner.role, 'OWNER');
  assert.equal(owner.status, 'ACTIVE');
  assert.equal(owner.invitedBy, null);
});

// S1, S3 — el segundo familiar entra como FAMILY sin tocar el primero.
test('createFamilyLink agrega otro familiar sin modificar los vínculos existentes', () => {
  const owner = createOwnerLink({ seniorId: SENIOR_ID, caregiverId: OWNER_ID, createdAt: CREATED_AT });
  const family = createFamilyLink({
    seniorId: SENIOR_ID,
    caregiverId: FAMILY_ID,
    invitedBy: OWNER_ID,
    createdAt: CREATED_AT,
  });

  assert.equal(family.role, 'FAMILY');
  assert.equal(family.status, 'ACTIVE');
  assert.equal(family.invitedBy, OWNER_ID);
  // El vínculo anterior queda intacto: el rol informativo no cambia permisos (S2).
  assert.deepEqual(owner, link());
  assert.deepEqual(linkedCaregiverIds([owner, family]), [OWNER_ID, FAMILY_ID]);
});

// S1, S2 — N familiares, permisos equivalentes.
test('canCaregiverAccessSenior da el mismo permiso a OWNER y a FAMILY', () => {
  const links = [
    link(),
    link({ caregiverId: FAMILY_ID, role: 'FAMILY', invitedBy: OWNER_ID }),
  ];

  assert.equal(canCaregiverAccessSenior(links, OWNER_ID), true);
  assert.equal(canCaregiverAccessSenior(links, FAMILY_ID), true);
  assert.equal(canCaregiverAccessSenior(links, '507f1f77bcf86cd7994390ff'), false);
  assert.equal(canCaregiverAccessSenior([], OWNER_ID), false);
});

test('un vínculo que no está activo no autoriza (falla cerrado)', () => {
  const revoked = link({ status: 'REVOKED' as never });

  assert.equal(canCaregiverAccessSenior([revoked], OWNER_ID), false);
});

test('linkedCaregiverIds no repite familiares', () => {
  assert.deepEqual(
    linkedCaregiverIds([link(), link({ caregiverId: OWNER_ID })]),
    [OWNER_ID],
  );
});

// S19 — el id se valida en forma antes de ir a la base.
test('isObjectIdHex exige 24 caracteres hexadecimales', () => {
  assert.equal(isObjectIdHex(SENIOR_ID), true);
  assert.equal(isObjectIdHex('507f1f77bcf86cd79943901'), false);
  assert.equal(isObjectIdHex('507f1f77bcf86cd7994390111'), false);
  assert.equal(isObjectIdHex('zzzzzzzzzzzzzzzzzzzzzzzz'), false);
  assert.equal(isObjectIdHex(''), false);
  assert.equal(isObjectIdHex('../../etc/passwd'), false);
});
