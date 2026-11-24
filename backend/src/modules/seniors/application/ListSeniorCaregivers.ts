import { loadAccessibleSenior } from './loadAccessibleSenior.ts';
import type { CaregiverSummary } from './SeniorRepositoryPort.ts';
import type { SeniorRepositoryPort } from './SeniorRepositoryPort.ts';

/**
 * S4: la propiedad se chequea primero (`loadAccessibleSenior`) y el listado
 * lo arma el puerto con los roles informativos de cada vínculo (S1/S2).
 */
export class ListSeniorCaregivers {
  private readonly seniorRepository: SeniorRepositoryPort;

  constructor(deps: { seniorRepository: SeniorRepositoryPort }) {
    this.seniorRepository = deps.seniorRepository;
  }

  async execute(command: {
    seniorId: string;
    caregiverId: string;
  }): Promise<CaregiverSummary[]> {
    await loadAccessibleSenior(
      this.seniorRepository,
      command.seniorId,
      command.caregiverId,
    );
    return this.seniorRepository.listCaregiversOfSenior(command.seniorId);
  }
}
