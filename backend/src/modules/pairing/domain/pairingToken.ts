/**
 * HU-008 — dominio del token de vinculación (skills/pairing-generator): el
 * token ES la credencial y viaja sólo dentro del QR. Reglas puras, sin E/S:
 * generación, forma, hash, payload del QR y la constante del TTL.
 */
import { createHash, randomBytes } from 'node:crypto';

/**
 * S14/D7: 24 horas por defecto, configurable con `PAIRING_TTL_MINUTES`. Esta
 * constante es EL default; la config (`env.ts`) es su única otra fuente. Los
 * casos de uso no la duplican: el TTL les llega por dependencia.
 */
export const PAIRING_TOKEN_TTL_MINUTES = 1440;

/** S16: 32 bytes de azar criptográfico en base64url sin relleno = 43 caracteres. */
export const PAIRING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** S16: token opaco de 256 bits. Se canjea por QR (HU-009); nunca se tipea ni se muestra. */
export function generatePairingToken(): string {
  return randomBytes(32).toString('base64url');
}

/** S16: se rechaza cualquier otra cosa ANTES de hashear (canje, HU-009). */
export function isPairingTokenWellFormed(token: unknown): boolean {
  return typeof token === 'string' && PAIRING_TOKEN_PATTERN.test(token);
}

/**
 * S5/S16: a la base llega sólo `sha256(token)` en hex — quien lea la colección
 * no puede reconstruir un QR válido. Duplicado a propósito del `createHash` de
 * auth (D3): acoplar dos slices por un hash es peor que repetir 3 líneas.
 */
export function hashPairingToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * S19/qr-adapter §1: el sobre exacto del QR — tipo y token, nada más. No es
 * una URL, no lleva datos del adulto mayor; el `type` permite a la app móvil
 * rechazar un QR ajeno antes de usar el valor.
 */
export function buildPairingQrPayload(token: string): string {
  return JSON.stringify({ type: 'senior-pairing', token });
}

/**
 * HU-009 — los cuatro estados que el canje distingue (D5). El `usedAt`
 * («canjeado») manda sobre los otros dos: es el 409 genérico de S14; el
 * `invalidatedAt` («reemplazado») y el vencimiento comparten el 400 genérico.
 * Regla pura, sin E/S, con el reloj como parámetro (HU-008/T1).
 */
export type PairingTokenState = 'REDEEMABLE' | 'EXPIRED' | 'INVALIDATED' | 'USED';

/** Lo que la persistencia recuerda del token: la huella y sus hechos. */
export interface PairingTokenStateInput {
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly invalidatedAt: Date | null;
}

/**
 * D5: la clasificación que desambigua el fallo del reclamo — sin documento →
 * 404; `USED` → 409; `INVALIDATED` y `EXPIRED` → el mismo 400 genérico.
 * El vencimiento cierra en el instante exacto: coincide con el filtro
 * `expiresAt > now` de la escritura condicional.
 */
export function evaluatePairingTokenState(
  token: PairingTokenStateInput,
  now: Date,
): PairingTokenState {
  if (token.usedAt !== null) return 'USED';
  if (token.invalidatedAt !== null) return 'INVALIDATED';
  if (token.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  return 'REDEEMABLE';
}
