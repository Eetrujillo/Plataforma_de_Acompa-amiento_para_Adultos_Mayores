'use strict';

const express = require('express');

/**
 * @param {object} options
 * @param {boolean} [options.devRoutes] Monta `POST /dev/verify-email`. Se activa
 *   solo fuera de producción (ver `auth/index.js`).
 */
function createAuthRouter({ controller, authMiddleware, devRoutes = false }) {
  const router = express.Router();

  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.get('/google/config', controller.googleConfig);
  router.post('/google', controller.googleLogin);
  router.post('/verify-email', controller.verifyEmail);
  router.post('/resend-verification', controller.resendVerification);
  // HU-004
  router.post('/forgot-password', controller.forgotPassword);
  router.post('/reset-password', controller.resetPassword);
  router.get('/me', authMiddleware, controller.me);

  // Solo desarrollo: sin SMTP, confirma el correo para poder probar la app en
  // un teléfono. En producción esta ruta no existe.
  if (devRoutes) {
    router.post('/dev/verify-email', controller.devVerifyEmail);
  }

  return router;
}

module.exports = { createAuthRouter };
