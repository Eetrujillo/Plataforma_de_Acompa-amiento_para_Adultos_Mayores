import { toPublicSenior } from '../domain/seniorProfile.ts';
import type { PublicSenior } from '../domain/seniorProfile.ts';
import { loadAccessibleSenior } from './loadAccessibleSenior.ts';
import type { SeniorRepositoryPort } from './SeniorRepositoryPort.ts';

/**
 * S5/S10: el detalle del perfil exige vínculo activo; el ajeno, inexistente,
 * malformado o de un caregiver responde el mismo 404 (`loadAccessibleSenior`).
 */
export class GetSeniorProfile {
  private readonly seniorRepository: SeniorRepositoryPort;

  constructor(deps: { seniorRepository: SeniorRepositoryPort }) {
    this.seniorRepository = deps.seniorRepository;
  }

  async execute(command: { seniorId: string; caregiverId: string }): Promise<PublicSenior> {
    const senior = await loadAccessibleSenior(
      this.seniorRepository,
      command.seniorId,
      command.caregiverId,
    );
    // S11: la vista pública va por lista blanca del dominio.
    return toPublicSenior(senior);
  }
}
