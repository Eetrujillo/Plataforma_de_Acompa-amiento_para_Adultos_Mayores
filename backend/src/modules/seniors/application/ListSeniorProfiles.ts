import type { SeniorProfileRecord } from '../domain/seniorProfile.ts';
import type { SeniorRepositoryPort } from './SeniorRepositoryPort.ts';

/**
 * S10/S21: la lista la acota el repositorio por vínculo activo: el familiar
 * recupera los perfiles que administra, sin perfiles ajenos ni solo lectura.
 */
export class ListSeniorProfiles {
  private readonly seniorRepository: SeniorRepositoryPort;

  constructor(deps: { seniorRepository: SeniorRepositoryPort }) {
    this.seniorRepository = deps.seniorRepository;
  }

  async execute(command: { caregiverId: string }): Promise<SeniorProfileRecord[]> {
    return this.seniorRepository.listSeniorsForCaregiver(command.caregiverId);
  }
}

