'use strict';

const { asyncHandler } = require('../../../shared/middlewares/asyncHandler');

/**
 * Express controller for the auth slice.
 */
function createAuthController({
  registerCaregiver,
  login,
  getCurrentUser,
  verifyEmail,
  resendVerificationEmail,
  requestPasswordReset,
  resetPassword,
  loginWithGoogle,
  googleConfig = { enabled: false, clientId: null }
}) {
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

    googleConfig: asyncHandler(async (_req, res) => {
      // Public, secret free: the client id is the only thing the bundle needs at runtime.
      res.status(200).json({ enabled: googleConfig.enabled, clientId: googleConfig.clientId });
    }),

    googleLogin: asyncHandler(async (req, res) => {
      const result = await loginWithGoogle.execute({ idToken: req.body?.idToken });
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
    }),

    requestPasswordReset: asyncHandler(async (req, res) => {
      const result = await requestPasswordReset.execute({ email: req.body?.email });
      // Igual que el reenvío: la respuesta no distingue si la cuenta existe.
      res.status(202).json(result);
    }),

    resetPassword: asyncHandler(async (req, res) => {
      const result = await resetPassword.execute({
        token: req.body?.token,
        password: req.body?.password
      });
      res.status(200).json(result);
    })
  };
}

module.exports = { createAuthController };
