const express = require('express');
const createHealthController = require('../controllers/healthController');

function healthRoutes(query) {
  const router = express.Router();

  router.get('/health', createHealthController(query));

  return router;
}

module.exports = healthRoutes;