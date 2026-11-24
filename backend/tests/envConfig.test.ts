import { test } from 'node:test';
import assert from 'node:assert/strict';

import { globalLoginIpBucketWarning, loadEnv } from '../src/config/env.ts';

/**
 * Correcciones de la verificación independiente de HU-003 (C1 y C3):
 * - C3: `JWT_EXPIRES_IN` sin validar hacía que jsonwebtoken reventara al firmar
 *   y todo login respondiera 500. Sólo valen duraciones `\d+[smhd]` no nulas;
 *   cualquier otra cosa cae a `7d`.
 * - C1: con `TRUST_PROXY_HOPS=0` detrás de un proxy, el límite por IP del login
 *   se vuelve una sola bolsa global. El arranque avisa fuerte en producción;
 *   parar el proceso (o no) es decisión del humano que hace el deploy.
 */

test('C3: JWT_EXPIRES_IN sólo acepta ^\\d+[smhd]$; vacío, malformado o cero cae a 7d', () => {
  assert.equal(loadEnv({}).jwtExpiresIn, '7d');
  assert.equal(loadEnv({ JWT_EXPIRES_IN: '' }).jwtExpiresIn, '7d');
  assert.equal(loadEnv({ JWT_EXPIRES_IN: '   ' }).jwtExpiresIn, '7d');
  // Duraciones válidas pasan tal cual (con el valor recortado).
  assert.equal(loadEnv({ JWT_EXPIRES_IN: '2h' }).jwtExpiresIn, '2h');
  assert.equal(loadEnv({ JWT_EXPIRES_IN: '30m' }).jwtExpiresIn, '30m');
  assert.equal(loadEnv({ JWT_EXPIRES_IN: ' 2h ' }).jwtExpiresIn, '2h');
  assert.equal(loadEnv({ JWT_EXPIRES_IN: '15s' }).jwtExpiresIn, '15s');
  assert.equal(loadEnv({ JWT_EXPIRES_IN: '90d' }).jwtExpiresIn, '90d');
  // Todo lo que no sea dígitos + una unidad cae al default: la unidad
  // malformada antes hacía que cada login respondiera 500 (C3).
  for (const invalid of [
    'no-es-duracion',
    '7',
    '0d',
    '0h',
    '0m',
    '0s',
    '7days',
    '1.5h',
    '+2h',
    '-1h',
    'h',
    'm30',
    'días',
  ]) {
    assert.equal(loadEnv({ JWT_EXPIRES_IN: invalid }).jwtExpiresIn, '7d', `JWT_EXPIRES_IN=${invalid}`);
  }
});

test('C1: producción con TRUST_PROXY_HOPS=0 avisa en el arranque la bolsa global del límite por IP', () => {
  const warning = globalLoginIpBucketWarning('production', 0);
  assert.ok(warning !== null, 'producción con 0 saltos tiene que avisar');
  assert.match(warning, /TRUST_PROXY_HOPS=0/);
  // La consecuencia nombrada: todos comparten una sola bolsa y sus 20 fallos
  // (loginIpMaxAttempts por defecto) bloquean el login de todo el mundo.
  assert.match(warning, /UNA SOLA BOLSA/);
  assert.match(warning, /20 fallos/);
});

test('C1: el aviso no suena en desarrollo ni con proxies declarados', () => {
  assert.equal(globalLoginIpBucketWarning('development', 0), null);
  assert.equal(globalLoginIpBucketWarning('test', 0), null);
  assert.equal(globalLoginIpBucketWarning('production', 1), null);
  assert.equal(globalLoginIpBucketWarning('production', 2), null);
});
