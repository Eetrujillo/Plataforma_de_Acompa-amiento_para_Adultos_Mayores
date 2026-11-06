'use strict';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCK_MINUTES = 15;

const LOCKOUT_MESSAGE =
  'Bloqueamos tu cuenta por demasiados intentos fallidos. Esperá unos minutos antes de volver a intentar.';

/** Estado en el que queda un usuario sin intentos fallidos pendientes. */
const CLEARED_LOCK_STATE = Object.freeze({ failedLoginAttempts: 0, lockedUntil: null });

/**
 * Reglas del bloqueo temporal por intentos fallidos.
 *
 * Son funciones puras y sin reloj propio: el caso de uso les pasa el instante actual,
 * porque el vencimiento del bloqueo es una regla de negocio y tiene que poder probarse
 * sin dormir un test.
 *
 * `failedLoginAttempts` y `lockedUntil` son nullable en el documento `User` (los
 * documentos que ya existen en Mongo no tienen esos campos), así que un `null` se lee
 * como "cero intentos" y "sin bloqueo".
 */
function failedAttemptsOf(user) {
  const attempts = user?.failedLoginAttempts;
  return Number.isInteger(attempts) && attempts > 0 ? attempts : 0;
}

function lockedUntilOf(user) {
  const until = user?.lockedUntil;
  return until ? new Date(until) : null;
}

function isLocked(user, now) {
  const until = lockedUntilOf(user);
  return until !== null && until.getTime() > now;
}

function remainingLockSeconds(user, now) {
  const until = lockedUntilOf(user);

  if (until === null || until.getTime() <= now) {
    return 0;
  }

  return Math.max(1, Math.ceil((until.getTime() - now) / 1000));
}

/**
 * Cuenta un fallo más y decide si este fallo es el que bloquea.
 *
 * El intento que alcanza el umbral es el que bloquea: no tiene sentido decirle al
 * usuario "credenciales inválidas" cuando la cuenta acaba de quedar bloqueada.
 */
function nextFailureState({ attempts, now, policy }) {
  const nextAttempts = failedAttemptsOf({ failedLoginAttempts: attempts }) + 1;

  if (nextAttempts >= policy.maxAttempts) {
    return {
      attempts: nextAttempts,
      locked: true,
      lockedUntil: new Date(now + policy.lockMinutes * 60 * 1000)
    };
  }

  return { attempts: nextAttempts, locked: false, lockedUntil: null };
}

/**
 * Resuelve la política desde la config, cayendo a los valores del criterio de
 * aceptación (5 intentos, 15 minutos) si falta o llega mal.
 */
function resolvePolicy(config) {
  const lockout = config?.lockout ?? {};

  return {
    maxAttempts:
      Number.isInteger(lockout.maxAttempts) && lockout.maxAttempts > 0
        ? lockout.maxAttempts
        : DEFAULT_MAX_ATTEMPTS,
    lockMinutes:
      Number.isInteger(lockout.lockMinutes) && lockout.lockMinutes > 0
        ? lockout.lockMinutes
        : DEFAULT_LOCK_MINUTES
  };
}

module.exports = {
  LOCKOUT_MESSAGE,
  CLEARED_LOCK_STATE,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_LOCK_MINUTES,
  failedAttemptsOf,
  isLocked,
  remainingLockSeconds,
  nextFailureState,
  resolvePolicy
};
