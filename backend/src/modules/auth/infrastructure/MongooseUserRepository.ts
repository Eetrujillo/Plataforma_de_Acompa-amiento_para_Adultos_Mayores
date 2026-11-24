import { UserModel } from '../../../shared/models/User.ts';
import { DuplicateEmailError } from '../application/RegisterCaregiver.ts';
import type { StoredUser, UserRepositoryPort } from '../application/RegisterCaregiver.ts';
import type { UserEntity, UserRole } from '../domain/User.ts';
import type {
  VerificationStorePort,
  VerificationTokenTarget,
} from '../application/RequestEmailVerification.ts';

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
export function createMongooseUserRepository(): UserRepositoryPort & VerificationStorePort {
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
        { email, verificationTokenHash: tokenHash, emailVerifiedAt: null },
        {
          emailVerifiedAt: verifiedAt,
          verificationTokenHash: null,
          verificationTokenExpiresAt: null,
        },
        { new: true },
      ).lean<PersistedUser>();
      return doc === null ? null : toStored(doc);
    },
  };
}
