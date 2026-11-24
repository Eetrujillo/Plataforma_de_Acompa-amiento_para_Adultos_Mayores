import { randomBytes } from 'node:crypto';
import { hashVerificationToken } from './EmailVerificationToken.ts';

/**
 * Token de restablecimiento de contraseña (HU-004). El valor en claro viaja
 * únicamente en el enlace del correo (S4); a la colección propia
 * `PasswordResetToken` (D1) va su SHA-256 — el mismo helper de HU-002 (D5) —
 * y el vencimiento se mide con el reloj inyectado (S2).
 */

export interface GeneratedPasswordResetToken {
  /** Valor en claro: viaja sólo dentro del enlace del correo. */
  readonly raw: string;
  /** sha256(raw) en hex: lo único que se persiste. */
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

/** Campos mínimos de la colección que la regla "sirve / no sirve" necesita. */
export interface PasswordResetTokenState {
  readonly usedAt: Date | null;
  readonly expiresAt: Date | null;
}

/** 32 bytes aleatorios en base64url: 43 caracteres, seguros en una URL (S2). */
export function generatePasswordResetToken(now: Date, ttlMinutes: number): GeneratedPasswordResetToken {
  const raw = randomBytes(32).toString('base64url');
  return {
    raw,
    tokenHash: hashVerificationToken(raw),
    expiresAt: new Date(now.getTime() + ttlMinutes * 60_000),
  };
}

/**
 * Regla "sirve / no sirve" (S5): el mismo resultado para vencido, ya usado o
 * inexistente — el caso de uso traduce cualquier `false` en el único 400
 * `INVALID_TOKEN`. Pedir un enlace nuevo quema el anterior por descarte en la
 * colección (D1/S8), así que un token pisado tampoco llega hasta acá.
 */
export function isPasswordResetTokenUsable(state: PasswordResetTokenState, now: Date): boolean {
  return (
    state.usedAt === null &&
    state.expiresAt !== null &&
    state.expiresAt.getTime() > now.getTime()
  );
}
