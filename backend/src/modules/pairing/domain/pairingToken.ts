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
