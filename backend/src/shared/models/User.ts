import { Schema, model } from 'mongoose';

/**
 * Modelo User. Espeja la referencia de datos de `backend/prisma/schema.prisma`
 * (Prisma queda descartado; este modelo es la traducción a Mongoose).
 */
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    /** Solo hash bcrypt; el texto plano jamás llega a la base. */
    passwordHash: { type: String, default: null },
    fullName: { type: String, required: true },
    role: { type: String, required: true, enum: ['CAREGIVER', 'SENIOR'] },
    phone: { type: String, default: null },
    caregiverId: { type: Schema.Types.ObjectId, default: null },
    emailVerifiedAt: { type: Date, default: null },
    // HU-002: token de verificación. Sólo el SHA-256 (S6); `select: false` para
    // que ninguna consulta lo traiga por descuido. Un token vigente por cuenta:
    // el reenvío pisa el anterior (D3).
    verificationTokenHash: { type: String, default: null, select: false },
    verificationTokenExpiresAt: { type: Date, default: null, select: false },
    // HU-003: bloqueo persistido. Nullable a propósito: sin intentos fallidos o sin
    // bloqueo activo, el campo queda en null.
    failedLoginAttempts: { type: Number, default: null },
    lockedUntil: { type: Date, default: null },
    // HU-004: versión de sesión; null se lee como 0.
    sessionVersion: { type: Number, default: null },
    // HU-005: perfil senior. Un cuidador no tiene PIN ni estado de vinculación.
    pinHash: { type: String, default: null },
    timezone: { type: String, default: 'America/Bogota' },
    linkStatus: { type: String, default: 'PENDING' },
    // Ley 1581: evidencia de consentimiento, fijada por el servidor al crear la cuenta.
    acceptedTermsAt: { type: Date, default: null },
    termsVersion: { type: String, default: null },
    ipAddress: { type: String, default: null },
  },
  { timestamps: true, collection: 'users' },
);

// C4: `verify-email` es un endpoint público y busca por el hash — sin índice
// cada intento de canje escanearía la colección completa.
userSchema.index({ verificationTokenHash: 1 });

export const UserModel = model('User', userSchema);
