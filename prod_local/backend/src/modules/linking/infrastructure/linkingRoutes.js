'use strict';

const express = require('express');

/** Canje del código: público, porque el dispositivo aún no tiene sesión. */
function createLinkingRouter({ controller }) {
  const router = express.Router();

  router.post('/redeem', controller.redeem);

  return router;
}

module.exports = { createLinkingRouter };
