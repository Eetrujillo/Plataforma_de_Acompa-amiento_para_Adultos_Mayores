'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { QrGenerator, buildPairingQrPayload } = require('../src/modules/pairing/infrastructure/QrGenerator');
const { generatePairingToken } = require('../src/modules/pairing/domain/pairingToken');

/**
 * HU-006 S1: el QR es el único soporte de la credencial. El payload es un objeto con el token,
 * no una URL y no el token suelto: la app que lo lee tiene que reconocer el tipo antes de usar
 * el valor, y el adulto mayor no puede dictar lo que ve.
 */

test('S1: el payload del QR es {"type":"senior-pairing","token":"..."}, sin URL ni seniorId', () => {
  const token = generatePairingToken();
  const raw = buildPairingQrPayload(token);

  assert.deepEqual(JSON.parse(raw), { type: 'senior-pairing', token });
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ['token', 'type']);
  assert.equal(raw.includes('http'), false);
  assert.equal(raw.includes('seniorId'), false);
  assert.equal(raw.includes('/api/'), false);
  // El payload es un sobre, no el token pelado: quien copie el texto no obtiene la credencial
  // a menos que la app sepa leer el campo.
  assert.notEqual(raw, token);
});

test('S1: el QR se entrega como data URL PNG y no lleva el token en claro', async () => {
  const token = generatePairingToken();

  const dataUrl = await new QrGenerator().toDataUrl(token);

  assert.match(dataUrl, /^data:image\/png;base64,/);
  assert.equal(dataUrl.includes(token), false);
});
