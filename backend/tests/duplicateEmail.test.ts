import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DuplicateEmailError } from '../src/modules/auth/application/RegisterCaregiver.ts';
import { isDuplicateKeyError } from '../src/modules/auth/infrastructure/MongooseUserRepository.ts';
import { VALID_BODY, errorEnvelope, makeHarness, post, withServer } from './support/registerHarness.ts';

const REGISTER = '/api/auth/register';
const DUPLICATE_MESSAGE = 'Este correo ya tiene una cuenta';

test('S3: la carrera contra el índice único responde 400 EMAIL_ALREADY_REGISTERED, nunca 500', async () => {
  // findByEmail devuelve null (nadie estaba registrado todavía) y el save choca
  // contra el índice único: es exactamente la carrera de dos altas simultáneas.
  const harness = makeHarness({ saveError: new DuplicateEmailError() });
  await withServer(harness, async (base) => {
    const result = await post(base, REGISTER, VALID_BODY);
    assert.equal(result.status, 400, `cuerpo: ${result.text}`);
    const envelope = errorEnvelope(result.json);
    assert.equal(envelope.code, 'EMAIL_ALREADY_REGISTERED');
    assert.equal(envelope.message, DUPLICATE_MESSAGE);
    assert.equal(harness.repo.users.size, 0);
  });
});

test('S3: el adaptador reconoce el error de clave duplicada del driver de Mongo', () => {
  assert.equal(isDuplicateKeyError({ code: 11000 }), true);
  assert.equal(isDuplicateKeyError({ code: 11000, keyPattern: { email: 1 } }), true);
  assert.equal(isDuplicateKeyError(Object.assign(new Error('E11000 duplicate key'), { code: 11000 })), true);
  assert.equal(isDuplicateKeyError({ code: 121 }), false);
  assert.equal(isDuplicateKeyError(new Error('boom')), false);
  assert.equal(isDuplicateKeyError(null), false);
  assert.equal(isDuplicateKeyError('11000'), false);
});
