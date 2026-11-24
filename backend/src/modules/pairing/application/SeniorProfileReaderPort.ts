/**
 * HU-008 / D4 — la propiedad del perfil se resuelve con la única fuente de
 * verdad de vínculos (el slice seniors). Este puerto es la parte de
 * `SeniorRepositoryPort` que la emisión necesita; el adaptador Mongoose de
 * seniors lo satisface tal cual y `server.ts` inyecta su misma instancia.
 */
import type { LinkStatus } from '../../seniors/domain/seniorProfile.ts';

/** Lo que la emisión necesita de un perfil. */
export interface PairingSeniorProfile {
  readonly id: string;
  readonly fullName: string;
  /**
   * `null` es el documento anterior a HU-005, creado por el canje: se cuenta
   * como VINCULADO (S18). El adaptador de seniors normaliza los demás casos.
   */
  readonly linkStatus: LinkStatus | null;
  readonly createdAt: Date;
}

export interface SeniorProfileReaderPort {
  /** Resuelve sólo perfiles SENIOR con vínculo activo; `null` en el resto. */
  findSeniorForCaregiver(
    seniorId: string,
    caregiverId: string,
  ): Promise<PairingSeniorProfile | null>;
}

/**
 * HU-009/D11 — lo que el canje necesita del perfil: los campos de la respuesta
 * S13 (`email`, `phone`, `emailVerifiedAt`, `timezone`) más la `sessionVersion`
 * para los claims de D10. Es la MISMA regla de propiedad que la emisión (D4):
 * sólo perfiles SENIOR con vínculo activo con el dueño del token; lo ajeno,
 * inexistente y las cuentas CAREGIVER devuelven `null` y el caso de uso
 * responde el 409 genérico de un token consumido (S17), para no confirmar el id.
 */
export interface RedeemSeniorProfile {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  /** El `null` del documento legacy cuenta como vinculado (S18 de HU-008). */
  readonly linkStatus: LinkStatus | null;
  readonly emailVerifiedAt: Date | null;
  readonly phone: string | null;
  readonly timezone: string;
  readonly sessionVersion: number | null;
  readonly createdAt: Date;
}

export interface RedeemProfileReaderPort {
  findRedeemSeniorForCaregiver(
    seniorId: string,
    caregiverId: string,
  ): Promise<RedeemSeniorProfile | null>;
}
