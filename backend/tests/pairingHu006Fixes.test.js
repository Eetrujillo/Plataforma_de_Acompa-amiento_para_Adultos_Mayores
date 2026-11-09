'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { GeneratePairingToken } = require('../src/modules/pairing/application/GeneratePairingToken');
const { RedeemPairingToken } = require('../src/modules/pairing/application/RedeemPairingToken');
const { createPairingController } = require('../src/modules/pairing/infrastructure/PairingController');
const { hashPairingToken } = require('../src/modules/pairing/domain/pairingToken');

const OWNER = '507f1f77bcf86cd7994390aa';
const STRANGER = '507f1f77bcf86cd7994390cc';
const SENIOR_ID = '507f1f77bcf86cd7994390bb';

/** 43 caracteres base64url, el formato que produce el generador. */
const TOKEN = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v';

/**
 * Hallazgos de la verificación independiente de HU-006 que siguen valiendo después del rework
 * QR-only (L9): el perfil del token se revalida contra el dueño del token, y un fallo del
 * codificador de QR ya no puede dejar pedidos a medias.
 */

function buildRedeem({ senior } = {}) {
  const state = { claimed: 0, linked: [] };
  const record = {
    id: 'pairing-1',
    tokenHash: hashPairingToken(TOKEN),
    caregiverId: OWNER,
    seniorId: SENIOR_ID,
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    invalidatedAt: null
  };

  const useCase = new RedeemPairingToken({
    pairingRepository: {
      async findByTokenHash(tokenHash) {
        return tokenHash === record.tokenHash ? { ...record } : null;
      },
      async claim() {
        state.claimed += 1;
        return { claimed: true };
      }
    },
    userRepository: {
      async findById() {
        return senior ?? null;
      },
      async markLinked(id) {
        state.linked.push(id);
        return { ...senior, linkStatus: 'LINKED' };
      }
    },
    tokenService: { sign: () => 'jwt' }
  });

  return { useCase, state };
}

test('un perfil de otro familiar no se vincula con este token, y el token no se quema', async () => {
  const { useCase, state } = buildRedeem({
    senior: { id: SENIOR_ID, role: 'SENIOR', caregiverId: STRANGER, linkStatus: 'PENDING' }
  });

  await assert.rejects(useCase.execute({ token: TOKEN }), (error) => {
    assert.equal(error.statusCode, 409);
    assert.equal(error.message, 'pairing token already used');
    return true;
  });

  assert.equal(state.claimed, 0, 'el token no debe quemarse por un perfil ajeno');
  assert.deepEqual(state.linked, []);
});

test('un perfil sin dueño tampoco se vincula', async () => {
  const { useCase, state } = buildRedeem({
    senior: { id: SENIOR_ID, role: 'SENIOR', caregiverId: null, linkStatus: 'PENDING' }
  });

  await assert.rejects(useCase.execute({ token: TOKEN }), (error) => {
    assert.equal(error.statusCode, 409);
    return true;
  });

  assert.equal(state.claimed, 0);
  assert.deepEqual(state.linked, []);
});

test('si el QR no se puede generar responde 503 y no invalida ni crea ningún token', async () => {
  const state = { invalidations: [], created: [] };
  const token = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v';

  const generatePairingToken = new GeneratePairingToken({
    pairingRepository: {
      async invalidateOutstanding(data) {
        state.invalidations.push(data);
        return { count: 0 };
      },
      async create(data) {
        state.created.push(data);
        return { id: 'pt-1', ...data };
      }
    },
    userRepository: {
      async findById() {
        return { id: SENIOR_ID, role: 'SENIOR', caregiverId: OWNER, linkStatus: 'PENDING' };
      }
    },
    qrGenerator: {
      async toDataUrl() {
        // Un codificador que recibe el token y revienta: el pedido no puede quedar a medias.
        throw new Error(`qr exploded for ${token}`);
      }
    },
    config: { pairing: { ttlMinutes: 1440 } }
  });

  const controller = createPairingController({
    generatePairingToken,
    redeemPairingToken: { async execute() { return {}; } },
    listLinkedSeniors: { async execute() { return { seniors: [] }; } }
  });

  const response = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };

  const errors = [];

  controller.generateQr(
    { user: { id: OWNER }, body: { seniorId: SENIOR_ID } },
    response,
    (error) => errors.push(error)
  );
  // `asyncHandler` no devuelve la promesa: se espera un tick para que el handler termine.
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(response.statusCode, null, 'no se responde 201 sin QR');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].statusCode, 503);
  assert.equal(errors[0].code, 'PAIRING_QR_UNAVAILABLE');
  assert.equal(errors[0].message.includes(token), false, 'el token no viaja en el error');

  assert.deepEqual(state.invalidations, []);
  assert.deepEqual(state.created, []);
});
