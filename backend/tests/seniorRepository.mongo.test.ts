/**
 * HU-005/HU-007 — pines de persistencia del slice seniors contra MongoDB REAL.
 * Los dobles en memoria no ven índices únicos ni el orden de escritura, y las
 * dos veces anteriores un defecto del adaptador escapó por ahí (HU-002, HU-004).
 *
 * Reglas del arnés (las mismas que HU-004):
 * - Sin `MONGO_URL` se SALTEA entero: `npm test` sigue siendo verde sin Mongo.
 * - Se NIEGA a correr contra una base cuyo nombre no empiece con `chk-`.
 * - Todo lo que se siembra lleva el prefijo `chk-hu005-` y se limpia al final.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect, disconnect, type Mongoose } from 'mongoose';

import { createMongooseSeniorRepository } from '../src/modules/seniors/infrastructure/MongooseSeniorRepository.ts';
import {
  createSenior,
  DEFAULT_TIMEZONE,
  type SeniorProfileDocument,
} from '../src/modules/seniors/domain/seniorProfile.ts';
import { createFamilyLink } from '../src/modules/seniors/domain/seniorLink.ts';
import { SeniorLinkModel } from '../src/shared/models/SeniorLink.ts';
import { UserModel } from '../src/shared/models/User.ts';

const MONGO_URL = process.env.MONGO_URL ?? '';
const EMAIL_PREFIX = 'chk-hu005-';
const NOW = new Date('2026-01-01T00:00:00.000Z');
const OWNER_ID = '507f1f77bcf86cd7994390a1';
const FAMILY_ID = '507f1f77bcf86cd7994390a2';
const STRANGER_ID = '507f1f77bcf86cd7994390a3';

function extractDbName(url: string): string | null {
  try {
    const parsed = new URL(url);
    const dbName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    return dbName === '' ? null : dbName;
  } catch {
    return null;
  }
}

/**
 * Cada archivo de pines corre en su propio proceso y `node --test` los lanza
 * en paralelo: compartir la base con otro archivo que la dropea (HU-004) hace
 * que los índices desaparezcan a mitad de carrera. La base de este archivo se
 * deriva del nombre configurado y sigue empezando con `chk-`.
 */
function isolatedUrl(url: string): string {
  const parsed = new URL(url);
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  parsed.pathname = `/${dbName}-seniors`;
  return parsed.toString();
}

const SENIORS_MONGO_URL = MONGO_URL === '' ? '' : isolatedUrl(MONGO_URL);

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
      const connection = await connect(SENIORS_MONGO_URL);
      // Los índices únicos son el sujeto de dos pines: hay que construirlos.
      await Promise.all([UserModel.init(), SeniorLinkModel.init()]);
      return connection;
    })();
  }
  return connecting;
}

async function clean(): Promise<void> {
  await db();
  await UserModel.deleteMany({ email: { $regex: `^${EMAIL_PREFIX}` } });
  await SeniorLinkModel.deleteMany({});
}

function profileInput(): Parameters<typeof createSenior>[0] {
  return {
    fullName: 'Rosa Pérez',
    bloodType: 'O+',
    allergies: ['penicilina'],
    conditions: ['hipertensión'],
    medications: ['losartán'],
    emergencyContact: { fullName: 'Ana Pérez', phone: '+573001234567' },
  };
}

/** El perfil sintético lleva el prefijo de la casa para que `clean` lo borre. */
function taggedProfile(email: string): SeniorProfileDocument {
  const senior = createSenior(profileInput());
  return { ...senior, email: `${EMAIL_PREFIX}${email}` };
}

after(async () => {
  if (MONGO_URL === '') return;
  await clean();
  const connection = await db();
  await SeniorLinkModel.deleteMany({});
  await connection.connection.db?.dropDatabase();
  await disconnect();
});

// S1, S6 — el alta escribe el perfil y el primer vínculo.
mongoTest('createSeniorProfile persiste el perfil y el vínculo OWNER del alta', async () => {
  await clean();
  const repo = createMongooseSeniorRepository();
  const profile = taggedProfile('alta@seniors.local');

  const created = await repo.createSeniorProfile(profile, OWNER_ID, NOW);

  assert.equal(created.fullName, 'Rosa Pérez');
  assert.equal(created.timezone, DEFAULT_TIMEZONE);
  assert.equal(created.linkStatus, 'PENDING');
  assert.deepEqual(created.allergies, ['penicilina']);
  assert.deepEqual(created.emergencyContact, { fullName: 'Ana Pérez', phone: '+573001234567' });

  const links = await SeniorLinkModel.find({ seniorId: created.id }).lean();
  assert.equal(links.length, 1);
  assert.equal(links[0]?.role, 'OWNER');
  assert.equal(links[0]?.status, 'ACTIVE');
  assert.equal(links[0]?.caregiverId.toString(), OWNER_ID);
});

// S1, S3 — dos familiares conviven; agregar no revoca.
mongoTest('addCaregiverLink suma un segundo familiar sin tocar el vínculo existente', async () => {
  await clean();
  const repo = createMongooseSeniorRepository();
  const created = await repo.createSeniorProfile(taggedProfile('dos@seniors.local'), OWNER_ID, NOW);

  await repo.addCaregiverLink(
    createFamilyLink({
      seniorId: created.id,
      caregiverId: FAMILY_ID,
      invitedBy: OWNER_ID,
      createdAt: NOW,
    }),
  );

  const links = await SeniorLinkModel.find({ seniorId: created.id }).lean();
  assert.equal(links.length, 2);
  const owner = links.find((link) => link.role === 'OWNER');
  const family = links.find((link) => link.role === 'FAMILY');
  assert.equal(owner?.status, 'ACTIVE');
  assert.equal(owner?.caregiverId.toString(), OWNER_ID);
  assert.equal(family?.caregiverId.toString(), FAMILY_ID);

  // Repetir el alta del mismo familiar no duplica ni revoca (índice único + upsert).
  await repo.addCaregiverLink(
    createFamilyLink({
      seniorId: created.id,
      caregiverId: FAMILY_ID,
      invitedBy: OWNER_ID,
      createdAt: NOW,
    }),
  );
  assert.equal(await SeniorLinkModel.countDocuments({ seniorId: created.id }), 2);
});

// S1, S4, S5 — la lista y el detalle se acotan por vínculo.
mongoTest('listSeniorsForCaregiver y findSeniorForCaregiver se acotan por vínculo activo', async () => {
  await clean();
  const repo = createMongooseSeniorRepository();
  const created = await repo.createSeniorProfile(taggedProfile('acota@seniors.local'), OWNER_ID, NOW);
  await repo.addCaregiverLink(
    createFamilyLink({
      seniorId: created.id,
      caregiverId: FAMILY_ID,
      invitedBy: OWNER_ID,
      createdAt: NOW,
    }),
  );

  assert.deepEqual(
    (await repo.listSeniorsForCaregiver(OWNER_ID)).map((senior) => senior.id),
    [created.id],
  );
  // S2: el segundo familiar ve lo mismo que el primero.
  assert.deepEqual(
    (await repo.listSeniorsForCaregiver(FAMILY_ID)).map((senior) => senior.id),
    [created.id],
  );
  // S5: el no vinculado no ve nada.
  assert.deepEqual(await repo.listSeniorsForCaregiver(STRANGER_ID), []);
  assert.equal(await repo.findSeniorForCaregiver(created.id, STRANGER_ID), null);

  const found = await repo.findSeniorForCaregiver(created.id, FAMILY_ID);
  assert.equal(found?.id, created.id);
  assert.equal(found?.bloodType, 'O+');
});

// Falla cerrado: un vínculo revocado no autoriza nada.
mongoTest('un vínculo REVOKED no autoriza la lectura del perfil', async () => {
  await clean();
  const repo = createMongooseSeniorRepository();
  const created = await repo.createSeniorProfile(taggedProfile('revoca@seniors.local'), OWNER_ID, NOW);
  await SeniorLinkModel.updateMany({ seniorId: created.id }, { $set: { status: 'REVOKED' } });

  assert.equal(await repo.findSeniorForCaregiver(created.id, OWNER_ID), null);
  assert.deepEqual(await repo.listSeniorsForCaregiver(OWNER_ID), []);
});

// S4 — el listado de familiares de un adulto, con nombre y rol.
mongoTest('listCaregiversOfSenior devuelve los N familiares vinculados', async () => {
  await clean();
  await db();
  await UserModel.create({
    email: `${EMAIL_PREFIX}owner@seniors.local`,
    fullName: 'Esteban Trujillo',
    role: 'CAREGIVER',
  });
  const owner = await UserModel.findOne({ email: `${EMAIL_PREFIX}owner@seniors.local` }).lean();
  assert.ok(owner !== null);
  const ownerId = owner._id.toString();
  await UserModel.create({
    email: `${EMAIL_PREFIX}family@seniors.local`,
    fullName: 'Ana Pérez',
    role: 'CAREGIVER',
  });
  const family = await UserModel.findOne({ email: `${EMAIL_PREFIX}family@seniors.local` }).lean();
  assert.ok(family !== null);

  const repo = createMongooseSeniorRepository();
  const created = await repo.createSeniorProfile(taggedProfile('familia@seniors.local'), ownerId, NOW);
  await repo.addCaregiverLink(
    createFamilyLink({
      seniorId: created.id,
      caregiverId: family._id.toString(),
      invitedBy: ownerId,
      createdAt: NOW,
    }),
  );

  const caregivers = await repo.listCaregiversOfSenior(created.id);
  assert.equal(caregivers.length, 2);
  assert.deepEqual(
    caregivers.map((caregiver) => caregiver.fullName).sort(),
    ['Ana Pérez', 'Esteban Trujillo'],
  );
  assert.deepEqual(caregivers.map((caregiver) => caregiver.role).sort(), ['FAMILY', 'OWNER']);
});

// El índice único de `email` sigue siendo honesto con el correo sintético.
mongoTest('el correo sintético del perfil es único en la colección users', async () => {
  await clean();
  const repo = createMongooseSeniorRepository();
  const first = await repo.createSeniorProfile(createSenior(profileInput()), OWNER_ID, NOW);
  const second = await repo.createSeniorProfile(createSenior(profileInput()), OWNER_ID, NOW);

  assert.notEqual(first.id, second.id);
  const stored = await UserModel.find({ role: 'SENIOR' }).lean();
  const emails = stored.map((doc) => doc.email);
  assert.equal(new Set(emails).size, emails.length);
});
