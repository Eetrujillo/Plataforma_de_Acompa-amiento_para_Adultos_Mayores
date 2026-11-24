import { Schema, model } from 'mongoose';

/**
 * Modelo PasswordResetToken (HU-004, D1). Colección PROPIA, separada del
 * documento User: un enlace de verificación de correo no puede cambiar la
 * contraseña. A la base sólo llega el SHA-256 del token (S4); `usedAt` en null
 * mientras el enlace no se canje (S6: el consumo es un update condicionado que
 * lo fija en la misma escritura).
 */
const passwordResetTokenSchema = new Schema(
  {
    // sha256(token) en hex; índice único: el endpoint público busca por él.
    tokenHash: { type: String, required: true },
    /** Cuenta a la que pertenece el enlace. */
    userId: { type: Schema.Types.ObjectId, required: true },
    /** Correo normalizado de la cuenta, para la escritura del reset (D4). */
    email: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  // `timestamps: true` agrega createdAt, el sexto campo de D1.
  { timestamps: true, collection: 'password_reset_tokens' },
);

// S6: el endpoint público busca por el hash — sin índice cada intento
// escanearía la colección completa. Único: el consumo no borra el documento
// (queda con usedAt) y las eliminaciones suceden al pedir un enlace nuevo (S8).
passwordResetTokenSchema.index({ tokenHash: 1 }, { unique: true });

// C2: un solo enlace vivo por cuenta — el upsert de `savePasswordResetToken`
// pisa sobre la clave del correo, y este índice único lo vuelve ATÓMICO: dos
// pedidos simultáneos jamás dejan dos enlaces vivos, una carrera pierde o pisa,
// nunca duplica.
passwordResetTokenSchema.index({ email: 1 }, { unique: true });

export const PasswordResetTokenModel = model('PasswordResetToken', passwordResetTokenSchema);
