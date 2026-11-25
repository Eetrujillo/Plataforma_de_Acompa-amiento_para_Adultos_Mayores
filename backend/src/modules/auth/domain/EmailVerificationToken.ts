import { createHash, randomBytes } from 'node:crypto';

/**
 * Token de verificación de correo (HU-002). El valor en claro vive sólo en el
 * enlace del correo; a la persistencia va únicamente su SHA-256 (S6) y el
 * vencimiento se mide con el reloj inyectado (S1).
 */

export interface GeneratedVerificationToken {
  /** Valor en claro: viaja sólo dentro del enlace del correo. */
  readonly raw: string;
  /** sha256(raw) en hex: lo único que se persiste. */
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export interface VerificationTokenRecord {
  /** `null` cuando no hay token vigente. */
  readonly expiresAt: Date | null;
  /** `null` mientras el correo no esté confirmado. */
  readonly emailVerifiedAt: Date | null;
}

/** 32 bytes aleatorios en base64url: 43 caracteres, seguros en una URL. */
export function generateVerificationToken(now: Date, ttlHours: number): GeneratedVerificationToken {
  const raw = randomBytes(32).toString('base64url');
  return {
    raw,
    tokenHash: hashVerificationToken(raw),
    expiresAt: new Date(now.getTime() + ttlHours * 3_600_000),
  };
}

export function hashVerificationToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * Regla "sirve / no sirve" (S3): el mismo resultado para vencido, ya usado o
 * inexistente — el caso de uso traduce cualquier `false` en el único 400
 * `INVALID_TOKEN`. El reenvío invalida el anterior por sobrescritura del hash
 * (D3), así que un token pisado tampoco llega hasta acá.
 */
export function isVerificationTokenUsable(record: VerificationTokenRecord, now: Date): boolean {
  return (
    record.emailVerifiedAt === null &&
    record.expiresAt !== null &&
    record.expiresAt.getTime() > now.getTime()
  );
}
