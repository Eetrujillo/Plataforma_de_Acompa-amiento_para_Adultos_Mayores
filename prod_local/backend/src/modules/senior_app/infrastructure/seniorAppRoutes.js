'use strict';

const express = require('express');

/** Rutas de la app del adulto mayor (HU-008, HU-009, HU-011, HU-017 a HU-019). */
function createSeniorAppRouter({ controller, seniorAuthMiddleware }) {
  const router = express.Router();

  // Público: el texto del consentimiento se lee antes de tener sesión.
  router.get('/consent', controller.getConsent);

  router.get('/session', seniorAuthMiddleware, controller.session);
  router.post('/consent', seniorAuthMiddleware, controller.acceptConsent);
  router.get('/activities', seniorAuthMiddleware, controller.activities);
  router.post('/activities/:id/complete', seniorAuthMiddleware, controller.complete);
  router.delete('/activities/:id/complete', seniorAuthMiddleware, controller.undo);
  router.post('/logout', seniorAuthMiddleware, controller.logout);

  return router;
}

module.exports = { createSeniorAppRouter };
