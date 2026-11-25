import type { RequestHandler, Router } from 'express';
import { GeneratePairingQr } from './application/GeneratePairingQr.ts';
import { RedeemPairingToken } from './application/RedeemPairingToken.ts';
import type { PairingQrEncoderPort } from './application/PairingQrEncoderPort.ts';
import type { PairingTokenRepositoryPort } from './application/PairingTokenRepositoryPort.ts';
import type {
  RedeemProfileReaderPort,
  SeniorProfileReaderPort,
} from './application/SeniorProfileReaderPort.ts';
import type { RedeemSeniorWriterPort } from './application/RedeemSeniorWriterPort.ts';
import type { Clock } from '../auth/application/RegisterCaregiver.ts';
import type { LoginIpLimitPort, SessionTokenPort } from '../auth/application/Login.ts';
import { LoginIpThrottle } from '../auth/application/LoginIpThrottle.ts';
import { requireRole } from '../../shared/middlewares/requireRole.ts';
import { createPairingRoutes } from './infrastructure/pairingRoutes.ts';
import type { PairingUseCases } from './infrastructure/PairingController.ts';
import { createMongoosePairingTokenRepository } from './infrastructure/MongoosePairingTokenRepository.ts';
import { createMongoosePairingSeniorReader } from './infrastructure/MongoosePairingSeniorReader.ts';
import { createMongooseRedeemSeniorWriter } from './infrastructure/MongoosePairingSeniorWriter.ts';
import { createPairingQrEncoder } from './infrastructure/QrGenerator.ts';
import { PAIRING_TOKEN_TTL_MINUTES } from './domain/pairingToken.ts';

export { createMongoosePairingTokenRepository };
export { createMongoosePairingSeniorReader };
export { createMongooseRedeemSeniorWriter };
export { createPairingQrEncoder };
export { GeneratePairingQr } from './application/GeneratePairingQr.ts';
export type { PairingQrResult } from './application/GeneratePairingQr.ts';
export { RedeemPairingToken } from './application/RedeemPairingToken.ts';
export type {
  RedeemPairingTokenCommand,
  RedeemPairingTokenResult,
  RedeemResponseSenior,
} from './application/RedeemPairingToken.ts';
export type { PairingTokenRepositoryPort } from './application/PairingTokenRepositoryPort.ts';
export type {
  RedeemProfileReaderPort,
  RedeemSeniorProfile,
} from './application/SeniorProfileReaderPort.ts';
export type {
  RedeemSeniorWriterPort,
  SeniorConsentWrite,
} from './application/RedeemSeniorWriterPort.ts';
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

  // ─── HU-009: canje ──────────────────────────────────────────────────────

  /**
   * Lector del canje (D6/D11). En producción es la MISMA instancia de
   * `pairingSeniorReader`, que implementa los dos puertos; en tests pueden ser
   * dobles distintos porque la emisión y el canje leen distinto.
   */
  redeemProfileReader: RedeemProfileReaderPort;
  /**
   * Escritor del vínculo y del bloqueo por perfil (D7/D8), mongoose o doble.
   * D14.1: la emisión lo comparte — al emitir un QR nuevo reinicia la racha y
   * el bloqueo de canje del perfil con el mismo `clearRedeemFailures`.
   */
  redeemSeniorWriter: RedeemSeniorWriterPort;
  /** `TERMS_VERSION` de la config (D4): la evidencia del consentimiento. */
  termsVersion: string;
  /** `REDEEM_MAX_ATTEMPTS` (D8, default 5): 5 fallos bloquean el perfil. */
  redeemMaxAttempts: number;
  /** `REDEEM_LOCKOUT_MINUTES` (D8, default 15). */
  redeemLockoutMinutes: number;
  /** `REDEEM_IP_MAX_ATTEMPTS` (D9, default 20). */
  redeemIpMaxAttempts: number;
  /** `REDEEM_IP_WINDOW_MINUTES` (D9, default 15). */
  redeemIpWindowMinutes: number;
  /** D15.3: ventana del replay de recuperación (REDEEM_RECOVERY_MINUTES, default 15); opcional. */
  redeemRecoveryMinutes?: number;
  /**
   * Límite por IP del canje (D9, instancia propia). Opcional para que un test
   * inyecte el suyo: si falta, el montaje construye el in-memory de auth con
   * la config de arriba (mismo mecanismo que `LoginIpThrottle`).
   */
  redeemIpThrottle?: LoginIpLimitPort;
}

/**
 * Puertos del canje que la composición arma fuera de las dependencias de
 * datos: el puerto de sesión llega armado porque el único firmante es el
 * módulo auth (D10) — `buildApp` lo crea con `buildSessionTokenPort`.
 */
export interface PairingRedeemComposition {
  /** D10: la firma de la sesión la hace el módulo auth; nadie firma a mano. */
  sessionToken: SessionTokenPort;
}

/**
 * Punto de montaje del módulo pairing: compone los casos de uso y devuelve el
 * router. El guard de sesión llega armado (lo comparte con el resto de los
 * routers); el de rol es propio del slice: `requireRole('CAREGIVER')` aplica en
 * la emisión (S10). El canje es público (S11) y no lleva guards.
 */
export function buildPairingRouter(
  deps: PairingDependencies & { requireSession: RequestHandler },
  composition: PairingRedeemComposition,
): Router {
  const clock: Clock = { now: deps.clock };
  const useCases: PairingUseCases = {
    generatePairingQr: new GeneratePairingQr({
      seniorReader: deps.pairingSeniorReader,
      pairingTokenRepository: deps.pairingTokenRepository,
      qrEncoder: deps.qrEncoder,
      // D14.1: la emisión comparte el escritor del canje — el MISMO que usa el
      // bloqueo por perfil — para reiniciar la racha al emitir un QR nuevo.
      seniorWriter: deps.redeemSeniorWriter,
      clock: deps.clock,
      ttlMinutes: deps.pairingTtlMinutes ?? PAIRING_TOKEN_TTL_MINUTES,
    }),
    redeemPairingToken: new RedeemPairingToken({
      tokenRepository: deps.pairingTokenRepository,
      seniorReader: deps.redeemProfileReader,
      seniorWriter: deps.redeemSeniorWriter,
      sessionToken: composition.sessionToken,
      ipThrottle:
        deps.redeemIpThrottle ??
        new LoginIpThrottle(clock, {
          max: deps.redeemIpMaxAttempts,
          windowMs: deps.redeemIpWindowMinutes * 60_000,
        }),
      lockout: {
        maxAttempts: deps.redeemMaxAttempts,
        lockMs: deps.redeemLockoutMinutes * 60_000,
      },
      recoveryMs: (deps.redeemRecoveryMinutes ?? 15) * 60_000,
      clock,
      termsVersion: deps.termsVersion,
    }),
  };
  return createPairingRoutes(useCases, deps.requireSession, requireRole('CAREGIVER'));
}
