/**
 * HU-008 — puerto de persistencia del token de vinculación. Colección propia
 * (D6): otros comandos la canjean, la emisión la invalida y la crea.
 */
/** Lo que la emisión escribe: nada del token en claro, sólo el sha256 (S5/S16). */
export interface PairingTokenWrite {
  readonly seniorId: string;
  readonly caregiverId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

/** Un token tal como la base lo recuerda: el hash es la única huella (S5). */
export interface PairingTokenRecord {
  readonly id: string;
  readonly seniorId: string;
  readonly caregiverId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  /** "canjeado": lo fija HU-009 con la escritura condicional de un solo uso. */
  readonly usedAt: Date | null;
  /** "reemplazado": lo fija la emisión. Hecho distinto de `usedAt` (S15). */
  readonly invalidatedAt: Date | null;
  readonly createdAt: Date;
}

export interface PairingTokenRepositoryPort {
  /**
   * S15/S7: marca TODOS los tokens anteriores no usados del perfil con
   * `invalidatedAt` ANTES de crear el nuevo. Sólo toca `usedAt: null` e
   * `invalidatedAt: null` — nunca mezcla "canjeado" con "reemplazado" — y
   * devuelve cuántos quedaron marcados.
   */
  invalidateUnusedForSenior(seniorId: string, invalidatedAt: Date): Promise<number>;

  /**
   * S15: alta del token nuevo. El orden del caso de uso garantiza que los
   * anteriores ya quedaron inválidos: si esta escritura falla, el perfil
   * queda sin QR vivo (falla cerrado) y el familiar pide otro.
   */
  create(token: PairingTokenWrite): Promise<PairingTokenRecord>;
}
