import { toSeniorMedicalRecord } from '../domain/seniorProfile.ts';
import type { SeniorMedicalRecord } from '../domain/seniorProfile.ts';
import { loadAccessibleSenior } from './loadAccessibleSenior.ts';
import type { SeniorRepositoryPort } from './SeniorRepositoryPort.ts';

/**
 * S7/S11: la ficha médica es la vista sensible del perfil y exige vínculo
 * activo; se expone por una ruta propia (D3) y por la proyección del dominio,
 * nunca con campos adicionales del documento.
 */
export class GetSeniorMedicalRecord {
  private readonly seniorRepository: SeniorRepositoryPort;

  constructor(deps: { seniorRepository: SeniorRepositoryPort }) {
    this.seniorRepository = deps.seniorRepository;
  }

  async execute(command: {
    seniorId: string;
    caregiverId: string;
  }): Promise<SeniorMedicalRecord> {
    const senior = await loadAccessibleSenior(
      this.seniorRepository,
      command.seniorId,
      command.caregiverId,
    );
    return toSeniorMedicalRecord(senior);
  }
}
