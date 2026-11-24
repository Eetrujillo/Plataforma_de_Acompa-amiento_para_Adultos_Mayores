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
