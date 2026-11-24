import type { UserRole } from './User.ts';

/**
 * Claims del JWT de sesión (skill jwt-security): exactamente `sub`, `role`,
 * `email` y `sv` — el payload es legible por quien tenga el token, así que no
 * lleva nombre, teléfono ni datos del adulto mayor. `iat`/`exp` los agrega la
 * librería al firmar.
 */

/** Datos mínimos de sesión que arma el helper puro reutilizable por HU-004/HU-008. */
export interface SessionUserSnapshot {
  id: string;
  email: string;
  role: UserRole;
  /** `null` se lee como 0: así un token anterior al claim suelta la sesión en el primer reset (D-fuente: docs/auth-api.md). */
  sessionVersion: number | null;
}

export interface SessionClaims {
  sub: string;
  email: string;
  role: UserRole;
  sv: number;
}

/** El único lugar donde se arma el payload de un token de sesión (D4). */
export function sessionClaims(user: SessionUserSnapshot): SessionClaims {
  return {
    sub: user.id,
    email: user.email,
    role: user.role,
    sv: user.sessionVersion ?? 0,
  };
}
