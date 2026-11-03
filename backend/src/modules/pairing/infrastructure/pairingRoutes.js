'use strict';

const express = require('express');
const { ROLES } = require('../../auth/domain/User');
const { requireRole } = require('../../../shared/middlewares/authMiddleware');

function createPairingRouter({ controller, authMiddleware }) {
  const router = express.Router();

  router.post('/codes', authMiddleware, requireRole(ROLES.CAREGIVER), controller.generate);
  // Public: the senior device has no account yet, the code is the credential.
  router.post('/link', controller.link);

  return router;
}

module.exports = { createPairingRouter };
