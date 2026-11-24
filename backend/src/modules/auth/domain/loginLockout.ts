/**
 * Reglas puras del bloqueo por intentos fallidos (HU-003, S3/S12/S13). El
 * estado vive en el documento `User` — persistido, nunca en memoria (skill
 * jwt-security regla 3) — y el reloj entra como parámetro para poder probar el
 * vencimiento sin dormir el test (skill rate-limiting regla 4).
 */

export interface LockoutConfig {
  /** Intentos fallidos consecutivos que disparan el bloqueo (LOCKOUT_MAX_ATTEMPTS). */
  maxAttempts: number;
  /** Duración del bloqueo en milisegundos (LOCKOUT_MINUTES). */
  lockMs: number;
}

/** Racha y bloqueo tal como están guardados en el usuario (null = sin historial). */
export interface LockoutState {
  failedLoginAttempts: number | null;
  lockedUntil: Date | null;
}

/** Estado nuevo tras un fallo registrado: el adaptador lo persiste atómicamente. */
export interface NextLockoutState {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

export type LockoutVerdict = { locked: false } | { locked: true; retryAfterSeconds: number };

function retryAfterSecondsUntil(lockedUntil: Date, now: Date): number {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000));
}

/**
 * Veredicto con el reloj del servidor: un `lockedUntil` pasado se considera
 * vencido (S3, "vence por reloj del servidor"); no hay desbloqueo manual.
 */
export function evaluateLockout(state: LockoutState, now: Date): LockoutVerdict {
  const lockedUntil = state.lockedUntil;
  if (lockedUntil === null) return { locked: false };
  if (lockedUntil.getTime() <= now.getTime()) return { locked: false };
  return { locked: true, retryAfterSeconds: retryAfterSecondsUntil(lockedUntil, now) };
}

/** Racha vigente antes del nuevo fallo: un bloqueo ya vencido la reinicia (fallos consecutivos). */
function streakBeforeFailure(state: LockoutState, now: Date): number {
  if (state.lockedUntil !== null && state.lockedUntil.getTime() <= now.getTime()) return 0;
  return state.failedLoginAttempts ?? 0;
}

/**
 * Estado nuevo tras un fallo con la contraseña: incrementa la racha y, al
 * llegar al máximo, fija `lockedUntil` LOCKOUT_MINUTES desde el reloj del
 * servidor. El fallo que dispara el bloqueo se registra (es el último que
 * cuenta); los intentos rechazados por la cuenta ya bloqueada no se registran
 * (el caso de uso no llama acá mientras `evaluateLockout` diga `locked`).
 */
export function registerFailure(
  state: LockoutState,
  now: Date,
  config: LockoutConfig,
): NextLockoutState {
  const attemptsAfterFailure = streakBeforeFailure(state, now) + 1;
  if (attemptsAfterFailure >= config.maxAttempts) {
    return {
      failedLoginAttempts: attemptsAfterFailure,
      lockedUntil: new Date(now.getTime() + config.lockMs),
    };
  }
  return { failedLoginAttempts: attemptsAfterFailure, lockedUntil: null };
}

/** Segundos que faltan al dispararse el bloqueo (S13: 900 con 15 minutos). */
export function lockoutRetrySeconds(config: LockoutConfig): number {
  return Math.max(1, Math.ceil(config.lockMs / 1000));
}

/** Un login correcto limpia la racha por completo (S5, skill jwt-security regla 5). */
export function clearedLockoutState(): NextLockoutState {
  return { failedLoginAttempts: 0, lockedUntil: null };
}
