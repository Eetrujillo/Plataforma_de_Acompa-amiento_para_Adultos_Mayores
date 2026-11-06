'use strict';

const { asyncHandler } = require('../../../shared/middlewares/asyncHandler');

/**
 * Express controller for the auth slice.
 *
 * Mantiene los contratos de `prod` y añade los campos que la web y la app móvil
 * ya usaban (`name`, `emailVerified`, `message` en verificación y recuperación).
 */
function createAuthController({
  registerCaregiver,
  login,
  getCurrentUser,
  verifyEmail,
  resendVerificationEmail,
  loginWithGoogle,
  passwordRecovery,
  googleConfig = { enabled: false, clientId: null }
}) {
  return {
    register: asyncHandler(async (req, res) => {
      const body = req.body ?? {};

      // Compatibilidad: la web anterior envía `name` y `acceptPrivacyPolicy`.
      const result = await registerCaregiver.execute({
        ...body,
        fullName: body.fullName ?? body.name,
        acceptedTerms: body.acceptedTerms ?? body.acceptPrivacyPolicy,
        ipAddress: req.ip
      });

      res.status(201).json({
        user: result.user,
        verificationSent: result.verificationSent,
        emailVerificationSent: result.verificationSent
      });
    }),

    login: asyncHandler(async (req, res) => {
      const result = await login.execute(req.body);
      res.status(200).json(result);
    }),

    googleConfig: asyncHandler(async (_req, res) => {
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
      res.status(200).json({
        ...result,
        message: 'Tu correo fue confirmado. Ya puedes usar tu cuenta.',
        code: 'EMAIL_VERIFIED'
      });
    }),

    resendVerification: asyncHandler(async (req, res) => {
      const result = await resendVerificationEmail.execute({ email: req.body?.email });

      // Siempre 202: el endpoint no debe revelar si la cuenta existe.
      res.status(202).json({
        ...result,
        message:
          'Si el correo está registrado y sin confirmar, te enviamos un enlace de verificación.'
      });
    }),

    forgotPassword: asyncHandler(async (req, res) => {
      const result = await passwordRecovery.request({ email: req.body?.email });
      res.status(200).json(result);
    }),

    resetPassword: asyncHandler(async (req, res) => {
      const result = await passwordRecovery.reset({
        token: req.body?.token,
        password: req.body?.password
      });
      res.status(200).json(result);
    })
  };
}

module.exports = { createAuthController };
