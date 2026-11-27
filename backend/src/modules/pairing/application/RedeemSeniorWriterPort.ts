/**
 * HU-009 / D7 — puerto del escritor del VÍNCULO del canje. Un solo deber sobre
 * el documento `User` del adulto mayor: la transición `PENDING → LINKED` con la
 * evidencia de la Ley 1581 (D4) en la MISMA escritura condicional — o el perfil
 * queda vinculado con evidencia, o no queda nada (nunca un vínculo sin
 * consentimiento).
 *
 * El bloqueo por perfil de D8 NO vive acá: tiene su propio puerto
 * (`PairingLockoutPort`), porque la emisión del QR lo necesita sin ser parte del
 * canje (advisory `R4-2`).
 */
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
}
