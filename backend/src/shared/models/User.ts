import { Schema, model } from 'mongoose';

/** Ficha médica del adulto mayor: subdocumento del perfil (HU-007). */
const emergencyContactSchema = new Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
  },
  { _id: false },
);

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
    // HU-009: bloqueo del canje del QR. Con la misma forma del bloqueo de
    // login (HU-003, D8): contador y fecha sobre el propio documento, nullable
    // a propósito — sin intentos fallidos o sin bloqueo activo queda en null.
    redeemFailedAttempts: { type: Number, default: null },
    redeemLockedUntil: { type: Date, default: null },
    // HU-005/HU-007: el perfil senior. No hay `caregiverId` ni `pinHash`: la
    // propiedad vive en la colección `seniorlinks` (D1) y el PIN se retiró del
    // alcance (L3 del backlog). `linkStatus` solo pasa a LINKED al canjear el QR.
    timezone: { type: String, default: 'America/Bogota' },
    linkStatus: { type: String, default: 'PENDING', enum: ['PENDING', 'LINKED'] },
    bloodType: { type: String, default: null },
    allergies: { type: [String], default: [] },
    conditions: { type: [String], default: [] },
    medications: { type: [String], default: [] },
    emergencyContact: { type: emergencyContactSchema, default: null },
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
