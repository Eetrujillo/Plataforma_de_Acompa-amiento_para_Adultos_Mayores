'use strict';

const express = require('express');

function createAuthRouter({ controller, authMiddleware }) {
  const router = express.Router();

  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.get('/me', authMiddleware, controller.me);

  return router;
}

module.exports = { createAuthRouter };
