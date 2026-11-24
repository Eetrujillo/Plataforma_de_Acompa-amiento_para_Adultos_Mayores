import { UserModel } from '../../../shared/models/User.ts';
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

/** Adaptador Mongoose del puerto UserRepository (MongoDB 7 vía MONGO_URL). */
export function createMongooseUserRepository(): UserRepositoryPort {
  return {
    async findByEmail(email: string): Promise<StoredUser | null> {
      const doc = await UserModel.findOne({ email }).lean();
      return doc === null ? null : toStored(doc);
    },
    async save(user: UserEntity): Promise<StoredUser> {
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
    },
  };
}
