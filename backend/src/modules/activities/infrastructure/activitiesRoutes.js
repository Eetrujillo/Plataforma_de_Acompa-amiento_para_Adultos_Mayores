'use strict';

const express = require('express');
const { ROLES } = require('../../auth/domain/User');
const { requireRole } = require('../../../shared/middlewares/authMiddleware');

function createActivitiesRouter({ controller, authMiddleware }) {
  const router = express.Router();

  router.use(authMiddleware);

  router.post('/', requireRole(ROLES.CAREGIVER), controller.create);
  router.get('/daily', requireRole(ROLES.CAREGIVER, ROLES.SENIOR), controller.daily);
  router.patch('/:id/complete', requireRole(ROLES.SENIOR), controller.complete);

  return router;
}

module.exports = { createActivitiesRouter };
