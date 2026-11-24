import { UserModel } from '../../../shared/models/User.ts';
import { DuplicateEmailError } from '../application/RegisterCaregiver.ts';
import type { StoredUser, UserRepositoryPort } from '../application/RegisterCaregiver.ts';
import type { UserEntity, UserRole } from '../domain/User.ts';

interface PersistedUser {
  _id: { toString(): string };
  email: string;
  fullName: string;
  role: string;
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

/** Adaptador Mongoose del puerto UserRepository (MongoDB 7 vía MONGO_URL). */
export function createMongooseUserRepository(): UserRepositoryPort {
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
  };
}
