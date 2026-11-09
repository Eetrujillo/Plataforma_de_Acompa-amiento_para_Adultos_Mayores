'use strict';

const express = require('express');
const { ROLES } = require('../../auth/domain/User');
const { requireRole } = require('../../../shared/middlewares/authMiddleware');

function createSosRouter({ controller, authMiddleware }) {
  const router = express.Router();

  router.use(authMiddleware);

  router.post('/', requireRole(ROLES.SENIOR), controller.trigger);
  router.get('/active', requireRole(ROLES.CAREGIVER), controller.active);
  router.patch('/:id/resolve', requireRole(ROLES.CAREGIVER), controller.resolve);

  return router;
}

module.exports = { createSosRouter };
