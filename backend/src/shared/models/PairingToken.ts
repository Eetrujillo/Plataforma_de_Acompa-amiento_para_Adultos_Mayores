import { Schema, model } from 'mongoose';

/**
 * Modelo PairingToken (HU-008, D6). Colección PROPIA, separada del documento
 * User: el token es una credencial, no parte del perfil. A la base sólo llega
 * el sha256 del token (S5/S16); `usedAt` significa "canjeado" (lo fija el
 * canje de HU-009 con una escritura condicional) y `invalidatedAt`,
 * "reemplazado" por una emisión posterior (S7). Son hechos distintos y se
 * guardan distinto (S15).
 */
const pairingTokenSchema = new Schema(
  {
    /** Perfil al que pertenece el QR: el token pertenece al perfil, no a la cuenta. */
    seniorId: { type: Schema.Types.ObjectId, required: true },
    /** Familiar que lo emitió (de la sesión, nunca del cuerpo). */
    caregiverId: { type: Schema.Types.ObjectId, required: true },
    /** sha256(token) en hex; índice único: el canje de HU-009 busca por él (D6). */
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    invalidatedAt: { type: Date, default: null },
  },
  // `timestamps: true` agrega createdAt/updatedAt, como en PasswordResetToken.
  { timestamps: true, collection: 'pairing_tokens' },
);

// D6: `tokenHash` único, igual que en PasswordResetToken — el canje consulta
// por el hash en la base, y que un hash se repita no tiene modelo posible.
pairingTokenSchema.index({ tokenHash: 1 }, { unique: true });

export const PairingTokenModel = model('PairingToken', pairingTokenSchema);
