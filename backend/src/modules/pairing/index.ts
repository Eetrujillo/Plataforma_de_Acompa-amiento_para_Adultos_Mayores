import type { RequestHandler, Router } from 'express';
import { GeneratePairingQr } from './application/GeneratePairingQr.ts';
import type { PairingQrEncoderPort } from './application/PairingQrEncoderPort.ts';
import type { PairingTokenRepositoryPort } from './application/PairingTokenRepositoryPort.ts';
import type { SeniorProfileReaderPort } from './application/SeniorProfileReaderPort.ts';
import { requireRole } from '../../shared/middlewares/requireRole.ts';
import { createPairingRoutes } from './infrastructure/pairingRoutes.ts';
import type { PairingUseCases } from './infrastructure/PairingController.ts';
import { createMongoosePairingTokenRepository } from './infrastructure/MongoosePairingTokenRepository.ts';
import { createMongoosePairingSeniorReader } from './infrastructure/MongoosePairingSeniorReader.ts';
import { createPairingQrEncoder } from './infrastructure/QrGenerator.ts';
import { PAIRING_TOKEN_TTL_MINUTES } from './domain/pairingToken.ts';

export { createMongoosePairingTokenRepository };
export { createMongoosePairingSeniorReader };
export { createPairingQrEncoder };
export { GeneratePairingQr } from './application/GeneratePairingQr.ts';
export type { PairingQrResult } from './application/GeneratePairingQr.ts';
export type { PairingTokenRepositoryPort } from './application/PairingTokenRepositoryPort.ts';
export { PAIRING_TOKEN_TTL_MINUTES } from './domain/pairingToken.ts';

/**
 * Dependencias del slice pairing. El lector de perfiles es el puerto reducido
 * que el repositorio real de seniors satisface (D4): `server.ts` inyecta su
 * misma instancia, la única fuente de verdad de vínculos.
 */
export interface PairingDependencies {
  /**
   * Lector de perfiles del slice (D4/D12): en producción es
   * `createMongoosePairingSeniorReader(seniorRepository)`, que delega la
   * autorización en seniors y distingue el documento sin `linkStatus`. El campo
   * se llama distinto de `seniorRepository` a propósito: la composición pasa los
   * dos y el repositorio de seniors no puede ver la ausencia del campo.
   */
  pairingSeniorReader: SeniorProfileReaderPort;
  /** Colección propia de tokens (D6), adaptador mongoose o doble en tests. */
  pairingTokenRepository: PairingTokenRepositoryPort;
  /** Codificador del PNG data URL (D9). */
  qrEncoder: PairingQrEncoderPort;
  /** Reloj del servidor: fija el vencimiento del token. */
  clock: () => Date;
  /**
   * `PAIRING_TTL_MINUTES` (D7). Opcional: si falta, manda la constante del
   * dominio (S14) — el caso de uso nunca duplica ese número.
   */
  pairingTtlMinutes?: number;
}

/**
 * Punto de montaje del módulo pairing: compone el caso de uso y devuelve el
 * router. El guard de sesión llega armado (lo comparte con el resto de los
 * routers); el de rol es propio del slice: `requireRole('CAREGIVER')` aplica
 * en la emisión (S10).
 */
export function buildPairingRouter(
  deps: PairingDependencies & { requireSession: RequestHandler },
): Router {
  const useCases: PairingUseCases = {
    generatePairingQr: new GeneratePairingQr({
      seniorReader: deps.pairingSeniorReader,
      pairingTokenRepository: deps.pairingTokenRepository,
      qrEncoder: deps.qrEncoder,
      clock: deps.clock,
      ttlMinutes: deps.pairingTtlMinutes ?? PAIRING_TOKEN_TTL_MINUTES,
    }),
  };
  return createPairingRoutes(useCases, deps.requireSession, requireRole('CAREGIVER'));
}
