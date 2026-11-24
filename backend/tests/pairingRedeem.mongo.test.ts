/**
 * HU-009 / T2 — pines de persistencia del canje contra MongoDB REAL.
 *
 * Cubre: `findByTokenHash` + `claimUnused` (escritura condicional de un solo
 * uso, S8/S16), el escritor del vínculo con la evidencia de D4 en la misma
 * escritura (D7), el bloqueo por perfil con la forma del login (D8) y el lector
 * del canje con los campos de la respuesta S13 (D11/D6).
 *
 * Misma disciplina del resto de los pines: sin `MONGO_URL` se saltea, se niega
 * a correr contra una base que no empiece con `chk-`, y usa una base propia del
 * archivo porque `node --test` corre los archivos en paralelo.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect, disconnect, Types, type Mongoose } from 'mongoose';

import { createMongoosePairingTokenRepository } from '../src/modules/pairing/infrastructure/MongoosePairingTokenRepository.ts';
import { createMongoosePairingSeniorReader } from '../src/modules/pairing/infrastructure/MongoosePairingSeniorReader.ts';
import { createMongooseRedeemSeniorWriter } from '../src/modules/pairing/infrastructure/MongoosePairingSeniorWriter.ts';
import { createMongooseSeniorRepository } from '../src/modules/seniors/index.ts';
import { PairingTokenModel } from '../src/shared/models/PairingToken.ts';
import { UserModel } from '../src/shared/models/User.ts';
import { SeniorLinkModel } from '../src/shared/models/SeniorLink.ts';

const MONGO_URL = process.env.MONGO_URL ?? '';
const NOW = new Date('2026-01-01T00:00:00.000Z');
const SENIOR_ID = '507f1f77bcf86cd799439011';
const OTHER_SENIOR_ID = '507f1f77bcf86cd799439022';
const CAREGIVER_ID = '507f1f77bcf86cd7994390aa';
const FOREIGN_CAREGIVER_ID = '507f1f77bcf86cd7994390bb';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_UNKNOWN = 'c'.repeat(64);

function extractDbName(url: string): string | null {
  try {
    const parsed = new URL(url);
    const dbName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    return dbName === '' ? null : dbName;
  } catch {
    return null;
  }
}

/** Base propia del archivo: comparte host pero no base con los demás pines. */
function isolatedUrl(url: string, suffix: string): string {
  const parsed = new URL(url);
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  parsed.pathname = `/${dbName}-${suffix}`;
  return parsed.toString();
}

const REDEEM_MONGO_URL = MONGO_URL === '' ? '' : isolatedUrl(MONGO_URL, 'redeem');

function mongoTest(name: string, body: () => Promise<void>): void {
  test(name, async (t) => {
    if (MONGO_URL === '') {
      t.skip('MONGO_URL no está definida: este pin exige Mongo real');
      return;
    }
    const dbName = extractDbName(MONGO_URL);
    if (dbName === null || !dbName.startsWith('chk-')) {
      throw new Error(
        `El arnés se niega a correr contra la base "${dbName ?? 'desconocida'}" de MONGO_URL: ` +
          'sólo bases de prueba cuyo nombre empiece con chk- (mearn_db está fuera de límites)',
      );
    }
    await body();
  });
}

let connecting: Promise<Mongoose> | null = null;

function db(): Promise<Mongoose> {
  if (connecting === null) {
    connecting = (async () => {
      const connection = await connect(REDEEM_MONGO_URL);
      await PairingTokenModel.init();
      await UserModel.init();
      await SeniorLinkModel.init();
      return connection;
    })();
  }
  return connecting;
}

async function clean(): Promise<void> {
  await db();
  await PairingTokenModel.deleteMany({});
  await UserModel.deleteMany({});
  await SeniorLinkModel.deleteMany({});
}

/** Siembra directa por el modelo: el pin no depende del adaptador. */
async function seedToken(input: {
  tokenHash: string;
  seniorId: string;
  usedAt?: Date | null;
  invalidatedAt?: Date | null;
  expiresAt?: Date;
}): Promise<void> {
  await PairingTokenModel.create({
    seniorId: input.seniorId,
    caregiverId: CAREGIVER_ID,
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt ?? new Date(NOW.getTime() + 24 * 60 * 60_000),
    usedAt: input.usedAt ?? null,
    invalidatedAt: input.invalidatedAt ?? null,
  });
}

/**
 * Perfil por el camino real: documento User (los campos de S13 incluidos) y el
 * vínculo activo con el dueño. `legacy: true` escribe el documento SIN
 * `linkStatus`, como la versión anterior a HU-007.
 */
async function seedSenior(input: {
  seniorId: string;
  caregiverId: string;
  legacy?: boolean;
}): Promise<void> {
  await db();
  const profile = {
    _id: new Types.ObjectId(input.seniorId),
    email: `senior+${input.seniorId.slice(-6)}@seniors.local`,
    fullName: 'Rosa Pérez',
    role: 'SENIOR',
    timezone: 'America/Bogota',
    phone: null,
    bloodType: 'O+',
    emergencyContact: { fullName: 'Ana Pérez', phone: '+573001234567' },
  };
  if (input.legacy === true) {
    await UserModel.collection.insertOne({ ...profile, createdAt: NOW, updatedAt: NOW });
  } else {
    await UserModel.create({ ...profile, linkStatus: 'PENDING', emailVerifiedAt: NOW });
  }
  await SeniorLinkModel.create({
    seniorId: input.seniorId,
    caregiverId: input.caregiverId,
    role: 'OWNER',
    status: 'ACTIVE',
    createdAt: NOW,
  });
}

after(async () => {
  if (MONGO_URL === '') return;
  await clean();
  const connection = await db();
  await connection.connection.db?.dropDatabase();
  await disconnect();
});

// ─── T2: el reclamo atómico del token (S8/S16) ──────────────────────────────

mongoTest('S8/S16: claimUnused gana una vez — usedAt fijado, invalidatedAt intacto; el perdedor recibe null', async () => {
  await clean();
  const repo = createMongoosePairingTokenRepository();
  await seedToken({ tokenHash: HASH_A, seniorId: SENIOR_ID });

  const won = await repo.claimUnused(HASH_A, NOW);
  assert.ok(won !== null);
  assert.equal(won.tokenHash, HASH_A);
  assert.equal(won.seniorId, SENIOR_ID);
  assert.equal(won.caregiverId, CAREGIVER_ID);
  assert.ok(won.usedAt !== null);
  assert.equal(won.usedAt.getTime(), NOW.getTime());
  assert.equal(won.invalidatedAt, null, 'la validación no se marca como canje');

  const doc = await PairingTokenModel.findOne({ tokenHash: HASH_A }).lean();
  assert.ok(doc !== null);
  assert.equal((doc['usedAt'] as Date).getTime(), NOW.getTime());
  assert.equal(doc['invalidatedAt'], null);

  // El perdedor de la carrera recibe null: no hay segundo canje.
  const lost = await repo.claimUnused(HASH_A, NOW);
  assert.equal(lost, null);
});

mongoTest('S14: claimUnused rechaza el vencido, el invalidado y el hash desconocido', async () => {
  await clean();
  const repo = createMongoosePairingTokenRepository();
  await seedToken({ tokenHash: HASH_A, seniorId: SENIOR_ID, expiresAt: new Date(NOW.getTime() - 1_000) });
  await seedToken({
    tokenHash: HASH_B,
    seniorId: SENIOR_ID,
    invalidatedAt: new Date(NOW.getTime() - 2_000),
  });

  assert.equal(await repo.claimUnused(HASH_A, NOW), null, 'vencido no se reclama');
  assert.equal(await repo.claimUnused(HASH_B, NOW), null, 'invalidado no se reclama');
  assert.equal(await repo.claimUnused(HASH_UNKNOWN, NOW), null, 'desconocido no coincide');

  const expiredDoc = await PairingTokenModel.findOne({ tokenHash: HASH_A }).lean();
  assert.equal(expiredDoc?.['usedAt'], null, 'ningún intento perdedor escribió nada');
  const invalidDoc = await PairingTokenModel.findOne({ tokenHash: HASH_B }).lean();
  assert.equal(invalidDoc?.['usedAt'], null);
});

mongoTest('T2: findByTokenHash mapea el documento a PairingTokenRecord, por hash y no por otra cosa', async () => {
  await clean();
  const repo = createMongoosePairingTokenRepository();
  await seedToken({ tokenHash: HASH_A, seniorId: SENIOR_ID });

  const found = await repo.findByTokenHash(HASH_A);
  assert.ok(found !== null);
  assert.equal(found.id.length > 0, true);
  assert.deepEqual(Object.keys(found).sort(), [
    'caregiverId', 'createdAt', 'expiresAt', 'id', 'invalidatedAt', 'seniorId', 'tokenHash', 'usedAt',
  ]);
  assert.equal(await repo.findByTokenHash(HASH_UNKNOWN), null);
});

// ─── T2/D7: la transición PENDING → LINKED con la evidencia en la misma
// escritura condicional ──────────────────────────────────────────────────────

mongoTest('D4/D7: markLinkedWithConsent escribe LINKED + evidencia desde PENDING, y sólo una vez', async () => {
  await clean();
  const writer = createMongooseRedeemSeniorWriter();
  await seedSenior({ seniorId: SENIOR_ID, caregiverId: CAREGIVER_ID });
  const acceptedTermsAt = new Date(NOW.getTime() + 30_000);

  const linked = await writer.markLinkedWithConsent({
    seniorId: SENIOR_ID,
    acceptedTermsAt,
    termsVersion: '1.0-test',
    ipAddress: '203.0.113.9',
  });
  assert.equal(linked, true);

  const doc = await UserModel.findById(SENIOR_ID).lean();
  assert.ok(doc !== null);
  assert.equal(doc['linkStatus'], 'LINKED');
  assert.equal((doc['acceptedTermsAt'] as Date).getTime(), acceptedTermsAt.getTime());
  assert.equal(doc['termsVersion'], '1.0-test');
  assert.equal(doc['ipAddress'], '203.0.113.9');

  // La condición `PENDING` cierra el doble vínculo: el perdedor recibe false.
  const second = await writer.markLinkedWithConsent({
    seniorId: SENIOR_ID,
    acceptedTermsAt: new Date(NOW.getTime() + 99_000),
    termsVersion: '2.0',
    ipAddress: '198.51.100.1',
  });
  assert.equal(second, false);
  const untouched = await UserModel.findById(SENIOR_ID).lean();
  assert.ok(untouched !== null);
  assert.equal((untouched['acceptedTermsAt'] as Date).getTime(), acceptedTermsAt.getTime());
});

mongoTest('D5: sin IP válida la evidencia guarda ipAddress en null y LINKED se escribe igual', async () => {
  await clean();
  const writer = createMongooseRedeemSeniorWriter();
  await seedSenior({ seniorId: SENIOR_ID, caregiverId: CAREGIVER_ID });

  const linked = await writer.markLinkedWithConsent({
    seniorId: SENIOR_ID,
    acceptedTermsAt: NOW,
    termsVersion: '1.0-test',
  });
  assert.equal(linked, true);
  const doc = await UserModel.findById(SENIOR_ID).lean();
  assert.ok(doc !== null);
  assert.equal(doc['ipAddress'], null);
});

mongoTest('S17/D7: un documento legacy sin linkStatus (ya tenía dispositivo) no se re-vincula', async () => {
  await clean();
  const writer = createMongooseRedeemSeniorWriter();
  await seedSenior({ seniorId: SENIOR_ID, caregiverId: CAREGIVER_ID, legacy: true });

  const linked = await writer.markLinkedWithConsent({
    seniorId: SENIOR_ID,
    acceptedTermsAt: NOW,
    termsVersion: '1.0-test',
  });
  assert.equal(linked, false, 'el filtro condicional no matchea el documento sin el campo');
  const doc = await UserModel.findById(SENIOR_ID).lean();
  assert.ok(doc !== null);
  assert.equal(doc['linkStatus'], undefined);
});

// ─── T2/D8: bloqueo por perfil con la forma del login ───────────────────────

mongoTest('D8: registerRedeemFailure cuenta una escritura atómica y fija redeemLockedUntil al llegar al umbral', async () => {
  await clean();
  const writer = createMongooseRedeemSeniorWriter();
  const senior = await UserModel.create({
    email: 'bloqueo@seniors.local',
    fullName: 'Rosa Pérez',
    role: 'SENIOR',
  });
  const seniorId = senior._id.toString();
  const config = { maxAttempts: 5, lockMs: 15 * 60_000, now: NOW };
  const lockedUntilExpected = new Date(NOW.getTime() + 15 * 60_000);

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const last = await writer.registerRedeemFailure(seniorId, config);
    assert.ok(last !== null);
    if (attempt < 5) {
      assert.equal(last.failedLoginAttempts, attempt);
      assert.equal(last.lockedUntil, null);
    } else {
      // El quinto dispara el bloqueo; los siguientes siguen contando por
      // encima del umbral y conservan (re-fijan) el mismo lockedUntil, tal
      // como el pipeline del login de HU-003.
      assert.equal(last.failedLoginAttempts, attempt);
      assert.ok(last.lockedUntil !== null);
      assert.equal(last.lockedUntil.getTime(), lockedUntilExpected.getTime());
    }
  }
  const doc = await UserModel.findById(seniorId).lean();
  assert.ok(doc !== null);
  assert.equal(doc['redeemFailedAttempts'], 10);
  assert.equal((doc['redeemLockedUntil'] as Date).getTime(), lockedUntilExpected.getTime());
});

mongoTest('D8: un bloqueo ya vencido reinicia la racha y redeemLockoutState la lee', async () => {
  await clean();
  const writer = createMongooseRedeemSeniorWriter();
  const senior = await UserModel.create({
    email: 'racha@seniors.local',
    fullName: 'Rosa Pérez',
    role: 'SENIOR',
  });
  const seniorId = senior._id.toString();
  const config = { maxAttempts: 5, lockMs: 15 * 60_000, now: NOW };

  assert.deepEqual(await writer.redeemLockoutState(seniorId), {
    failedLoginAttempts: null,
    lockedUntil: null,
  });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await writer.registerRedeemFailure(seniorId, config);
  }
  const locked = await writer.redeemLockoutState(seniorId);
  assert.ok(locked !== null);
  assert.equal(locked.failedLoginAttempts, 5);
  assert.ok(locked.lockedUntil !== null);

  // El reloj avanza más allá del bloqueo: el siguiente fallo reinicia la
  // racha (fallos consecutivos) y deja el bloqueo en null.
  const after = await writer.registerRedeemFailure(seniorId, {
    maxAttempts: 5,
    lockMs: 15 * 60_000,
    now: new Date(NOW.getTime() + 16 * 60_000),
  });
  assert.ok(after !== null);
  assert.equal(after.failedLoginAttempts, 1);
  assert.equal(after.lockedUntil, null);
});

mongoTest('D8/S7: clearRedeemFailures deja la racha en 0 y lockedUntil en null; senior inexistente no revienta', async () => {
  await clean();
  const writer = createMongooseRedeemSeniorWriter();
  const senior = await UserModel.create({
    email: 'limpia@seniors.local',
    fullName: 'Rosa Pérez',
    role: 'SENIOR',
  });
  const seniorId = senior._id.toString();
  const config = { maxAttempts: 5, lockMs: 15 * 60_000, now: NOW };
  await writer.registerRedeemFailure(seniorId, config);
  await writer.registerRedeemFailure(seniorId, config);

  await writer.clearRedeemFailures(seniorId);
  const state = await writer.redeemLockoutState(seniorId);
  assert.ok(state !== null);
  assert.equal(state.failedLoginAttempts, 0);
  assert.equal(state.lockedUntil, null);

  // Sin el documento que limpiar, la escritura matchea cero y no revienta
  // (id válido pero inexistente).
  await writer.clearRedeemFailures('507f1f77bcf86cd799439099');
});

// ─── T2/D11: el lector del canje trae los campos de la respuesta S13 ───────

mongoTest('D11/S13: findRedeemSeniorForCaregiver resuelve el perfil del dueño con email, phone, verificación y zona', async () => {
  await clean();
  const seniorRepository = createMongooseSeniorRepository();
  const reader = createMongoosePairingSeniorReader(seniorRepository);
  await seedSenior({ seniorId: SENIOR_ID, caregiverId: CAREGIVER_ID });

  const profile = await reader.findRedeemSeniorForCaregiver(SENIOR_ID, CAREGIVER_ID);
  assert.ok(profile !== null);
  assert.deepEqual(Object.keys(profile).sort(), [
    'createdAt', 'email', 'emailVerifiedAt', 'fullName', 'id', 'linkStatus', 'phone', 'sessionVersion', 'timezone',
  ]);
  assert.equal(profile.email, `senior+${SENIOR_ID.slice(-6)}@seniors.local`);
  assert.equal(profile.fullName, 'Rosa Pérez');
  assert.equal(profile.linkStatus, 'PENDING');
  assert.equal(profile.emailVerifiedAt !== null, true);
  assert.equal(profile.phone, null);
  assert.equal(profile.timezone, 'America/Bogota');
  assert.equal(profile.sessionVersion, null);
});

mongoTest('S17/D6: el lector del canje responde null para el ajeno, el CAREGIVER y el legacy sin linkStatus', async () => {
  await clean();
  const seniorRepository = createMongooseSeniorRepository();
  const reader = createMongoosePairingSeniorReader(seniorRepository);
  await seedSenior({ seniorId: SENIOR_ID, caregiverId: CAREGIVER_ID });

  assert.equal(await reader.findRedeemSeniorForCaregiver(SENIOR_ID, FOREIGN_CAREGIVER_ID), null);
  assert.equal(await reader.findRedeemSeniorForCaregiver(OTHER_SENIOR_ID, CAREGIVER_ID), null);

  // Un perfil anterior a HU-007 (sin el campo) se lee como linkStatus null:
  // el caso de uso responde SENIOR_ALREADY_LINKED, no lo re-vincula.
  await seedSenior({ seniorId: OTHER_SENIOR_ID, caregiverId: CAREGIVER_ID, legacy: true });
  const legacy = await reader.findRedeemSeniorForCaregiver(OTHER_SENIOR_ID, CAREGIVER_ID);
  assert.ok(legacy !== null);
  assert.equal(legacy.linkStatus, null);
});
