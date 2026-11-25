import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadEnv } from '../src/config/env.ts';
import { hashVerificationToken } from '../src/modules/auth/domain/EmailVerificationToken.ts';
import { FIXED_NOW, VALID_BODY, makeHarness } from './support/registerHarness.ts';

/**
 * Advisory findings de `review-172231dad156b7f6` que valía cerrar en la misma
 * unidad: configuración que dejaba la HU entera en no-op silencioso y el
 * vencimiento que no entraba en la condición atómica del canje.
 */

test('EMAIL_VERIFICATION_TTL_HOURS sólo acepta enteros positivos; 0 o negativo caen a 24', () => {
  assert.equal(loadEnv({}).emailVerificationTtlHours, 24);
  assert.equal(loadEnv({ EMAIL_VERIFICATION_TTL_HOURS: '' }).emailVerificationTtlHours, 24);
  assert.equal(loadEnv({ EMAIL_VERIFICATION_TTL_HOURS: '48' }).emailVerificationTtlHours, 48);
  for (const invalid of ['0', '-5', 'abc', '1.5', '+24']) {
    assert.equal(
      loadEnv({ EMAIL_VERIFICATION_TTL_HOURS: invalid }).emailVerificationTtlHours,
      24,
      `EMAIL_VERIFICATION_TTL_HOURS=${invalid}`,
    );
  }
});

test('SMTP_SECURE entiende las formas habituales de escribir un booleano', () => {
  for (const truthy of ['true', '1', 'yes', 'on', 'TRUE']) {
    assert.equal(loadEnv({ SMTP_SECURE: truthy }).smtp.secure, true, `SMTP_SECURE=${truthy}`);
  }
  for (const falsy of ['false', '0', 'no', 'off', '']) {
    assert.equal(loadEnv({ SMTP_SECURE: falsy }).smtp.secure, false, `SMTP_SECURE=${falsy}`);
  }
  // Un valor que no se entiende no puede activar TLS por accidente: cae al default.
  assert.equal(loadEnv({ SMTP_SECURE: 'quizas' }).smtp.secure, false);
});

test('el canje atómico no acepta un token que ya venció, aunque el chequeo previo lo viera vigente', async () => {
  const harness = makeHarness();
  const email = VALID_BODY.email;
  await harness.repo.save({
    email,
    passwordHash: 'hash',
    fullName: VALID_BODY.fullName,
    role: 'CAREGIVER',
    consent: { acceptedTermsAt: FIXED_NOW, termsVersion: '9.9-test' },
  });
  const rawToken = 'token-de-prueba';
  const tokenHash = hashVerificationToken(rawToken);

  // Vigente: el canje procede.
  await harness.repo.saveVerificationToken(email, {
    tokenHash,
    expiresAt: new Date(FIXED_NOW.getTime() + 3_600_000),
  });
  const accepted = await harness.repo.markEmailVerified(email, tokenHash, FIXED_NOW);
  assert.ok(accepted, 'un token vigente se canjea');

  // El mismo escenario con el token ya vencido: no marca nada y devuelve null.
  const otherEmail = 'otro@example.com';
  await harness.repo.save({
    email: otherEmail,
    passwordHash: 'hash',
    fullName: 'Otro',
    role: 'CAREGIVER',
    consent: { acceptedTermsAt: FIXED_NOW, termsVersion: '9.9-test' },
  });
  await harness.repo.saveVerificationToken(otherEmail, {
    tokenHash,
    expiresAt: new Date(FIXED_NOW.getTime() - 1),
  });
  const rejected = await harness.repo.markEmailVerified(otherEmail, tokenHash, FIXED_NOW);
  assert.equal(rejected, null, 'un token vencido no se puede canjear');
  assert.equal(harness.repo.verifiedAt.get(otherEmail), undefined);
});
