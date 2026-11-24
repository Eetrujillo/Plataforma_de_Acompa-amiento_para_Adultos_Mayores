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
      // forma explícita para que ninguna otra consulta los traiga por descuido.
      const doc = await UserModel.findOne({ verificationTokenHash: tokenHash })
        .select(
          'fullName emailVerifiedAt verificationTokenHash verificationTokenExpiresAt',
        )
        .lean<PersistedTokenDoc>();
      if (doc === null) return null;
      return {
        id: doc._id.toString(),
        email: doc.email,
        fullName: doc.fullName,
        tokenHash: doc.verificationTokenHash ?? '',
        expiresAt: doc.verificationTokenExpiresAt ?? null,
        emailVerifiedAt: doc.emailVerifiedAt ?? null,
      };
    },

    async markEmailVerified(email: string, verifiedAt: Date): Promise<StoredUser> {
      await UserModel.updateOne(
        { email },
        {
          emailVerifiedAt: verifiedAt,
          verificationTokenHash: null,
          verificationTokenExpiresAt: null,
        },
      );
      const doc = await UserModel.findOne({ email }).lean<PersistedUser>();
      if (doc === null) throw new Error('markEmailVerified: la cuenta no existe');
      return toStored(doc);
    },
  };
}
