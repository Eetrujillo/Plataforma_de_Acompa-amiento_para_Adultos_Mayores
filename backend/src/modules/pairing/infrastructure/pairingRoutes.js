'use strict';

const express = require('express');
const { ROLES } = require('../../auth/domain/User');
const { requireRole } = require('../../../shared/middlewares/authMiddleware');

function createPairingRouter({ controller, authMiddleware }) {
  const router = express.Router();

  router.get('/seniors', authMiddleware, requireRole(ROLES.CAREGIVER), controller.seniors);
  // HU-006 T7: el cuidador pide el QR de un perfil; no hay código que mostrar ni que dictar.
  router.post('/qr', authMiddleware, requireRole(ROLES.CAREGIVER), controller.generateQr);
  // Public: the senior device has no account yet, the scanned token is the credential.
  router.post('/redeem', controller.redeem);

  return router;
}

module.exports = { createPairingRouter };
