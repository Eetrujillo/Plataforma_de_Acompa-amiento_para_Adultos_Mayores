import type {
  SeniorProfileDocument,
  SeniorProfileRecord,
} from '../domain/seniorProfile.ts';
import type { SeniorLinkRecord, SeniorLinkRole } from '../domain/seniorLink.ts';

/** Un familiar tal como lo ve el listado de vínculos del perfil (S4). */
export interface CaregiverSummary {
  readonly id: string;
  readonly fullName: string;
  readonly role: SeniorLinkRole;
  readonly linkedAt: Date;
}

/**
 * Puerto de persistencia del slice seniors. Los vínculos viven en su propia
 * colección, así que este adaptador no lo comparte el módulo de auth (D6).
 */
export interface SeniorRepositoryPort {
  /**
   * S1/S6: escribe el perfil y el vínculo de quien lo dio de alta. Si el
   * segundo write falla, el perfil queda huérfano e inerte (D4).
   */
  createSeniorProfile(
    profile: SeniorProfileDocument,
    ownerCaregiverId: string,
    linkedAt: Date,
  ): Promise<SeniorProfileRecord>;

  /** S1/S4: solo los perfiles con un vínculo activo con este familiar. */
  listSeniorsForCaregiver(caregiverId: string): Promise<SeniorProfileRecord[]>;

  /** S5/S10: el perfil si hay vínculo activo; `null` en cualquier otro caso. */
  findSeniorForCaregiver(
    seniorId: string,
    caregiverId: string,
  ): Promise<SeniorProfileRecord | null>;

  /**
   * S1/S3: idempotente para un vínculo ya existente; nunca revoca los demás.
   * Un vínculo existente que está `REVOKED` se devuelve tal cual: reactivarlo
   * es una decisión explícita de HU-012, no un efecto de "agregar" (D2).
   */
  addCaregiverLink(link: SeniorLinkRecord): Promise<SeniorLinkRecord>;

  /** S4: los N familiares del perfil, con nombre y rol. */
  listCaregiversOfSenior(seniorId: string): Promise<CaregiverSummary[]>;
}
