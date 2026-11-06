'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const {
  PAIRING_TOKEN_BYTES,
  PAIRING_TOKEN_LENGTH,
  PAIRING_TOKEN_TTL_MINUTES,
  generatePairingToken,
  hashPairingToken,
  isValidPairingToken,
  isPairingTokenExpired,
  isPairingTokenRedeemable,
  computePairingExpiration
} = require('../src/modules/pairing/domain/pairingToken');

/**
 * HU-006 S1 (reescrita por L9): no hay código que una persona pueda leer ni tipear. La
 * credencial es un token opaco de 32 bytes en base64url que viaja sólo dentro del QR, y en la
 * base queda únicamente su SHA-256.
 */

test('S1: el token de vinculación son 32 bytes en base64url: 43 caracteres y alta entropía', () => {
  const tokens = new Set();

  for (let iteration = 0; iteration < 200; iteration += 1) {
    const token = generatePairingToken();

    assert.equal(typeof token, 'string');
    assert.equal(token.length, PAIRING_TOKEN_LENGTH);
    assert.equal(PAIRING_TOKEN_LENGTH, 43);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    // base64url sin relleno: los 32 bytes se leen de vuelta sin perder un bit.
    assert.equal(Buffer.from(token, 'base64url').length, PAIRING_TOKEN_BYTES);
    assert.equal(Buffer.from(token, 'base64url').toString('base64url'), token);
    assert.equal(token.includes('='), false);
    assert.equal(isValidPairingToken(token), true);

    tokens.add(token);
  }

  // 200 tokens de 256 bits: una repetición acá no es "poco probable", es un generador roto.
  assert.equal(tokens.size, 200);
});

test('S1: sólo se guarda su SHA-256, y el hash no es el token', () => {
  const token = generatePairingToken();
  const hash = hashPairingToken(token);

  assert.equal(hash, createHash('sha256').update(token).digest('hex'));
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, token);
  assert.equal(hash.includes(token), false);
  // Determinístico: el canje vuelve a hashear lo que vino del QR y busca por ese valor.
  assert.equal(hashPairingToken(token), hash);
  assert.notEqual(hashPairingToken(generatePairingToken()), hash);
});

test('S1: un token es exactamente 43 caracteres base64url y nada más', () => {
  assert.equal(isValidPairingToken('A'.repeat(43)), true);
  assert.equal(isValidPairingToken('a'.repeat(43)), true);
  assert.equal(isValidPairingToken(`${'a'.repeat(42)}_`), true);
  assert.equal(isValidPairingToken(`${'a'.repeat(42)}-`), true);

  assert.equal(isValidPairingToken('a'.repeat(42)), false);
  assert.equal(isValidPairingToken('a'.repeat(44)), false);
  assert.equal(isValidPairingToken(`${'a'.repeat(42)}=`), false);
  assert.equal(isValidPairingToken(`${'a'.repeat(42)}+`), false);
  assert.equal(isValidPairingToken(`${'a'.repeat(42)}/`), false);
  assert.equal(isValidPairingToken(` ${'a'.repeat(42)}`), false);
  assert.equal(isValidPairingToken('482913'), false);
  assert.equal(isValidPairingToken(12345), false);
  assert.equal(isValidPairingToken(null), false);
  assert.equal(isValidPairingToken(undefined), false);
});

test('S1: un token vence en el instante exacto de su vencimiento', () => {
  const now = new Date('2024-05-01T10:00:00.000Z');

  assert.equal(isPairingTokenExpired(new Date('2024-05-01T09:59:59.000Z'), now), true);
  assert.equal(isPairingTokenExpired(new Date('2024-05-01T10:00:00.000Z'), now), true);
  assert.equal(isPairingTokenExpired(new Date('2024-05-01T10:00:01.000Z'), now), false);
  assert.equal(isPairingTokenExpired('not-a-date', now), true);
});

test('S1: el vencimiento se calcula como ahora más el ttl en minutos, 24 horas por defecto', () => {
  const now = new Date('2024-05-01T10:00:00.000Z');

  assert.equal(PAIRING_TOKEN_TTL_MINUTES, 1440);
  assert.equal(computePairingExpiration(now).toISOString(), '2024-05-02T10:00:00.000Z');
  assert.equal(computePairingExpiration(now, 15).toISOString(), '2024-05-01T10:15:00.000Z');
  assert.equal(computePairingExpiration(now, 1).toISOString(), '2024-05-01T10:01:00.000Z');
});

test('S2/S4: sólo es canjeable el token sin usar, sin reemplazar y vigente', () => {
  const now = new Date('2024-05-01T10:00:00.000Z');
  const live = {
    expiresAt: new Date('2024-05-01T10:00:01.000Z'),
    usedAt: null,
    invalidatedAt: null
  };

  assert.equal(isPairingTokenRedeemable(live, now), true);
  assert.equal(isPairingTokenRedeemable({ ...live, usedAt: now }, now), false);
  assert.equal(isPairingTokenRedeemable({ ...live, invalidatedAt: now }, now), false);
  assert.equal(isPairingTokenRedeemable({ ...live, expiresAt: now }, now), false);
  assert.equal(isPairingTokenRedeemable(null, now), false);
});
