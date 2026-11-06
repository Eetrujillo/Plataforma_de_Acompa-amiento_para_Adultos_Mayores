'use strict';

const express = require('express');
const { ROLES } = require('../../auth/domain/User');
const { requireRole } = require('../../../shared/middlewares/authMiddleware');

function createActivitiesRouter({ controller, authMiddleware, verifiedEmailGuard }) {
  const router = express.Router();

  router.use(authMiddleware);

  // Rutas del familiar (HU-012 a HU-015, HU-020).
  router.get('/', requireRole(ROLES.CAREGIVER), verifiedEmailGuard, controller.list);
  router.post('/', requireRole(ROLES.CAREGIVER), verifiedEmailGuard, controller.create);
  router.get('/today', requireRole(ROLES.CAREGIVER), verifiedEmailGuard, controller.today);
  router.put('/:id', requireRole(ROLES.CAREGIVER), verifiedEmailGuard, controller.update);
  router.delete('/:id', requireRole(ROLES.CAREGIVER), verifiedEmailGuard, controller.remove);

  // Rutas que ya existían en `prod`.
  router.get('/daily', requireRole(ROLES.CAREGIVER, ROLES.SENIOR), controller.daily);
  router.patch('/:id/complete', requireRole(ROLES.SENIOR), controller.complete);

  return router;
}

module.exports = { createActivitiesRouter };
