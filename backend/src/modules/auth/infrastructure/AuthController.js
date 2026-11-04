'use strict';

const { asyncHandler } = require('../../../shared/middlewares/asyncHandler');

/**
 * Express controller for the auth slice.
 */
function createAuthController({ registerCaregiver, login, getCurrentUser, verifyEmail, resendVerificationEmail }) {
  return {
    register: asyncHandler(async (req, res) => {
      // `req.ip` wins over any client supplied address: consent evidence is server owned.
      const result = await registerCaregiver.execute({ ...(req.body ?? {}), ipAddress: req.ip });
      res.status(201).json(result);
    }),

    login: asyncHandler(async (req, res) => {
      const result = await login.execute(req.body);
      res.status(200).json(result);
    }),

    me: asyncHandler(async (req, res) => {
      const user = await getCurrentUser.execute({ userId: req.user.id });
      res.status(200).json({ user });
    }),

    verifyEmail: asyncHandler(async (req, res) => {
      const result = await verifyEmail.execute({ token: req.body?.token });
      res.status(200).json(result);
    }),

    resendVerification: asyncHandler(async (req, res) => {
      const result = await resendVerificationEmail.execute({ email: req.body?.email });
      // Always 202: the endpoint must not reveal whether the account exists.
      res.status(202).json(result);
    })
  };
}

module.exports = { createAuthController };
