/**
 * HU-009 / D7-D8 — puerto del escritor del perfil del canje. Dos deberes sobre
 * el MISMO documento `User` del adulto mayor:
 *
 * 1. La transición `PENDING → LINKED` con la evidencia de la Ley 1581 (D4) en
 *    la MISMA escritura condicional: o el perfil queda vinculado con
 *    evidencia, o no queda nada (nunca un vínculo sin consentimiento).
 * 2. El bloqueo por perfil (D8), con la forma del bloqueo de login: contador y
 *    fecha de bloqueo sobre el propio documento, contados por el adaptador en
 *    una escritura atómica — no en memoria.
 */
import type { LockoutState, NextLockoutState } from '../../auth/domain/loginLockout.ts';
import type { RegisterFailedLoginConfig } from '../../auth/application/Login.ts';

/** La evidencia que el servidor arma (D4): el cliente no inventa ninguno. */
export interface SeniorConsentWrite {
  readonly seniorId: string;
  readonly acceptedTermsAt: Date;
  readonly termsVersion: string;
  /** Presente sólo cuando `evidenceIp` validó la IP del pedido. */
  readonly ipAddress?: string;
}

export interface RedeemSeniorWriterPort {
  /**
   * D7: `PENDING → LINKED` con evidencia. `false` cuando el filtro condicional
   * no matchea (ya vinculado, o el documento legacy sin `linkStatus`): el
   * filtro es lo que evita el doble vínculo aunque dos canjes ganen carreras
   * distintas. `true` tiene que implicar la evidencia escrita.
   */
  markLinkedWithConsent(write: SeniorConsentWrite): Promise<boolean>;

  /** D8: la racha y el bloqueo tal como el documento los guarda. */
  redeemLockoutState(seniorId: string): Promise<LockoutState | null>;

  /**
   * D8: incrementa la racha exactamente una vez, reiniciándola si el bloqueo
   * previo ya venció, y fija `lockedUntil` en la MISMA operación al llegar al
   * umbral. Devuelve el estado persistido; `null` si el perfil ya no existe.
   */
  registerRedeemFailure(
    seniorId: string,
    config: RegisterFailedLoginConfig,
  ): Promise<NextLockoutState | null>;

  /** S7: el canje exitoso deja la racha en 0 y `lockedUntil` en `null`. */
  clearRedeemFailures(seniorId: string): Promise<void>;
}
