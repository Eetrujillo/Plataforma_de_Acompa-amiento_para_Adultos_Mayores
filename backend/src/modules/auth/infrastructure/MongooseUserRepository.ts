import { isValidObjectId } from 'mongoose';
import { UserModel } from '../../../shared/models/User.ts';
import { PasswordResetTokenModel } from '../../../shared/models/PasswordResetToken.ts';
import { DuplicateEmailError } from '../application/RegisterCaregiver.ts';
import type { NextLockoutState } from '../domain/loginLockout.ts';
import type { StoredUser, UserRepositoryPort } from '../application/RegisterCaregiver.ts';
import type {
  LoginCredentials,
  LoginStorePort,
  RegisterFailedLoginConfig,
} from '../application/Login.ts';
import type { SessionUser, SessionUserReaderPort } from '../../../shared/middlewares/authMiddleware.ts';
import type { UserEntity, UserRole } from '../domain/User.ts';
import type {
  VerificationStorePort,
  VerificationTokenTarget,
} from '../application/RequestEmailVerification.ts';
import type { PasswordResetStorePort } from '../application/RequestPasswordReset.ts';

interface PersistedUser {
  _id: { toString(): string };
  email: string;
  fullName: string;
  role: string;
}

interface PersistedTokenDoc extends PersistedUser {
  verificationTokenHash: string | null;
  verificationTokenExpiresAt: Date | null;
  emailVerifiedAt: Date | null;
}

/** Documento proyectado por `findCredentialsByEmail`: HU-003 (S1/S3/S8). */
interface PersistedCredentials extends PersistedUser {
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  sessionVersion: number | null;
  failedLoginAttempts: number | null;
  lockedUntil: Date | null;
}

/** Documento proyectado por `findSessionUserById` (authMiddleware, S7). */
interface PersistedSessionUser extends PersistedUser {
  sessionVersion: number | null;
}

interface PersistedResetTarget {
  userId: { toString(): string };
  email: string;
}

/**
 * C1: los campos que la proyección de `findByVerificationTokenHash` debe traer
 * para que el mapeo produzca un `VerificationTokenTarget` completo — todos los
 * que el puerto devuelve, más `_id`, del que sale `id`. La proyección vive
 * entera en esta constante: devolver un campo nuevo sin sumarlo acá hace
 * fallar el test de `tests/emailVerificationAdapter.test.ts`. El defecto
 * original era un `email` ausente que terminaba en `markEmailVerified(undefined,…)`.
 */
export const VERIFICATION_TOKEN_FIELDS = [
  '_id',
  'email',
  'fullName',
  'verificationTokenHash',
  'verificationTokenExpiresAt',
  'emailVerifiedAt',
] as const;

/** Mapeo del documento proyectado al target del puerto (exportado para el test de C1). */
export function mapVerificationTokenTarget(doc: PersistedTokenDoc): VerificationTokenTarget {
  return {
    id: doc._id.toString(),
    email: doc.email,
    fullName: doc.fullName,
    tokenHash: doc.verificationTokenHash ?? '',
    expiresAt: doc.verificationTokenExpiresAt ?? null,
    emailVerifiedAt: doc.emailVerifiedAt ?? null,
  };
}

function toStored(doc: PersistedUser): StoredUser {
  return {
    id: doc._id.toString(),
    email: doc.email,
    fullName: doc.fullName,
    role: doc.role as UserRole,
  };
}

/**
 * El driver de Mongo señala la violación de un índice único con `code: 11000`.
 * Se comprueba por forma para poder cubrirlo sin levantar Mongo en los tests.
 */
export function isDuplicateKeyError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

/**
 * Adaptador Mongoose de los puertos UserRepository (HU-001) y
 * VerificationStore (HU-002), sobre el mismo documento User (D3): MongoDB 7
 * vía MONGO_URL. El mismo objeto satisface los dos puertos.
 */
export function createMongooseUserRepository(): UserRepositoryPort &
  VerificationStorePort &
  LoginStorePort &
  SessionUserReaderPort &
  PasswordResetStorePort {
  return {
    async findByEmail(email: string): Promise<StoredUser | null> {
      const doc = await UserModel.findOne({ email }).lean();
      return doc === null ? null : toStored(doc);
    },
    async save(user: UserEntity): Promise<StoredUser> {
      try {
        const created = await UserModel.create({
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          // Solo el hash; el texto plano jamás llega a la base ni a los logs.
          passwordHash: user.passwordHash,
          acceptedTermsAt: user.consent.acceptedTermsAt,
          termsVersion: user.consent.termsVersion,
          ...(user.phone === undefined ? {} : { phone: user.phone }),
          ...(user.consent.ipAddress === undefined ? {} : { ipAddress: user.consent.ipAddress }),
        });
        return toStored(created);
      } catch (error: unknown) {
        // Carrera entre dos altas: el índice único gana y el puerto lo declara
        // como DuplicateEmailError para que el caso de uso responda 400, no 500.
        if (isDuplicateKeyError(error)) throw new DuplicateEmailError();
        throw error;
      }
    },

    // HU-002: el token se guarda pisando el anterior — el reenvío invalida el
    // enlace viejo (S8). A la base sólo llega el SHA-256, jamás el token en
    // claro (S6).
    async saveVerificationToken(
      email: string,
      token: { tokenHash: string; expiresAt: Date },
    ): Promise<void> {
      await UserModel.updateOne(
        { email },
        {
          verificationTokenHash: token.tokenHash,
          verificationTokenExpiresAt: token.expiresAt,
        },
      );
    },

    async findEmailVerificationState(
      email: string,
    ): Promise<{ fullName: string; emailVerifiedAt: Date | null } | null> {
      const doc = await UserModel.findOne({ email })
        .select('fullName emailVerifiedAt')
        .lean<PersistedTokenDoc>();
      if (doc === null) return null;
      return { fullName: doc.fullName, emailVerifiedAt: doc.emailVerifiedAt ?? null };
    },

    async findByVerificationTokenHash(tokenHash: string): Promise<VerificationTokenTarget | null> {
      // select: false en el esquema: los campos del token se piden acá de
      // forma explícita — la constante publica la proyección completa (C1)
      // para que ningún campo del puerto quede fuera por descuido.
      const doc = await UserModel.findOne({ verificationTokenHash: tokenHash })
        .select(VERIFICATION_TOKEN_FIELDS.join(' '))
        .lean<PersistedTokenDoc>();
      if (doc === null) return null;
      return mapVerificationTokenTarget(doc);
    },

    /**
     * C2: canje atómico y condicionado — `findOneAndUpdate` con el hash vigente
     * y `emailVerifiedAt: null` en el filtro. Dos usos del mismo token no pueden
     * dar dos escrituras: el perdedor obtiene `null` y el caso de uso responde
     * el mismo `INVALID_TOKEN` (D2). `new: true` devuelve el documento ya
     * actualizado, con `emailVerifiedAt` fijado y el token quemado.
     */
    async markEmailVerified(
      email: string,
      tokenHash: string,
      verifiedAt: Date,
    ): Promise<StoredUser | null> {
      const doc = await UserModel.findOneAndUpdate(
        { email, verificationTokenHash: tokenHash, emailVerifiedAt: null, verificationTokenExpiresAt: { $gt: verifiedAt } },
        {
          emailVerifiedAt: verifiedAt,
          verificationTokenHash: null,
          verificationTokenExpiresAt: null,
        },
        { new: true },
      ).lean<PersistedUser>();
      return doc === null ? null : toStored(doc);
    },

    /**
     * HU-003: la única lectura que trae `passwordHash` (y nunca otro campo de
     * más). Proyección explícita, con la misma disciplina de C1: un campo del
     * puerto que falte en la proyección se vuelve `null` silencioso.
     */
    async findCredentialsByEmail(email: string): Promise<LoginCredentials | null> {
      const doc = await UserModel.findOne({ email })
        .select(
          '_id email fullName role passwordHash emailVerifiedAt sessionVersion failedLoginAttempts lockedUntil',
        )
        .lean<PersistedCredentials>();
      if (doc === null) return null;
      return {
        id: doc._id.toString(),
        email: doc.email,
        fullName: doc.fullName,
        role: doc.role as UserRole,
        passwordHash: doc.passwordHash ?? null,
        emailVerifiedAt: doc.emailVerifiedAt ?? null,
        sessionVersion: doc.sessionVersion ?? null,
        failedLoginAttempts: doc.failedLoginAttempts ?? null,
        lockedUntil: doc.lockedUntil ?? null,
      };
    },

    /**
     * C2: un solo incremento atómico e incondicional — `findOneAndUpdate` con
     * un update pipeline cuyo `$add` parte del valor guardado en la base, no de
     * uno leído antes: 20 fallos simultáneos persisten exactamente 20, sin
     * incrementos perdidos ni duplicados. La MISMA operación fija `lockedUntil`
     * cuando la racha alcanza el umbral y devuelve el documento ya actualizado:
     * ninguna ventana entre leer y escribir puede dejar el bloqueo a medias.
     * Espeja las reglas puras de `registerFailure` (`domain/loginLockout.ts`):
     * racha por correo normalizado, un bloqueo ya vencido la reinicia (fallos
     * consecutivos). Los 429 de cuenta bloqueada no llegan acá: el caso de uso
     * los corta antes (S12).
     */
    async registerFailedLogin(
      email: string,
      config: RegisterFailedLoginConfig,
    ): Promise<NextLockoutState | null> {
      // `$set` sobre campos del documento: el pipeline calcula la racha desde el
      // estado actual y el umbral con los valores de configuración del servidor.
      const pipeline = [
        {
          $set: {
            __streak: {
              $cond: [
                { $and: [{ $ne: ['$lockedUntil', null] }, { $lt: ['$lockedUntil', config.now] }] },
                0,
                { $ifNull: ['$failedLoginAttempts', 0] },
              ],
            },
          },
        },
        {
          $set: {
            failedLoginAttempts: { $add: ['$__streak', 1] },
            lockedUntil: {
              $cond: [
                { $gte: [{ $add: ['$__streak', 1] }, config.maxAttempts] },
                { $add: [config.now, config.lockMs] },
                null,
              ],
            },
          },
        },
        { $unset: '__streak' },
      ];
      const doc = await UserModel.findOneAndUpdate({ email }, pipeline, {
        new: true,
        projection: 'failedLoginAttempts lockedUntil',
      }).lean<{ failedLoginAttempts: number; lockedUntil: Date | null }>();
      if (doc === null) return null;
      return {
        failedLoginAttempts: doc.failedLoginAttempts,
        lockedUntil: doc.lockedUntil ?? null,
      };
    },

    /** S5: el login correcto deja la racha en 0 y lockedUntil en null. */
    async clearFailedLogins(email: string): Promise<void> {
      await UserModel.updateOne({ email }, { $set: { failedLoginAttempts: 0, lockedUntil: null } });
    },

    /** HU-003/S7: lectura por id para el authMiddleware, sin datos de más. */
    async findSessionUserById(id: string): Promise<SessionUser | null> {
      // Un `sub` que no es ObjectId (token malformado que firma otro) no puede
      // escaparse como 500: responde `null` y el guard lo traduce a 401.
      if (!isValidObjectId(id)) return null;
      const doc = await UserModel.findById(id)
        .select('_id email fullName role sessionVersion')
        .lean<PersistedSessionUser>();
      if (doc === null) return null;
      return {
        id: doc._id.toString(),
        email: doc.email,
        fullName: doc.fullName,
        role: doc.role as UserRole,
        sessionVersion: doc.sessionVersion ?? null,
      };
    },

    // ─── HU-004: puerto PasswordResetStore (D1: colección propia) ─────────

    /**
     * S8/C2: pedir otro enlace quema el anterior — UNA SOLA escritura atómica.
     * `findOneAndUpdate` con upsert pisando hash, vencimiento y `usedAt` (el
     * enlace nuevo vive aunque el anterior ya esté canjeado), sobre el índice
     * ÚNICO de `email`: dos pedidos simultáneos jamás dejan dos enlaces vivos.
     * El `deleteMany` + `create` anterior perdía la carrera 5 de 5 veces. A la
     * base sólo llega el SHA-256 (S4/​D5); el userId de la cuenta viaja en la
     * búsqueda previa del estado.
     */
    async savePasswordResetToken(
      email: string,
      token: { tokenHash: string; expiresAt: Date },
    ): Promise<void> {
      const user = await UserModel.findOne({ email }).select('_id').lean<PersistedUser>();
      if (user === null) return; // La cuenta desapareció: nada que guardar.
      await PasswordResetTokenModel.findOneAndUpdate(
        { email },
        {
          $set: {
            tokenHash: token.tokenHash,
            expiresAt: token.expiresAt,
            usedAt: null,
            userId: user._id,
          },
        },
        { upsert: true },
      );
    },

    /** Estado mínimo para decidir si corresponde enviar (S1), sin exponer el hash. */
    async findPasswordResetState(
      email: string,
    ): Promise<{ fullName: string; passwordHash: string | null } | null> {
      const doc = await UserModel.findOne({ email })
        .select('fullName passwordHash')
        .lean<PersistedCredentials>();
      if (doc === null) return null;
      return { fullName: doc.fullName, passwordHash: doc.passwordHash ?? null };
    },

    /**
     * S6/D3: consumo atómico y previo — una única escritura condicionada.
     * `findOneAndUpdate` fija `usedAt` con `usedAt: null` y vencimiento vivo
     * en el filtro: dos canjes simultáneos del mismo token no pueden dar dos
     * ganadores, y el perdedor obtiene `null` para el mismo INVALID_TOKEN.
     * Proyección explícita (disciplina C1): sólo el _id de la cuenta y el
     * correo; el hash jamás sale de la colección.
     */
    async consumePasswordResetToken(
      tokenHash: string,
      now: Date,
    ): Promise<{ userId: string; email: string } | null> {
      const doc = await PasswordResetTokenModel.findOneAndUpdate(
        { tokenHash, usedAt: null, expiresAt: { $gt: now } },
        { $set: { usedAt: now } },
        { new: true, projection: 'userId email' },
      )
        .lean<PersistedResetTarget>();
      if (doc === null) return null;
      return { userId: doc.userId.toString(), email: doc.email };
    },

    /**
     * D4: una sola escritura — un update pipeline con `$set` fija el hash
     * nuevo, limpia `failedLoginAttempts` y `lockedUntil`, y sube
     * `sessionVersion` con `$add`/`$ifNull` (null se lee como 0) en la MISMA
     * operación: no existe ventana con contraseña nueva y sesiones viejas
     * vivas. Con un fallo la cuenta queda intacta y el enlace quemado (D3).
     *
     * C1 (pin contra Mongo real): dentro de un pipeline un string que empieza
     * con `$` es una RUTA DE CAMPO, y todo hash bcrypt empieza con `$2b$` —
     * tal como estaba, el campo quedaba vacío y la cuenta quedaba
     * irrecuperable. `$literal` entrega el string tal cual, sin interpretar.
     * El resultado se reporta al puerto: matchear cero cuentas no es un reset
     * (C4), y el caso de uso responde el mismo INVALID_TOKEN.
     */
    async resetPassword(email: string, passwordHash: string): Promise<boolean> {
      const result = await UserModel.updateOne({ email }, [
        {
          $set: {
            passwordHash: { $literal: passwordHash },
            failedLoginAttempts: null,
            lockedUntil: null,
            sessionVersion: { $add: [{ $ifNull: ['$sessionVersion', 0] }, 1] },
          },
        },
      ]);
      return result.matchedCount > 0;
    },
  };
}
