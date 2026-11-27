/**
 * HU-009 / D8 — puerto del bloqueo del canje por perfil, con nombre propio.
 *
 * Existe por el advisory `R4-2`: la emisión del QR (HU-008/D14.1) sólo necesita
 * REINICIAR la racha del perfil, pero antes lo hacía a través del escritor del
 * vínculo (`RedeemSeniorWriterPort.clearRedeemFailures`), así que emitir
 * dependía del slice del canje para tocar un contador. Con este puerto cada caso
 * de uso declara lo que de verdad usa: el canje pide racha y fallo, la emisión
 * pide el reinicio, y ninguno de los dos conoce el otro.
 *
 * Que el contador viva en el documento `User` del adulto mayor es decisión de
 * D8 (una escritura atómica, sin colección nueva), no acoplamiento de puertos:
 * el adaptador Mongoose es el único que sabe dónde están los campos.
 */
import type { LockoutState, NextLockoutState } from '../../auth/domain/loginLockout.ts';
import type { RegisterFailedLoginConfig } from '../../auth/application/Login.ts';

export interface PairingLockoutPort {
  /** D8: la racha y el bloqueo tal como el documento los guarda. */
  redeemLockoutState(seniorId: string): Promise<LockoutState | null>;

  /**
   * D8: incrementa la racha exactamente una vez, reiniciándola si el bloqueo
   * previo ya venció, y fija `lockedUntil` en la MISMA operación al llegar al
   * umbral. Un bloqueo ya activo conserva su vencimiento (advisory
   * `R4-lock-extension-per-attempt`). Devuelve el estado persistido; `null` si
   * el perfil ya no existe.
   */
  registerRedeemFailure(
    seniorId: string,
    config: RegisterFailedLoginConfig,
  ): Promise<NextLockoutState | null>;

  /**
   * S7/D14.1: el canje exitoso deja la racha en 0 y `lockedUntil` en `null`; la
   * emisión de un QR nuevo la usa para el mismo reinicio — el escape
   * documentado del bloqueo de canje («el familiar emite otro QR»).
   */
  clearRedeemFailures(seniorId: string): Promise<void>;
}
