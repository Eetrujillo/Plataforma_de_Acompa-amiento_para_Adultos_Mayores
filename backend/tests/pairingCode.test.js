'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PAIRING_CODE_LENGTH,
  PAIRING_CODE_TTL_MINUTES,
  generatePairingCode,
  isValidPairingCode,
  isPairingCodeExpired,
  computePairingExpiration
} = require('../src/modules/pairing/domain/pairingCode');

test('generated pairing codes are exactly six digits', () => {
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const code = generatePairingCode();

    assert.equal(typeof code, 'string');
    assert.equal(code.length, PAIRING_CODE_LENGTH);
    assert.match(code, /^\d{6}$/);
    assert.equal(isValidPairingCode(code), true);
  }
});

test('the code length is configurable but validated', () => {
  assert.equal(generatePairingCode(4).length, 4);
  assert.throws(() => generatePairingCode(0), RangeError);
  assert.throws(() => generatePairingCode(2.5), RangeError);
});

test('only a six digit string is a valid code, leading zeros included', () => {
  assert.equal(isValidPairingCode('000123'), true);
  assert.equal(isValidPairingCode('999999'), true);

  assert.equal(isValidPairingCode('12345'), false);
  assert.equal(isValidPairingCode('1234567'), false);
  assert.equal(isValidPairingCode('12345a'), false);
  assert.equal(isValidPairingCode(' 123456'), false);
  assert.equal(isValidPairingCode(123456), false);
  assert.equal(isValidPairingCode(null), false);
  assert.equal(isValidPairingCode(undefined), false);
});

test('a code expires at its exact expiration instant', () => {
  const now = new Date('2024-05-01T10:00:00.000Z');

  assert.equal(isPairingCodeExpired(new Date('2024-05-01T09:59:59.000Z'), now), true);
  assert.equal(isPairingCodeExpired(new Date('2024-05-01T10:00:00.000Z'), now), true);
  assert.equal(isPairingCodeExpired(new Date('2024-05-01T10:00:01.000Z'), now), false);
  assert.equal(isPairingCodeExpired('not-a-date', now), true);
});

test('expiration is computed from the now instant plus the ttl in minutes', () => {
  const now = new Date('2024-05-01T10:00:00.000Z');

  assert.equal(computePairingExpiration(now, 15).toISOString(), '2024-05-01T10:15:00.000Z');
  assert.equal(computePairingExpiration(now, 1).toISOString(), '2024-05-01T10:01:00.000Z');
});

/**
 * HU-006 S1: el criterio de aceptación pide 24 horas. La constante vive en el dominio y la
 * configuración la usa como default, así el número no se duplica en dos archivos.
 */
test('HU-006 S1: a code computed without an explicit ttl lives 24 hours', () => {
  const now = new Date('2024-05-01T10:00:00.000Z');

  assert.equal(PAIRING_CODE_TTL_MINUTES, 1440);
  assert.equal(computePairingExpiration(now).toISOString(), '2024-05-02T10:00:00.000Z');
});
