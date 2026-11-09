'use strict';

const express = require('express');
const { ROLES } = require('../../auth/domain/User');
const { requireRole } = require('../../../shared/middlewares/authMiddleware');

function createSeniorRouter({ controller, authMiddleware }) {
  const router = express.Router();

  // Every profile endpoint requires a caregiver: a senior device never manages profiles.
  router.use(authMiddleware, requireRole(ROLES.CAREGIVER));

  router.post('/', controller.create);
  router.get('/', controller.list);
  router.get('/:id', controller.get);

  return router;
}

module.exports = { createSeniorRouter };
