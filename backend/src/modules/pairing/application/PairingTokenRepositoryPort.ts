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

  /**
   * HU-009/D5: lectura por hash para resolver el perfil ANTES del reclamo
   * (S17) y para desambiguar el fallo del reclamo (S14: 404 del desconocido,
   * 409 del usado, 400 del vencido/invalidado).
   */
  findByTokenHash(tokenHash: string): Promise<PairingTokenRecord | null>;

  /**
   * S8/S16: escritura condicional de un solo uso — un solo pedido gana la
   * carrera. Matchea `usedAt: null`, `invalidatedAt: null` y vigente, y fija
   * `usedAt` con la hora recibida; el perdedor recibe `null` sin escribir nada.
   */
  claimUnused(tokenHash: string, now: Date): Promise<PairingTokenRecord | null>;
}
