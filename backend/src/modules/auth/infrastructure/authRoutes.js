'use strict';

const express = require('express');

function createAuthRouter({ controller, authMiddleware }) {
  const router = express.Router();

  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.get('/google/config', controller.googleConfig);
  router.post('/google', controller.googleLogin);
  router.post('/verify-email', controller.verifyEmail);
  router.post('/resend-verification', controller.resendVerification);
  router.get('/me', authMiddleware, controller.me);

  return router;
}

module.exports = { createAuthRouter };
