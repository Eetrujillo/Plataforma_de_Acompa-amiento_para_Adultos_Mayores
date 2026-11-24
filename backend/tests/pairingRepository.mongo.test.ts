/**
 * HU-008 / T2 — pines de persistencia del slice pairing contra MongoDB REAL.
 * Misma disciplina del arnés de HU-005: sin `MONGO_URL` se saltea, se niega a
 * correr contra una base que no empiece con `chk-`, y cada archivo corre en su
 * propia base derivada del nombre.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect, disconnect, type Mongoose } from 'mongoose';

import { createMongoosePairingTokenRepository } from '../src/modules/pairing/infrastructure/MongoosePairingTokenRepository.ts';
import { PairingTokenModel } from '../src/shared/models/PairingToken.ts';

const MONGO_URL = process.env.MONGO_URL ?? '';
const NOW = new Date('2026-01-01T00:00:00.000Z');
const SENIOR_ID = '507f1f77bcf86cd799439011';
const OTHER_SENIOR_ID = '507f1f77bcf86cd799439044';
const CAREGIVER_ID = '507f1f77bcf86cd7994390aa';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);

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
function isolatedUrl(url: string): string {
  const parsed = new URL(url);
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  parsed.pathname = `/${dbName}-pairing`;
  return parsed.toString();
}

const PAIRING_MONGO_URL = MONGO_URL === '' ? '' : isolatedUrl(MONGO_URL);

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
      const connection = await connect(PAIRING_MONGO_URL);
      // El índice único de `tokenHash` es el sujeto de un pin: hay que construirlo.
      await PairingTokenModel.init();
      return connection;
    })();
  }
  return connecting;
}

async function clean(): Promise<void> {
  await db();
  await PairingTokenModel.deleteMany({});
}

/** Siembra directa por el modelo: así el pin no depende del adaptador. */
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

after(async () => {
  if (MONGO_URL === '') return;
  await clean();
  const connection = await db();
  await connection.connection.db?.dropDatabase();
  await disconnect();
});

// S5/S16/D6 — en la base sólo vive el hash, único.
mongoTest('create guarda sólo el hash y el índice único de tokenHash rechaza duplicados', async () => {
  await clean();
  const repo = createMongoosePairingTokenRepository();
  const expiresAt = new Date(NOW.getTime() + 24 * 60 * 60_000);

  const created = await repo.create({
    seniorId: SENIOR_ID,
    caregiverId: CAREGIVER_ID,
    tokenHash: HASH_A,
    expiresAt,
  });

  assert.equal(created.seniorId, SENIOR_ID);
  assert.equal(created.caregiverId, CAREGIVER_ID);
  assert.equal(created.tokenHash, HASH_A);
  assert.equal(created.expiresAt.getTime(), expiresAt.getTime());
  assert.equal(created.usedAt, null);
  assert.equal(created.invalidatedAt, null);

  const doc = await PairingTokenModel.findOne({ tokenHash: HASH_A }).lean();
  assert.ok(doc !== null);
  // El documento guarda los campos de D6 — y nunca un token en claro.
  const keys = Object.keys(doc).filter((key) => !['_id', '__v'].includes(key));
  assert.deepEqual(keys.sort(), ['caregiverId', 'createdAt', 'expiresAt', 'invalidatedAt', 'seniorId', 'tokenHash', 'updatedAt', 'usedAt']);

  // S5: dos tokens con el mismo hash son imposibles (índice único construido con Model.init()).
  await assert.rejects(
    repo.create({
      seniorId: OTHER_SENIOR_ID,
      caregiverId: CAREGIVER_ID,
      tokenHash: HASH_A,
      expiresAt,
    }),
    (error: unknown) => {
      assert.ok(typeof error === 'object' && error !== null && 'code' in error);
      assert.equal((error as { code?: unknown }).code, 11000);
      return true;
    },
  );
});

// S15/S7 — la invalidación toca sólo los no usados, no invalidados, de ese perfil.
mongoTest(
  'invalidateUnusedForSenior no toca usedAt, ni los usados, ni los ya invalidados, ni a otros perfiles',
  async () => {
    await clean();
    const repo = createMongoosePairingTokenRepository();
    const invalidatedAt = new Date(NOW.getTime() + 5 * 60_000);
    await seedToken({ tokenHash: HASH_A, seniorId: SENIOR_ID }); // no usado: objetivo
    await seedToken({
      tokenHash: HASH_B,
      seniorId: SENIOR_ID,
      usedAt: new Date(NOW.getTime() + 60_000), // canjeado: no se toca
    });
    await seedToken({
      tokenHash: HASH_C,
      seniorId: SENIOR_ID,
      invalidatedAt: new Date(NOW.getTime() + 30_000), // ya reemplazado: no se re-toca
    });
    await seedToken({ tokenHash: HASH_D, seniorId: OTHER_SENIOR_ID }); // otro perfil: intocable

    const changed = await repo.invalidateUnusedForSenior(SENIOR_ID, invalidatedAt);
    assert.equal(changed, 1, 'sólo el token no usado del perfil quedó marcado');

    const target = await PairingTokenModel.findOne({ tokenHash: HASH_A }).lean();
    assert.equal(target?.invalidatedAt !== null && target?.invalidatedAt !== undefined, true);
    assert.equal((target?.invalidatedAt as Date).getTime(), invalidatedAt.getTime());
    assert.equal(target?.usedAt, null, 'la emisión nunca toca usedAt');

    const used = await PairingTokenModel.findOne({ tokenHash: HASH_B }).lean();
    assert.equal(used?.usedAt !== null && used?.usedAt !== undefined, true, 'usedAt sigue fijado');
    assert.equal(used?.invalidatedAt ?? null, null, 'el canjeado no se marca como reemplazado');

    const alreadyInvalid = await PairingTokenModel.findOne({ tokenHash: HASH_C }).lean();
    assert.equal((alreadyInvalid?.invalidatedAt as Date).getTime(), NOW.getTime() + 30_000);

    const other = await PairingTokenModel.findOne({ tokenHash: HASH_D }).lean();
    assert.equal(other?.invalidatedAt ?? null, null);
  },
);

// S17 — después de invalidar, el token nuevo queda activo con su vencimiento.
mongoTest('create después de invalidar deja el token nuevo activo con el expiresAt recibido', async () => {
  await clean();
  const repo = createMongoosePairingTokenRepository();
  await seedToken({ tokenHash: HASH_A, seniorId: SENIOR_ID });
  await repo.invalidateUnusedForSenior(SENIOR_ID, NOW);

  const expiresAt = new Date(NOW.getTime() + 90 * 60_000);
  const created = await repo.create({
    seniorId: SENIOR_ID,
    caregiverId: CAREGIVER_ID,
    tokenHash: HASH_B,
    expiresAt,
  });

  assert.equal(created.invalidatedAt, null);
  assert.equal(created.usedAt, null);
  assert.equal(created.expiresAt.getTime(), expiresAt.getTime());

  const docs = await PairingTokenModel.find({ seniorId: SENIOR_ID }).lean();
  assert.equal(docs.length, 2, 'los invalidados quedan con su historia, no se borran');
});
