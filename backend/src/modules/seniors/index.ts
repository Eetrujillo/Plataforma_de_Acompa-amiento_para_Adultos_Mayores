import type { RequestHandler, Router } from 'express';
import { CreateSeniorProfile } from './application/CreateSeniorProfile.ts';
import { GetSeniorMedicalRecord } from './application/GetSeniorMedicalRecord.ts';
import { GetSeniorProfile } from './application/GetSeniorProfile.ts';
import { ListSeniorCaregivers } from './application/ListSeniorCaregivers.ts';
import { ListSeniorProfiles } from './application/ListSeniorProfiles.ts';
import type { SeniorRepositoryPort } from './application/SeniorRepositoryPort.ts';
import { requireRole } from '../../shared/middlewares/requireRole.ts';
import { createSeniorRoutes } from './infrastructure/seniorRoutes.ts';
import type { SeniorsUseCases } from './infrastructure/SeniorController.ts';
import { createMongooseSeniorRepository } from './infrastructure/MongooseSeniorRepository.ts';

export type { CaregiverSummary, SeniorRepositoryPort } from './application/SeniorRepositoryPort.ts';
export type { SeniorMedicalRecord } from './domain/seniorProfile.ts';
export { createMongooseSeniorRepository };
export { requireRole } from '../../shared/middlewares/requireRole.ts';

/** Dependencias del slice seniors, como el resto de los módulos (D6). */
export interface SeniorsDependencies {
  seniorRepository: SeniorRepositoryPort;
  /** Reloj del servidor: fija el instante del vínculo OWNER (el `createdAt` del perfil lo pone el motor). */
  clock: () => Date;
}

/**
 * Punto de montaje del módulo seniors: compone los casos de uso y devuelve el
 * router. El guard de sesión llega armado (lo comparte con el resto de los
 * routers); el de rol es propio del slice (D5): `requireRole('CAREGIVER')`
 * aplica en todas las rutas (S20).
 */
export function buildSeniorsRouter(
  deps: SeniorsDependencies & { requireSession: RequestHandler },
): Router {
  const clock = { now: deps.clock };
  const useCases: SeniorsUseCases = {
    createSeniorProfile: new CreateSeniorProfile({
      seniorRepository: deps.seniorRepository,
      clock,
    }),
    listSeniorProfiles: new ListSeniorProfiles({ seniorRepository: deps.seniorRepository }),
    getSeniorProfile: new GetSeniorProfile({ seniorRepository: deps.seniorRepository }),
    getSeniorMedicalRecord: new GetSeniorMedicalRecord({
      seniorRepository: deps.seniorRepository,
    }),
    listSeniorCaregivers: new ListSeniorCaregivers({ seniorRepository: deps.seniorRepository }),
  };
  return createSeniorRoutes(useCases, deps.requireSession, requireRole('CAREGIVER'));
}
