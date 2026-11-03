'use strict';

const { asyncHandler } = require('../../../shared/middlewares/asyncHandler');

/**
 * Express controller for the auth slice.
 */
function createAuthController({ registerCaregiver, login, getCurrentUser }) {
  return {
    register: asyncHandler(async (req, res) => {
      const user = await registerCaregiver.execute(req.body);
      res.status(201).json({ user });
    }),

    login: asyncHandler(async (req, res) => {
      const result = await login.execute(req.body);
      res.status(200).json(result);
    }),

    me: asyncHandler(async (req, res) => {
      const user = await getCurrentUser.execute({ userId: req.user.id });
      res.status(200).json({ user });
    })
  };
}

module.exports = { createAuthController };
