import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { generatePasswordResetToken, isPasswordResetTokenUsable } from '../src/modules/auth/domain/PasswordResetToken.ts';
import { FORGOT_LIMIT_MESSAGE } from '../src/modules/auth/application/RequestPasswordReset.ts';
import { loadEnv } from '../src/config/env.ts';

const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');
const MINUTE_MS = 60_000;

test('S2: el token de reset se genera con 32 bytes aleatorios y vence a PASSWORD_RESET_TTL_MINUTES con el reloj inyectado', () => {
  const token = generatePasswordResetToken(FIXED_NOW, 60);
  assert.equal(token.raw.length, 43, '32 bytes en base64url son 43 caracteres');
  assert.match(token.raw, /^[A-Za-z0-9_-]+$/, 'seguro en una URL');
  assert.equal(token.expiresAt.getTime(), FIXED_NOW.getTime() + 60 * MINUTE_MS);

  // Un TTL distinto se respeta con el reloj inyectado, sin dormir el test.
  const short = generatePasswordResetToken(FIXED_NOW, 15);
  assert.equal(short.expiresAt.getTime(), FIXED_NOW.getTime() + 15 * MINUTE_MS);

  // Dos generaciones no repiten token (aleatoriedad observable).
  const other = generatePasswordResetToken(FIXED_NOW, 60);
  assert.notEqual(other.raw, token.raw);
});

test('S4: se genera el hash como sha256 hex del token en claro (el helper compartido de HU-002)', () => {
  const token = generatePasswordResetToken(FIXED_NOW, 60);
  const expected = createHash('sha256').update(token.raw, 'utf8').digest('hex');
  assert.equal(token.tokenHash, expected);
  assert.match(token.tokenHash, /^[0-9a-f]{64}$/);
  assert.notEqual(token.tokenHash, token.raw);
});

test('S2/S5: la regla "sirve / no sirve" del dominio: usable mientras no está usado y no venció', () => {
  const token = generatePasswordResetToken(FIXED_NOW, 60);

  // Vigente sin usar: sirve.
  assert.equal(
    isPasswordResetTokenUsable({ usedAt: null, expiresAt: token.expiresAt }, FIXED_NOW),
    true,
  );

  // Vencido: vencimiento inclusive en el borde — expiresAt > now, no >=.
  assert.equal(
    isPasswordResetTokenUsable({ usedAt: null, expiresAt: token.expiresAt }, token.expiresAt),
    false,
    'en la frontera exacta ya no sirve',
  );
  assert.equal(
    isPasswordResetTokenUsable(
      { usedAt: null, expiresAt: token.expiresAt },
      new Date(token.expiresAt.getTime() + 1),
    ),
    false,
  );

  // Ya usado: el usedAt no nulo lo quema, aunque no haya vencido.
  assert.equal(
    isPasswordResetTokenUsable(
      { usedAt: FIXED_NOW, expiresAt: token.expiresAt },
      new Date(FIXED_NOW.getTime() + 1000),
    ),
    false,
  );

  // Registro incompleto (sin token vigente): no sirve.
  assert.equal(isPasswordResetTokenUsable({ usedAt: null, expiresAt: null }, FIXED_NOW), false);
});

test('D2/L3: el 429 de forgot-password tiene su propio mensaje, distinto del de verificación', () => {
  assert.equal(FORGOT_LIMIT_MESSAGE, 'Pediste demasiados enlaces de recuperación. Esperá unos minutos antes de pedir otro.');
  assert.notEqual(
    FORGOT_LIMIT_MESSAGE,
    'Pediste demasiados enlaces de verificación. Esperá unos minutos antes de pedir otro.',
  );
});

test('config T4: PASSWORD_RESET_TTL_MINUTES usa readPositiveInt — malformado cae al default 60; el límite de forgot también', () => {
  for (const [raw, expected] of [
    ['45', 45],
    ['', 60],
    ['abc', 60],
    ['0', 60],
    ['-5', 60],
    ['7.5', 60],
    ['12abc', 60],
  ] as const) {
    const env = loadEnv({ PASSWORD_RESET_TTL_MINUTES: raw });
    assert.equal(env.passwordResetTtlMinutes, expected, `PASSWORD_RESET_TTL_MINUTES=${raw}`);
  }
  const forgot = loadEnv({ FORGOT_THROTTLE_MAX: '4', FORGOT_THROTTLE_WINDOW_MINUTES: '30' });
  assert.equal(forgot.forgotThrottleMax, 4);
  assert.equal(forgot.forgotThrottleWindowMinutes, 30);
  const defaults = loadEnv({});
  assert.equal(defaults.forgotThrottleMax, 3);
  assert.equal(defaults.forgotThrottleWindowMinutes, 60);
});
