/**
 * Arnés de Mongo REAL para los pines de HU-004 que los dobles en memoria no
 * pueden ver (C3). Los dos defectos que motivó — el update pipeline que
 * escribía el hash bcrypt como campo vacío (C1) y el deleteMany+create que
 * dejaba dos enlaces vivos (C2) — sólo se manifiestan contra MongoDB.
 *
 * Reglas del arnés:
 * - Sin `MONGO_URL` se SALTEA entero: `npm test` sigue siendo verde sin Mongo.
 * - Se NIEGA a correr contra una base cuyo nombre no empiece con `chk-`
 *   (regla de la casa: toda prueba que escribe datos usa prefijo
 *   identificable y limpia al terminar; `mearn_db` está fuera de límites).
 * - Nada se mangnea por fuera de los puertos, salvo la SIEMBRA de cuentas
 *   (`UserModel.create`) y la lectura de la base para pinear lo guardado:
 *   el sujeto de la prueba es la persistencia.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { connect, disconnect, type Mongoose } from 'mongoose';
import bcrypt from 'bcryptjs';

import { createMongooseUserRepository } from '../src/modules/auth/infrastructure/MongooseUserRepository.ts';
import { PasswordResetTokenModel } from '../src/shared/models/PasswordResetToken.ts';
import { UserModel } from '../src/shared/models/User.ts';

const MINUTE_MS = 60_000;
const NOW = new Date('2026-01-01T00:00:00.000Z');
/** Prefijo identificable de la prueba (regla de la casa). */
const EMAIL_PIRROR = 'chk-hu004-';

const MONGO_URL = process.env.MONGO_URL ?? '';

function extractDbName(url: string): string | null {
  try {
    const parsed = new URL(url);
    const dbName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    return dbName === '' ? null : dbName;
  } catch {
    return null;
  }
}

function sha256(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

interface StoredResetDoc {
  userId: { toString(): string };
  email: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

interface StoredUserDoc {
  _id: { toString(): string };
  email: string;
  passwordHash: string | null;
  sessionVersion: number | null;
  failedLoginAttempts: number | null;
  lockedUntil: Date | null;
}

/**
 * Envoltorio de registro: sin MONGO_URL marca skip con el motivo; con una
 * base fuera del prefijo `chk-` se NIEGA — el test falla con la razón en la
 * mano, nunca corre contra una base que no sea de prueba.
 */
function mongoTest(name: string, body: () => Promise<void>): void {
  test(name, async (t) => {
    if (MONGO_URL === '') {
      t.skip('MONGO_URL no está definida: este pin exige Mongo real (C3)');
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

/** Conexión memoizada; garantiza que los índices únicos ya estén construidos. */
function db(): Promise<Mongoose> {
  if (connecting === null) {
    connecting = connect(MONGO_URL, { serverSelectionTimeoutMS: 5_000 }).then(async (mongoose) => {
      await Promise.all([UserModel.init(), PasswordResetTokenModel.init()]);
      return mongoose;
    });
  }
  return connecting;
}

after(async () => {
  if (connecting !== null) await disconnect();
});

/** Limpieza con el prefijo identificado: la prueba deja la base como la encontró. */
async function clean(): Promise<void> {
  await db();
  await Promise.all([
    UserModel.deleteMany({ email: { $regex: `^${EMAIL_PIRROR}` } }),
    PasswordResetTokenModel.deleteMany({ email: { $regex: `^${EMAIL_PIRROR}` } }),
  ]);
}

async function seedUser(email: string, passwordHash: string): Promise<void> {
  await UserModel.create({
    email,
    fullName: 'Esteban Trujillo',
    role: 'CAREGIVER',
    passwordHash,
    emailVerifiedAt: NOW,
    acceptedTermsAt: NOW,
    termsVersion: '9.9-test',
  });
}

async function readUserDoc(email: string): Promise<StoredUserDoc> {
  const doc = await UserModel.findOne({ email })
    .select('passwordHash sessionVersion failedLoginAttempts lockedUntil')
    .lean<StoredUserDoc>();
  assert.ok(doc, `la cuenta ${email} debería existir`);
  return doc;
}

async function readResetDocs(email: string): Promise<StoredResetDoc[]> {
  return PasswordResetTokenModel.find({ email }).lean<StoredResetDoc[]>();
}

async function saveLink(
  email: string,
  rawToken: string,
  expiresAt: Date = new Date(NOW.getTime() + 60 * MINUTE_MS),
): Promise<void> {
  await createMongooseUserRepository().savePasswordResetToken(email, {
    tokenHash: sha256(rawToken),
    expiresAt,
  });
}

// ─── S3/D4 (pin de C1) ──────────────────────────────────────────────────────

mongoTest(
  'S3/D4: el reset escribe el hash BCRYPT INTACTO en la base y sube sessionVersion null→1→2 (pin de C1)',
  async () => {
    await clean();
    const repo = createMongooseUserRepository();
    const email = 'chk-hu004-reset@example.test';
    const oldHash = bcrypt.hashSync('laContraseñaVieja1', 10);
    await seedUser(email, oldHash);

    const before = await readUserDoc(email);
    assert.equal(before.passwordHash, oldHash, 'antes del reset la base guarda el hash viejo');
    assert.equal(before.sessionVersion, null, 'la cuenta nace con sessionVersion en null');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * MINUTE_MS);
    await repo.savePasswordResetToken(email, { tokenHash: sha256('link-uno'), expiresAt });
    await repo.consumePasswordResetToken(sha256('link-uno'), now);

    const firstHash = bcrypt.hashSync('laContraseñaNueva2', 10);
    const matchedFirst = await repo.resetPassword(email, firstHash);
    assert.equal(matchedFirst, true, 'la escritura del primer reset matcheó la cuenta');

    const afterFirst = await readUserDoc(email);
    // EL PIN DE C1: el string que llegó al puerto tiene que estar íntegro en la
    // base. Con el pipeline defectuoso, un `$2b$…` traicionaba la ruta de
    // campo y el campo quedaba vacío: la cuenta quedaba irrecuperable.
    assert.equal(
      afterFirst.passwordHash,
      firstHash,
      'el hash nuevo llega a la base byte-íntegro (el `$2b$` no se come el pipeline)',
    );
    assert.equal(
      await bcrypt.compare('laContraseñaNueva2', afterFirst.passwordHash ?? ''),
      true,
      'la contraseña nueva valida contra el hash guardado',
    );
    assert.equal(
      await bcrypt.compare('laContraseñaVieja1', afterFirst.passwordHash ?? ''),
      false,
      'la contraseña vieja ya no valida',
    );
    assert.equal(afterFirst.sessionVersion, 1, 'null → 1 en el primer reset');
    assert.equal(afterFirst.failedLoginAttempts, null, 'la racha queda limpia');
    assert.equal(afterFirst.lockedUntil, null, 'el bloqueo queda limpio');

    // Y un segundo reset: 1 → 2 (D4: el $add parte del valor en la base).
    await repo.savePasswordResetToken(email, { tokenHash: sha256('link-dos'), expiresAt });
    await repo.consumePasswordResetToken(sha256('link-dos'), now);
    const secondHash = bcrypt.hashSync('laTerceraClave3', 10);
    await repo.resetPassword(email, secondHash);

    const afterSecond = await readUserDoc(email);
    assert.equal(afterSecond.passwordHash, secondHash, 'el segundo hash también llega íntegro');
    assert.equal(
      await bcrypt.compare('laTerceraClave3', afterSecond.passwordHash ?? ''),
      true,
      'la segunda contraseña nueva valida',
    );
    assert.equal(afterSecond.sessionVersion, 2, '1 → 2 en el segundo reset');
  },
);

// ─── S6 (consume atómico) ───────────────────────────────────────────────────

mongoTest(
  'S6: 8 canjes concurrentes del mismo enlace dejan UN solo ganador contra Mongo real',
  async () => {
    await clean();
    const repo = createMongooseUserRepository();
    const email = 'chk-hu004-race@example.test';
    await seedUser(email, bcrypt.hashSync('laContraseñaVieja1', 10));
    await saveLink(email, 'el-enlace-en-ronda');

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        repo.consumePasswordResetToken(sha256('el-enlace-en-ronda'), NOW),
      ),
    );
    const winners = results.filter((result) => result !== null);
    assert.equal(winners.length, 1, 'exactamente un ganador entre 8 canjes simultáneos');
    assert.equal(winners[0]?.email, email);
    assert.ok(winners[0]?.userId, 'el ganador trae el userId de la cuenta');

    // Quemado: un canje posterior recibe el mismo null que uno inválido.
    const replay = await repo.consumePasswordResetToken(sha256('el-enlace-en-ronda'), NOW);
    assert.equal(replay, null, 'el enlace quedó marcado como usado');
    const stored = await readResetDocs(email);
    assert.equal(stored.length, 1);
    assert.ok(stored[0]?.usedAt instanceof Date, 'usedAt quedó fijado en la base');
  },
);

// ─── S8 (un solo enlace vivo) + índice único del correo ────────────────────

mongoTest(
  'S8: sólo el último enlace queda vivo — secuencial y en carrera de 5 simultáneos (pin de C2)',
  async () => {
    await clean();
    const repo = createMongooseUserRepository();
    const email = 'chk-hu004-burn@example.test';
    await seedUser(email, bcrypt.hashSync('laContraseñaVieja1', 10));

    // Secuencial: pedir otro enlace quema el anterior.
    await saveLink(email, 'enlace-secuenciado-1');
    await saveLink(email, 'enlace-secuenciado-2');
    const sequential = await readResetDocs(email);
    assert.equal(sequential.length, 1, 'quedó un solo documento, no dos');
    assert.equal(sequential[0]?.tokenHash, sha256('enlace-secuenciado-2'));
    assert.equal(
      await repo.consumePasswordResetToken(sha256('enlace-secuenciado-1'), NOW),
      null,
      'el enlace viejo ya no sirve',
    );
    assert.ok(await repo.consumePasswordResetToken(sha256('enlace-secuenciado-2'), NOW));
    // Quemar sirve aunque el anterior ya esté usado: el upsert pisa usedAt.
    await saveLink(email, 'enlace-secuenciado-3');
    assert.ok(
      await repo.consumePasswordResetToken(sha256('enlace-secuenciado-3'), NOW),
      'después de usar uno, un enlace nuevo sigue sirviendo (usedAt: en null otra vez)',
    );

    // Carrera: 5 pedidos simultáneos del mismo correo no dejan dos enlaces vivos.
    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        saveLink(email, `enlace-en-carrera-${index}`),
      ),
    );
    const raced = await readResetDocs(email);
    assert.equal(
      raced.length,
      1,
      `la carrera de 5 dejó ${raced.length} enlaces vivos: con deleteMany+create son 5`,
    );
    const survivor = raced[0]?.tokenHash;
    assert.ok(survivor, 'la carrera dejó un enlace');
    for (let index = 0; index < 5; index += 1) {
      const hash = sha256(`enlace-en-carrera-${index}`);
      if (hash === survivor) {
        assert.ok(await repo.consumePasswordResetToken(hash, NOW), 'el superviviente sirve');
      } else {
        assert.equal(
          await repo.consumePasswordResetToken(hash, NOW),
          null,
          `el enlace ${index} de la carrera quedó muerto`,
        );
      }
    }

    // Pin de C2: el correo tiene índice único — no hay forma de volver a los
    // dos enlaces vivos, ni siquiera escribiendo la colección por fuera del
    // puerto.
    const indexes = await PasswordResetTokenModel.collection.indexes();
    const emailIndex = indexes.find((index) => index.name === 'email_1');
    assert.ok(emailIndex, 'existe el índice de email');
    assert.equal(emailIndex.unique, true, 'el índice de email es ÚNICO');
  },
);

// ─── S4/D1 (sólo el hash en la base; tokenHash único) ──────────────────────

mongoTest(
  'S4/D1: la base guarda sólo sha256(token) — jamás el token en claro — y tokenHash es ÚNICO',
  async () => {
    await clean();
    const email = 'chk-hu004-oneway@example.test';
    const otherEmail = 'chk-hu004-oneway-otra@example.test';
    await seedUser(email, bcrypt.hashSync('laContraseñaVieja1', 10));

    const rawToken = 'elTokenEnClaroQueNuncaDebeLlegarALaBase-9zXyW';
    await saveLink(email, rawToken);

    const collection = PasswordResetTokenModel.collection;
    const stored = await collection.findOne({ tokenHash: sha256(rawToken) });
    assert.ok(stored, 'el documento del enlace está en la base');
    assert.equal(stored.tokenHash, sha256(rawToken), 'el tokenHash guardado es exactamente el SHA-256');
    assert.match(stored.tokenHash, /^[0-9a-f]{64}$/, 'el hash es 64 hex');
    assert.equal(stored.email, email);
    assert.ok(stored.usedAt === null, 'el enlace vive mientras no se canjee');
    assert.ok(stored.expiresAt instanceof Date, 'guarda su vencimiento');
    // El token en claro no aparece en ninguna parte del documento.
    const serialized = JSON.stringify(stored);
    assert.ok(!serialized.includes(rawToken), 'el token en claro no está en la base');
    assert.ok(!serialized.includes(rawToken.slice(0, 12)), 'ni un prefijo del token');

    // Índice único en tokenHash (D1), probado por comportamiento: un INSERT
    // directo con un tokenHash repetido pero correo DISTINTO tiene que caer.
    const indexes = await collection.indexes();
    const tokenIndex = indexes.find((index) => index.name === 'tokenHash_1');
    assert.ok(tokenIndex, 'existe el índice de tokenHash');
    assert.equal(tokenIndex.unique, true, 'el índice de tokenHash es ÚNICO');

    const duplicateToken = await collection
      .insertOne({
        tokenHash: sha256(rawToken),
        userId: stored.userId,
        email: otherEmail,
        expiresAt: new Date(NOW.getTime() + 60 * MINUTE_MS),
        usedAt: null,
      })
      .catch((error: unknown) => error);
    assert.ok(
      duplicateToken instanceof Error && (duplicateToken as { code?: unknown }).code === 11000,
      'tokenHash no admite duplicados: la inserción directa cae con E11000',
    );

    // Y el mismo insert directo peor: mismo correo con tokenHash nuevo → E11000.
    const duplicateEmail = await collection
      .insertOne({
        tokenHash: sha256('otro-token-distinto'),
        userId: stored.userId,
        email,
        expiresAt: new Date(NOW.getTime() + 60 * MINUTE_MS),
        usedAt: null,
      })
      .catch((error: unknown) => error);
    assert.ok(
      duplicateEmail instanceof Error && (duplicateEmail as { code?: unknown }).code === 11000,
      'el correo tampoco admite duplicados (C2, un vivo por cuenta)',
    );
  },
);
