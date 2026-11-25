import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ConfirmEmail, INVALID_TOKEN_MESSAGE } from '../src/modules/auth/application/ConfirmEmail.ts';
import { AppError } from '../src/shared/errors/AppError.ts';
import type { StoredUser, Clock } from '../src/modules/auth/application/RegisterCaregiver.ts';
import type {
  VerificationStorePort,
  VerificationTokenTarget,
} from '../src/modules/auth/application/RequestEmailVerification.ts';
import {
  mapVerificationTokenTarget,
  VERIFICATION_TOKEN_FIELDS,
} from '../src/modules/auth/infrastructure/MongooseUserRepository.ts';
import { smtpTransportOptions } from '../src/modules/auth/infrastructure/EmailSender.ts';
import { FIXED_NOW, InMemoryUserRepository } from './support/registerHarness.ts';
import type { UserEntity } from '../src/modules/auth/domain/User.ts';

/**
 * Hardening del adaptador real (C1/C2/C5), hallado por la verificación
 * independiente de HU-002: el doble en memoria no veía la proyección de Mongo
 * ni la carrera del canje. Acá se fija la proyección completa, la concurrencia
 * del canje y los timeouts del transporte SMTP.
 */

const HARSH_TOKEN_HASH = 'a'.repeat(64);

/** Doble que simula la carrera del canje: el find siempre responde, el mark sólo gana una vez. */
class OneClaimTokenStore implements VerificationStorePort {
  claims = 0;

  async saveVerificationToken(): Promise<void> {}

  async findEmailVerificationState(): Promise<{
    fullName: string;
    emailVerifiedAt: Date | null;
  } | null> {
    return null;
  }

  async findByVerificationTokenHash(): Promise<VerificationTokenTarget | null> {
    return {
      id: '695a1f000000000000000001',
      email: 'cuidador@example.com',
      fullName: 'Esteban Trujillo',
      tokenHash: HARSH_TOKEN_HASH,
      expiresAt: new Date(FIXED_NOW.getTime() + 3_600_000),
      emailVerifiedAt: null,
    };
  }

  async markEmailVerified(
    _email: string,
    _tokenHash: string,
    _verifiedAt: Date,
  ): Promise<StoredUser | null> {
    this.claims += 1;
    if (this.claims > 1) return null;
    return {
      id: '695a1f000000000000000001',
      email: 'cuidador@example.com',
      fullName: 'Esteban Trujillo',
      role: 'CAREGIVER',
    };
  }
}

test('C1: la proyección VERIFICATION_TOKEN_FIELDS trae todos los campos que el puerto devuelve', () => {
  // Documento con todos los campos del modelo: lo que `.select()` no pide no llega.
  const doc = {
    _id: { toString: () => '695a1f000000000000000001' },
    email: 'cuidador@example.com',
    fullName: 'Esteban Trujillo',
    role: 'CAREGIVER',
    passwordHash: '$2a$10$hashsimulado',
    verificationTokenHash: HARSH_TOKEN_HASH,
    verificationTokenExpiresAt: FIXED_NOW,
    emailVerifiedAt: null,
  };
  // Igual que `.select(VERIFICATION_TOKEN_FIELDS).lean()`: descarta lo que la proyección no pide.
  const projected = Object.fromEntries(
    Object.entries(doc).filter(([field]) =>
      (VERIFICATION_TOKEN_FIELDS as readonly string[]).includes(field),
    ),
  ) as unknown as Parameters<typeof mapVerificationTokenTarget>[0];

  const target = mapVerificationTokenTarget(projected);

  // El defecto original: sin `email` en la proyección, `target.email` llegaba
  // `undefined` y la cadena real terminaba en `markEmailVerified(undefined,…)`,
  // que marcaba la primera cuenta de la colección.
  assert.deepEqual(target, {
    id: '695a1f000000000000000001',
    email: 'cuidador@example.com',
    fullName: 'Esteban Trujillo',
    tokenHash: HARSH_TOKEN_HASH,
    expiresAt: FIXED_NOW,
    emailVerifiedAt: null,
  });
});

test('C2: el doble en memoria honra el contrato atómico: el segundo markEmailVerified con el mismo hash devuelve null', async () => {
  const repo = new InMemoryUserRepository();
  const entity: UserEntity = {
    email: 'cuidador@example.com',
    passwordHash: 'hash',
    fullName: 'Esteban Trujillo',
    role: 'CAREGIVER',
    consent: { acceptedTermsAt: FIXED_NOW, termsVersion: '9.9-test' },
  };
  const saved = await repo.save(entity);
  await repo.saveVerificationToken('cuidador@example.com', {
    tokenHash: HARSH_TOKEN_HASH,
    expiresAt: new Date(FIXED_NOW.getTime() + 3_600_000),
  });

  const target = await repo.findByVerificationTokenHash(HARSH_TOKEN_HASH);
  assert.ok(target, 'el token vigente se encuentra por hash');

  // Un hash que no matchea el vigente no marca nada (antes de ningún canje).
  const wrongHash = await repo.markEmailVerified('cuidador@example.com', 'c'.repeat(64), FIXED_NOW);
  assert.equal(wrongHash, null, 'un hash distinto al vigente no marca la cuenta');
  assert.equal(repo.verifiedAt.has('cuidador@example.com'), false, 'el canje fallido no verificó nada');

  // El primer canje gana; el segundo, con el mismo email + hash, pierde.
  const first = await repo.markEmailVerified('cuidador@example.com', target.tokenHash, FIXED_NOW);
  assert.ok(first, 'el primer canje devuelve el usuario');
  assert.equal(first.email, 'cuidador@example.com');
  assert.equal(first.id, saved.id);

  const second = await repo.markEmailVerified('cuidador@example.com', target.tokenHash, FIXED_NOW);
  assert.equal(second, null, 'el segundo uso del mismo token no puede volver a marcar');
});

test('C2: ConfirmEmail traduce el null del canje perdido en el mismo 400 INVALID_TOKEN (D2)', async () => {
  const store = new OneClaimTokenStore();
  const clock: Clock = { now: () => FIXED_NOW };
  const confirm = new ConfirmEmail({ store, clock });

  const winner = await confirm.execute('token crudo sin importar: el store lo responde');
  assert.equal(winner.email, 'cuidador@example.com');

  await assert.rejects(
    () => confirm.execute('token crudo sin importar: el store lo responde'),
    (error: unknown) => {
      assert.ok(error instanceof AppError, 'rechaza con AppError');
      assert.equal((error as AppError).statusCode, 400);
      assert.equal((error as AppError).code, 'INVALID_TOKEN');
      assert.equal((error as AppError).message, INVALID_TOKEN_MESSAGE);
      return true;
    },
  );
});

test('C5: el transporte SMTP fija timeouts explícitos; el test observa las opciones sin abrir conexión', () => {
  const conAuth = smtpTransportOptions({
    host: 'smtp.example.com',
    port: 465,
    secure: true,
    user: 'app@example.com',
    pass: 'secreto',
    from: 'Plataforma <no-reply@example.com>',
  });
  assert.deepEqual(conAuth, {
    host: 'smtp.example.com',
    port: 465,
    secure: true,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: { user: 'app@example.com', pass: 'secreto' },
  });

  // Sin usuario configurado no hay auth, pero los timeouts quedan igual.
  const sinAuth = smtpTransportOptions({
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    user: null,
    pass: null,
    from: 'Plataforma <no-reply@example.com>',
  });
  assert.equal('auth' in sinAuth, false);
  assert.deepEqual(sinAuth, {
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
});
