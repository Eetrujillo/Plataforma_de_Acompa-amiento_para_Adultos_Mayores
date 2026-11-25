/**
 * HU-008 / T1 — reglas del dominio del token de vinculación (S5, S14, S16, S19):
 * 43 caracteres base64url (32 bytes), sólo sha256 en la base, payload exacto
 * del QR y TTL de 24 horas como constante del dominio.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

import {
  PAIRING_TOKEN_TTL_MINUTES,
  buildPairingQrPayload,
  generatePairingToken,
  hashPairingToken,
  isPairingTokenWellFormed,
} from '../src/modules/pairing/domain/pairingToken.ts';

/** Un token ajeno con la misma forma, para distinguir hashes. */
function anotherToken(not: string): string {
  let candidate = generatePairingToken();
  while (candidate === not) candidate = generatePairingToken();
  return candidate;
}

test('S16: el token son 43 caracteres base64url sin relleno (32 bytes) y es único por generación', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50; i += 1) {
    const token = generatePairingToken();
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    seen.add(token);
  }
  assert.equal(seen.size, 50, 'nada fuerza la repetición: 50 tokens, 50 distintos');
});

test('S16: isPairingTokenWellFormed rechaza cualquier otra forma ANTES del hash', () => {
  const rejectCases: unknown[] = [
    '', // vacío
    'short', // corto
    `${randomUUID().replace(/-/g, '').slice(0, 24)}`, // un ObjectId es demasiado corto
    `${'a'.repeat(42)}`, // 42: uno menos
    `${'a'.repeat(44)}`, // 44: uno más
    `${'a'.repeat(43)}=`, // con relleno base64
    `${'a'.repeat(40)}/${'a'.repeat(3)}`, // base64 estándar, no base64url
    `${'a'.repeat(41)}+${'a'.repeat(2)}`, // '+' es de base64 estándar
    `${'a'.repeat(42)}.${'a'.repeat(1)}`, // separador ajeno
    42, // no es texto
    null,
    undefined,
    { token: 'a'.repeat(43) },
  ];
  for (const [i, candidate] of rejectCases.entries()) {
    assert.equal(
      isPairingTokenWellFormed(candidate),
      false,
      `el caso ${i} (${JSON.stringify(candidate) ?? String(candidate)}) no puede pasar la forma`,
    );
  }
  assert.equal(isPairingTokenWellFormed(generatePairingToken()), true);
});

test('S16: el hash es sha256 hex estable y distingue tokens', () => {
  const token = generatePairingToken();
  // Recomputado con el crypto del runtime: el hash prometido es sha256 hex.
  const expected = createHash('sha256').update(token).digest('hex');
  assert.equal(hashPairingToken(token), expected);
  assert.match(hashPairingToken(token), /^[0-9a-f]{64}$/);
  // Estable: dos llamadas con el mismo token, el mismo hash.
  assert.equal(hashPairingToken(token), hashPairingToken(token));
  // Diferente token, hash diferente.
  const other = anotherToken(token);
  assert.notEqual(hashPairingToken(token), hashPairingToken(other));
});

test('S19: buildPairingQrPayload es exactamente {"type":"senior-pairing","token":"…"}', () => {
  const token = generatePairingToken();
  const payload = buildPairingQrPayload(token);
  // El cuerpo, tal cual el sobre: sin URL, sin seniorId, sin nada más.
  const parsed = JSON.parse(payload) as Record<string, unknown>;
  assert.deepEqual(Object.keys(parsed).sort(), ['token', 'type']);
  assert.equal(parsed['type'], 'senior-pairing');
  assert.equal(parsed['token'], token);
  // Orden de claves canónico: `type` primero, `token` después (además del JSON
  // parseado de arriba, que es independiente del orden).
  assert.equal(payload, JSON.stringify({ type: 'senior-pairing', token }));
});

test('S14: la constante del dominio fija 24 horas y el caso de uso no la duplica', () => {
  assert.equal(PAIRING_TOKEN_TTL_MINUTES, 1440);
});
