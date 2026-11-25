/**
 * HU-008 / S18 — pin contra MongoDB REAL del lector de perfiles de la emisión.
 *
 * El esquema hidrata `linkStatus` con su default ('PENDING'), así que un
 * documento anterior a HU-007 —que no guarda el campo— se leería como pendiente
 * y recibiría un QR nuevo. La decisión D12 lo cuenta como YA VINCULADO y el
 * lector distingue la ausencia sobre el BSON crudo, sin tocar el mapeo que
 * alimenta `GET /api/seniors/:id`.
 *
 * Misma disciplina del resto de los pines: sin `MONGO_URL` se saltea, se niega a
 * correr contra una base que no empiece con `chk-`, y usa una base propia del
 * archivo porque `node --test` corre los archivos en paralelo.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect, disconnect, Types, type Mongoose } from 'mongoose';

import { createMongooseSeniorRepository } from '../src/modules/seniors/index.ts';
import { createMongoosePairingSeniorReader } from '../src/modules/pairing/index.ts';
import { GeneratePairingQr } from '../src/modules/pairing/application/GeneratePairingQr.ts';
import { UserModel } from '../src/shared/models/User.ts';
import { SeniorLinkModel } from '../src/shared/models/SeniorLink.ts';
import {
  InMemoryPairingTokenRepository,
  InMemoryRedeemSeniorWriter,
  RecordingQrEncoder,
} from './support/pairingFakes.ts';

const MONGO_URL = process.env.MONGO_URL ?? '';
const NOW = new Date('2026-01-01T00:00:00.000Z');
const TTL_MINUTES = 1440;
const CAREGIVER_ID = '507f1f77bcf86cd7994390aa';

function extractDbName(url: string): string | null {
  try {
    const parsed = new URL(url);
    const dbName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    return dbName === '' ? null : dbName;
  } catch {
    return null;
  }
}

function isolatedUrl(url: string): string {
  const parsed = new URL(url);
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  parsed.pathname = `/${dbName}-pairing-reader`;
  return parsed.toString();
}

const READER_MONGO_URL = MONGO_URL === '' ? '' : isolatedUrl(MONGO_URL);

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
      const connection = await connect(READER_MONGO_URL);
      await UserModel.init();
      await SeniorLinkModel.init();
      return connection;
    })();
  }
  return connecting;
}

async function clean(): Promise<void> {
  await db();
  await UserModel.deleteMany({});
  await SeniorLinkModel.deleteMany({});
}

/** Perfil por el camino real: modelo + vínculo activo con el familiar. */
async function seedSenior(input: {
  seniorId: string;
  fullName: string;
  /** `undefined` escribe el documento SIN el campo, como la versión anterior. */
  linkStatus?: 'PENDING' | 'LINKED';
}): Promise<void> {
  await db();
  const profile = {
    // `insertOne` no castea: el _id crudo tiene que ser ObjectId o el vínculo
    // (que sí lo castea) no lo encontraría.
    _id: new Types.ObjectId(input.seniorId),
    email: `senior+${input.seniorId}@seniors.local`,
    fullName: input.fullName,
    role: 'SENIOR',
    timezone: 'America/Bogota',
    bloodType: 'O+',
    emergencyContact: { fullName: 'Ana Pérez', phone: '+573001234567' },
  };
  if (input.linkStatus === undefined) {
    // `insertOne` directo: `create` aplicaría el default del esquema y el pin
    // dejaría de probar el documento legacy que existe en la base del VPS.
    await UserModel.collection.insertOne({ ...profile, createdAt: NOW, updatedAt: NOW });
  } else {
    await UserModel.create({ ...profile, linkStatus: input.linkStatus });
  }
  await SeniorLinkModel.create({
    seniorId: input.seniorId,
    caregiverId: CAREGIVER_ID,
    role: 'OWNER',
    status: 'ACTIVE',
    createdAt: NOW,
  });
}

function emission(reader: ReturnType<typeof createMongoosePairingSeniorReader>) {
  const tokens = new InMemoryPairingTokenRepository();
  const encoder = new RecordingQrEncoder();
  const useCase = new GeneratePairingQr({
    seniorReader: reader,
    pairingTokenRepository: tokens,
    // D14.1: emitir reinicia el bloqueo del canje de ese perfil.
    seniorWriter: new InMemoryRedeemSeniorWriter(),
    qrEncoder: encoder,
    clock: () => NOW,
    ttlMinutes: TTL_MINUTES,
  });
  return { useCase, tokens, encoder };
}

after(async () => {
  if (MONGO_URL === '') return;
  await clean();
  const connection = await db();
  await connection.connection.db?.dropDatabase();
  await disconnect();
});

// S18/D12 — sin el campo guardado, el perfil cuenta como ya vinculado: 409.
mongoTest('S18: un perfil guardado sin linkStatus responde 409 y no emite credencial', async () => {
  await clean();
  const seniorId = '507f1f77bcf86cd799439011';
  await seedSenior({ seniorId, fullName: 'Rosa Pérez' });

  // El mapeo de seniors hidrata el default: por eso el lector necesita ver el BSON.
  const seniorRepository = createMongooseSeniorRepository();
  const mapped = await seniorRepository.findSeniorForCaregiver(seniorId, CAREGIVER_ID);
  assert.equal(mapped?.linkStatus, 'PENDING', 'el default del esquema tapa la ausencia');

  const { useCase, tokens, encoder } = emission(
    createMongoosePairingSeniorReader(seniorRepository),
  );

  await assert.rejects(
    useCase.execute({ seniorId, caregiverId: CAREGIVER_ID }),
    (error: unknown) => {
      const appError = error as { statusCode?: number; code?: string };
      assert.equal(appError.statusCode, 409);
      assert.equal(appError.code, 'SENIOR_ALREADY_LINKED');
      return true;
    },
  );
  // S4/S13/S15: sin credencial no se codifica nada ni se toca la colección.
  assert.equal(encoder.payloads.length, 0, 'no se codifica un QR para un perfil ya vinculado');
  assert.equal(tokens.createCalls, 0, 'no se persiste ningún token');
});

// S18 — el perfil del rewrite sí guarda el campo y puede emitir.
mongoTest('S18: un perfil con linkStatus PENDING guardado sí emite el QR', async () => {
  await clean();
  const seniorId = '507f1f77bcf86cd799439022';
  await seedSenior({ seniorId, fullName: 'Juan Gómez', linkStatus: 'PENDING' });

  const seniorRepository = createMongooseSeniorRepository();
  const { useCase, tokens, encoder } = emission(
    createMongoosePairingSeniorReader(seniorRepository),
  );

  const result = await useCase.execute({ seniorId, caregiverId: CAREGIVER_ID });

  assert.equal(result.seniorId, seniorId);
  assert.equal(result.expiresAt.getTime(), NOW.getTime() + TTL_MINUTES * 60_000);
  assert.ok(result.qrCodeDataUrl.startsWith('data:image/png;base64,'));
  assert.equal(encoder.payloads.length, 1);
  // S5: a la persistencia llega el hash, nunca el token del payload.
  const rawToken = JSON.parse(encoder.payloads[0] ?? '{}').token;
  assert.equal(typeof rawToken, 'string');
  assert.equal(tokens.createCalls, 1);
  assert.notEqual(tokens.createdWrites[0]?.tokenHash, rawToken);
  assert.equal(tokens.createdWrites[0]?.seniorId, seniorId);
});
