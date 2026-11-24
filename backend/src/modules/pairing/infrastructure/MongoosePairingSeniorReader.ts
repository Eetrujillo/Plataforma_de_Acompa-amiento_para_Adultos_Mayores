/**
 * HU-008 / D4 y D12 — lector del perfil para la emisión del QR.
 *
 * La autorización es la del slice seniors: el vínculo activo es la única fuente
 * de verdad de propiedad (D4), así que este adaptador delega en su repositorio
 * en vez de repetir la consulta.
 *
 * Encima de eso resuelve una ambigüedad que el mapeo de seniors no puede ver: un
 * documento anterior a HU-007 NO guarda `linkStatus`, y el esquema lo hidrata con
 * su default ('PENDING'). Ese perfil se creó por el camino de vinculación de la
 * versión anterior, o sea que ya tiene un dispositivo: contarlo como pendiente
 * entregaría una credencial nueva sobre un estado desconocido. Por eso la
 * ausencia se consulta sobre el BSON crudo (`$exists`) y se traduce a `null`, que
 * el caso de uso responde como 409 `SENIOR_ALREADY_LINKED` (S18, falla cerrado).
 */
import { UserModel } from '../../../shared/models/User.ts';
import type { SeniorRepositoryPort } from '../../seniors/application/SeniorRepositoryPort.ts';
import type {
  PairingSeniorProfile,
  SeniorProfileReaderPort,
} from '../application/SeniorProfileReaderPort.ts';

/** Lo que el lector necesita del registro de seniors: sólo campos de lectura. */
export type SeniorProfileSourcePort = Pick<
  SeniorRepositoryPort,
  'findSeniorForCaregiver'
>;

export function createMongoosePairingSeniorReader(
  seniorRepository: SeniorProfileSourcePort,
): SeniorProfileReaderPort {
  return {
    async findSeniorForCaregiver(
      seniorId: string,
      caregiverId: string,
    ): Promise<PairingSeniorProfile | null> {
      const senior = await seniorRepository.findSeniorForCaregiver(seniorId, caregiverId);
      if (senior === null) return null;
      // El campo se pregunta por su presencia, no por su valor: el valor ya
      // viene normalizado a 'PENDING' por el default del esquema.
      const storesLinkStatus = await UserModel.exists({
        _id: senior.id,
        linkStatus: { $exists: true },
      });
      return {
        id: senior.id,
        fullName: senior.fullName,
        linkStatus: storesLinkStatus === null ? null : senior.linkStatus,
        createdAt: senior.createdAt,
      };
    },
  };
}
