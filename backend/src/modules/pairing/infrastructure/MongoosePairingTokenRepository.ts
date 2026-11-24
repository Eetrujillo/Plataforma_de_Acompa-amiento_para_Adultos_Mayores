import { PairingTokenModel } from '../../../shared/models/PairingToken.ts';
import type {
  PairingTokenRecord,
  PairingTokenRepositoryPort,
  PairingTokenWrite,
} from '../application/PairingTokenRepositoryPort.ts';

interface PersistedToken {
  _id: { toString(): string };
  seniorId: { toString(): string };
  caregiverId: { toString(): string };
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  invalidatedAt: Date | null;
  createdAt: Date;
}

function mapToken(doc: PersistedToken): PairingTokenRecord {
  return {
    id: doc._id.toString(),
    seniorId: doc.seniorId.toString(),
    caregiverId: doc.caregiverId.toString(),
    tokenHash: doc.tokenHash,
    expiresAt: doc.expiresAt,
    usedAt: doc.usedAt ?? null,
    invalidatedAt: doc.invalidatedAt ?? null,
    createdAt: doc.createdAt,
  };
}

/**
 * Adaptador Mongoose del slice pairing (colección `pairing_tokens`, D6).
 * La invalidación de S15 es una sola escritura condicional: `usedAt: null` e
 * `invalidatedAt: null` al mismo tiempo, de modo que "canjeado" y
 * "reemplazado" nunca se mezclan y los ya reemplazados quedan con su historia.
 */
export function createMongoosePairingTokenRepository(): PairingTokenRepositoryPort {
  return {
    async invalidateUnusedForSenior(
      seniorId: string,
      invalidatedAt: Date,
    ): Promise<number> {
      const result = await PairingTokenModel.updateMany(
        { seniorId, usedAt: null, invalidatedAt: null },
        { $set: { invalidatedAt } },
      );
      return result.modifiedCount ?? 0;
    },

    async create(token: PairingTokenWrite): Promise<PairingTokenRecord> {
      // S5: lo único que viaja a la base es el sha256 — nunca el token en claro.
      const created = await PairingTokenModel.create({
        seniorId: token.seniorId,
        caregiverId: token.caregiverId,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
        usedAt: null,
        invalidatedAt: null,
      });
      return mapToken(created.toObject() as PersistedToken);
    },

    /**
     * HU-009/D5: lectura por hash para resolver el perfil y desambiguar el
     * fallo del reclamo (S14).
     */
    async findByTokenHash(tokenHash: string): Promise<PairingTokenRecord | null> {
      const doc = await PairingTokenModel.findOne({ tokenHash }).lean<PersistedToken>();
      return doc === null ? null : mapToken(doc);
    },

    /**
     * S8/S16: una sola escritura condicional — `usedAt: null`,
     * `invalidatedAt: null` y vigente en el mismo filtro; el ganador fija su
     * `usedAt` con la hora del servidor y el perdedor recibe `null` sin
     * escribir nada.
     */
    async claimUnused(tokenHash: string, now: Date): Promise<PairingTokenRecord | null> {
      const doc = await PairingTokenModel.findOneAndUpdate(
        { tokenHash, usedAt: null, invalidatedAt: null, expiresAt: { $gt: now } },
        { $set: { usedAt: now } },
        { new: true },
      ).lean<PersistedToken>();
      return doc === null ? null : mapToken(doc);
    },
  };
}
