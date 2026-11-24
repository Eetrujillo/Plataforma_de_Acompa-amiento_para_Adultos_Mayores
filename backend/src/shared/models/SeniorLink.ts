import { Schema, model } from 'mongoose';

/**
 * HU-005 — vínculo adulto mayor ↔ familiar. Es la ÚNICA fuente de propiedad
 * del perfil (decisión D1): un adulto mayor admite N vínculos activos con
 * permisos equivalentes, y agregar uno no toca los existentes.
 *
 * El índice único compuesto evita el estado duplicado que un `deleteMany` +
 * `create` dejaba abierto en HU-004: el mismo familiar no puede quedar dos
 * veces vinculado al mismo adulto mayor.
 */
const seniorLinkSchema = new Schema(
  {
    seniorId: { type: Schema.Types.ObjectId, required: true },
    caregiverId: { type: Schema.Types.ObjectId, required: true },
    /** Informativo: no cambia permisos (S2). */
    role: { type: String, required: true, enum: ['OWNER', 'FAMILY'] },
    /** Solo un vínculo activo autoriza; revocar desactiva, nunca borra (S3). */
    status: { type: String, required: true, default: 'ACTIVE', enum: ['ACTIVE', 'REVOKED'] },
    /** Quién agregó el vínculo; `null` en el alta del panel. */
    invitedBy: { type: Schema.Types.ObjectId, default: null },
    /** Fecha del vínculo, explícita: el dominio decide el instante del alta. */
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { collection: 'seniorlinks' },
);

seniorLinkSchema.index({ seniorId: 1, caregiverId: 1 }, { unique: true });
// La consulta de la lista: todos los vínculos activos de un familiar.
seniorLinkSchema.index({ caregiverId: 1, status: 1 });

export const SeniorLinkModel = model('SeniorLink', seniorLinkSchema);
