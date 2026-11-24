import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  clearedLockoutState,
  evaluateLockout,
  lockoutRetrySeconds,
  registerFailure,
} from '../src/modules/auth/domain/loginLockout.ts';
import type { LockoutConfig, LockoutState } from '../src/modules/auth/domain/loginLockout.ts';
import { sessionClaims } from '../src/modules/auth/domain/sessionClaims.ts';
import { LoginIpThrottle } from '../src/modules/auth/application/LoginIpThrottle.ts';
import { FIXED_NOW } from './support/registerHarness.ts';

const NOW = FIXED_NOW;

const CONFIG: LockoutConfig = { maxAttempts: 5, lockMs: 15 * 60_000 };

function state(failedLoginAttempts: number | null, lockedUntil: Date | null): LockoutState {
  return { failedLoginAttempts, lockedUntil };
}

test('registerFailure: los intentos 1 a 4 no bloquean y guardan la racha', () => {
  let current = state(null, null);
  for (let i = 1; i <= 4; i += 1) {
    current = registerFailure(current, NOW, CONFIG);
    assert.equal(current.failedLoginAttempts, i, `fallo ${i}`);
    assert.equal(current.lockedUntil, null, `fallo ${i} no debe bloquear`);
  }
});

test('registerFailure: el 5.º fallo fija lockedUntil 15 minutos desde el reloj del servidor', () => {
  let current = state(null, null);
  for (let i = 1; i <= 4; i += 1) current = registerFailure(current, NOW, CONFIG);
  const fifth = registerFailure(current, NOW, CONFIG);
  assert.equal(fifth.failedLoginAttempts, 5);
  assert.equal(fifth.lockedUntil?.getTime(), NOW.getTime() + 15 * 60_000);
});

test('lockoutRetrySeconds: al bloquear faltan 900 segundos (LOCKOUT_MINUTES=15)', () => {
  assert.equal(lockoutRetrySeconds(CONFIG), 900);
});

test('evaluateLockout: sin lockedUntil la cuenta no está bloqueada', () => {
  assert.deepEqual(evaluateLockout(state(0, null), NOW), { locked: false });
});

test('evaluateLockout: bloqueada hasta el futuro reporta los segundos que faltan', () => {
  const lockedUntil = new Date(NOW.getTime() + 900_000);
  const verdict = evaluateLockout(state(5, lockedUntil), NOW);
  assert.equal(verdict.locked, true);
  assert.ok(verdict.locked && verdict.retryAfterSeconds === 900);
});

test('evaluateLockout: el reloj decide el vencimiento — a partir del instante exacto se libera', () => {
  const lockedUntil = new Date(NOW.getTime() + 900_000);
  assert.equal(evaluateLockout(state(5, lockedUntil), lockedUntil).locked, false);
  assert.equal(evaluateLockout(state(5, lockedUntil), new Date(lockedUntil.getTime() - 1)).locked, true);
});

test('evaluateLockout: los segundos que faltan se miden contra el reloj inyectado', () => {
  const lockedUntil = new Date(NOW.getTime() + 900_000);
  const verdict = evaluateLockout(state(5, lockedUntil), new Date(NOW.getTime() + 870_000));
  assert.ok(verdict.locked && verdict.retryAfterSeconds === 30);
});

test('registerFailure: un bloqueo vencido reinicia la racha (fallos consecutivos)', () => {
  const expired = new Date(NOW.getTime() - 1000);
  const next = registerFailure(state(5, expired), NOW, CONFIG);
  assert.equal(next.failedLoginAttempts, 1);
  assert.equal(next.lockedUntil, null);
});

test('registerFailure: sin racha previa (null) la primera cuenta como 1', () => {
  const next = registerFailure(state(null, null), NOW, CONFIG);
  assert.equal(next.failedLoginAttempts, 1);
  assert.equal(next.lockedUntil, null);
});

test('clearedLockoutState: un login correcto deja el contador en 0 y lockedUntil en null', () => {
  assert.deepEqual(clearedLockoutState(), { failedLoginAttempts: 0, lockedUntil: null });
});

test('sessionClaims: sv con null se lee como 0 y no hay ningún claim de más', () => {
  const claims = sessionClaims({
    id: '665fabc123',
    email: 'cuidador@example.com',
    role: 'CAREGIVER',
    sessionVersion: null,
  });
  assert.deepEqual(claims, {
    sub: '665fabc123',
    email: 'cuidador@example.com',
    role: 'CAREGIVER',
    sv: 0,
  });
});

test('sessionClaims: sv numérico se copia tal cual', () => {
  const claims = sessionClaims({
    id: 'u1',
    email: 'a@b.com',
    role: 'SENIOR',
    sessionVersion: 3,
  });
  assert.equal(claims.sv, 3);
});

const IP_WINDOW: { max: number; windowMs: number } = { max: 3, windowMs: 60_000 };

test('LoginIpThrottle: los primeros N chequeos pasan y el (N+1)-ésimo reporta 429 con retryAfterSeconds', () => {
  const throttle = new LoginIpThrottle({ now: () => NOW }, IP_WINDOW);
  throttle.recordFailure('127.0.0.1');
  throttle.recordFailure('127.0.0.1');
  assert.deepEqual(throttle.check('127.0.0.1'), { allowed: true });
  throttle.recordFailure('127.0.0.1');
  const blocked = throttle.check('127.0.0.1');
  assert.equal(blocked.allowed, false);
  assert.ok(!blocked.allowed && blocked.retryAfterSeconds === 60);
});

test('LoginIpThrottle: otro IP no comparte contador, para que nadie bloquee a otro', () => {
  const throttle = new LoginIpThrottle({ now: () => NOW }, IP_WINDOW);
  throttle.recordFailure('203.0.113.9');
  throttle.recordFailure('203.0.113.9');
  throttle.recordFailure('203.0.113.9');
  assert.deepEqual(throttle.check('198.51.100.77'), { allowed: true });
  assert.ok(!throttle.check('203.0.113.9').allowed);
});

test('LoginIpThrottle: ventana vencida vuelve a permitir (reloj inyectado, sin sleep)', () => {
  let now = NOW.getTime();
  const throttle = new LoginIpThrottle({ now: () => new Date(now) }, IP_WINDOW);
  throttle.recordFailure('127.0.0.1');
  throttle.recordFailure('127.0.0.1');
  throttle.recordFailure('127.0.0.1');
  assert.ok(!throttle.check('127.0.0.1').allowed);
  now += 60_001;
  assert.deepEqual(throttle.check('127.0.0.1'), { allowed: true });
});

test('LoginIpThrottle: el chequeo bloqueado no registra — insistir no alarga la ventana', () => {
  let now = NOW.getTime();
  const throttle = new LoginIpThrottle({ now: () => new Date(now) }, { max: 1, windowMs: 60_000 });
  throttle.recordFailure('127.0.0.1');
  assert.ok(!throttle.check('127.0.0.1').allowed);
  // Pasada la ventana, el chequeo vuelve a permitir; si `check` registrara el
  // intento, la primera llamada bloquearía a la segunda.
  now += 60_001;
  assert.deepEqual(throttle.check('127.0.0.1'), { allowed: true });
  assert.deepEqual(throttle.check('127.0.0.1'), { allowed: true });
});

test('LoginIpThrottle: la clave se recorta y el tope de claves poda las más viejas', () => {
  const throttle = new LoginIpThrottle({ now: () => NOW }, { max: 1, windowMs: 60_000 }, 2);
  throttle.recordFailure(' 127.0.0.1 ');
  throttle.recordFailure('10.0.0.1');
  throttle.recordFailure('10.0.0.2'); // tercera clave con tope 2: la más vieja se descarta
  assert.ok(throttle.check('127.0.0.1').allowed, 'la primera clave cayó por tope de memoria');
  assert.ok(!throttle.check('10.0.0.1').allowed);
  assert.ok(!throttle.check('10.0.0.2').allowed);

  // El recorte de la clave hace que la misma IP cuente en una sola entrada.
  const trimming = new LoginIpThrottle({ now: () => NOW }, { max: 1, windowMs: 60_000 });
  trimming.recordFailure(' 203.0.113.9 ');
  assert.ok(!trimming.check('203.0.113.9').allowed, 'la clave recortada comparte contador');
});
