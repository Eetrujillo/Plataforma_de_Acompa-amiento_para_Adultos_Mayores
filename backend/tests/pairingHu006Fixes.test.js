'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { LinkSeniorApp } = require('../src/modules/pairing/application/LinkSeniorApp');
const { createPairingController } = require('../src/modules/pairing/infrastructure/PairingController');

const OWNER = '507f1f77bcf86cd7994390aa';
const STRANGER = '507f1f77bcf86cd7994390cc';
const SENIOR_ID = '507f1f77bcf86cd7994390bb';

/**
 * Hallazgos de la verificación independiente de HU-006 que valía la pena cerrar en código, no
 * sólo en la documentación.
 */

function build({ senior, qrFailure = false } = {}) {
  const state = { claimed: 0, linked: [] };
  const record = {
    id: 'pairing-1',
    code: '123456',
    caregiverId: OWNER,
    seniorId: SENIOR_ID,
    expiresAt: new Date(Date.now() + 60_000)
  };

  const app = new LinkSeniorApp({
    pairingRepository: {
      async findByCode() {
        return record;
      },
      async claim() {
        state.claimed += 1;
        return { claimed: true };
      },
      async setSenior() {}
    },
    userRepository: {
      async findById() {
        return senior;
      },
      async markLinked(id) {
        state.linked.push(id);
        return { ...senior, linkStatus: 'LINKED' };
      }
    },
    tokenService: { sign: () => 'jwt' }
  });

  const controller = createPairingController({
    generatePairingCode: { async execute() { return { code: '482913', expiresAt: record.expiresAt, seniorId: SENIOR_ID }; } },
    linkSeniorApp: app,
    listLinkedSeniors: { async execute() { return { seniors: [] }; } },
    qrGenerator: {
      async toDataUrl() {
        if (qrFailure) throw new Error('qr exploded');
        return 'data:image/png;base64,AAA';
      }
    }
  });

  return { app, controller, state };
}

test('un perfil de otro familiar no se vincula con este código, y el código no se quema', async () => {
  const { app, state } = build({
    senior: { id: SENIOR_ID, role: 'SENIOR', caregiverId: STRANGER, linkStatus: 'PENDING' }
  });

  await assert.rejects(() => app.execute({ code: '123456' }), /already used|already/i);
  assert.equal(state.claimed, 0, 'el código no debe quemarse por un perfil ajeno');
  assert.deepEqual(state.linked, []);
});

test('un perfil sin dueño tampoco se vincula', async () => {
  const { app, state } = build({
    senior: { id: SENIOR_ID, role: 'SENIOR', caregiverId: null, linkStatus: 'PENDING' }
  });

  await assert.rejects(() => app.execute({ code: '123456' }), /already used|already/i);
  assert.equal(state.claimed, 0);
});

test('si el QR falla, el código igual se entrega: el QR es un atajo, no la credencial', async () => {
  const { controller } = build({ qrFailure: true });
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

  controller.generate(
    { user: { id: OWNER }, body: { seniorId: SENIOR_ID } },
    response,
    (error) => {
      throw error;
    }
  );
  // `asyncHandler` no devuelve la promesa: se espera un tick para que el handler termine.
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.code, '482913');
  assert.equal(response.body.qrCodeDataUrl, null);
  assert.equal(response.body.seniorId, SENIOR_ID);
});
