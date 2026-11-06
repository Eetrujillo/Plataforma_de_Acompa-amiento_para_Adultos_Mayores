'use strict';

const express = require('express');
const { ROLES } = require('../../auth/domain/User');
const { requireRole } = require('../../../shared/middlewares/authMiddleware');

/**
 * Rutas del familiar para los perfiles del adulto mayor.
 * Mantienen las URLs de la versión anterior para que web y móvil no cambien.
 */
function createOlderAdultRouter({ controller, authMiddleware, verifiedEmailGuard }) {
  const router = express.Router();

  router.use(authMiddleware, requireRole(ROLES.CAREGIVER), verifiedEmailGuard);

  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id', controller.get);
  router.put('/:id', controller.update);
  router.post('/:id/linking-code', controller.generateLinkingCode);
  router.post('/:id/unlink', controller.unlink);

  return router;
}

module.exports = { createOlderAdultRouter };
