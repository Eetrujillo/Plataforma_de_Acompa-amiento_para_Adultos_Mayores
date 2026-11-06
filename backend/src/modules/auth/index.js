'use strict';

const { RegisterCaregiver } = require('./application/RegisterCaregiver');
const { Login } = require('./application/Login');
const { LoginWithGoogle } = require('./application/LoginWithGoogle');
const { GetCurrentUser } = require('./application/GetCurrentUser');
const { VerifyEmail } = require('./application/VerifyEmail');
const { ResendVerificationEmail } = require('./application/ResendVerificationEmail');
const { ResendThrottle } = require('./application/ResendThrottle');
const { BcryptPasswordHasher } = require('./infrastructure/BcryptPasswordHasher');
const { JwtTokenService } = require('./infrastructure/JwtTokenService');
const { GoogleIdTokenVerifier } = require('./infrastructure/GoogleIdTokenVerifier');
const { PrismaUserRepository } = require('./infrastructure/PrismaUserRepository');
const { PrismaEmailVerificationRepository } = require('./infrastructure/PrismaEmailVerificationRepository');
const { createEmailSender } = require('./infrastructure/EmailSender');
const { createAuthController } = require('./infrastructure/AuthController');
const { createAuthRouter } = require('./infrastructure/authRoutes');
const { createAuthMiddleware } = require('../../shared/middlewares/authMiddleware');

/**
 * Auth slice composition root.
 *
 * Returns the router plus the ports other slices and the shared middleware need.
 */
function createAuthModule({ prisma, config, logger = console }) {
  const userRepository = new PrismaUserRepository({ prisma });
  const verificationRepository = new PrismaEmailVerificationRepository({ prisma });
  const passwordHasher = new BcryptPasswordHasher();
  const tokenService = new JwtTokenService(config.jwt);
  const emailSender = createEmailSender({ smtp: config.smtp, logger });
  // One limiter per process: the window is shared by every request this instance serves.
  const resendThrottle = new ResendThrottle({
    maxAttempts: config.resendThrottle.maxAttempts,
    windowMs: config.resendThrottle.windowMinutes * 60 * 1000
  });

  const authMiddleware = createAuthMiddleware({ verifyToken: (token) => tokenService.verify(token) });

  const controller = createAuthController({
    registerCaregiver: new RegisterCaregiver({
      userRepository,
      passwordHasher,
      verificationRepository,
      emailSender,
      config,
      logger
    }),
    login: new Login({ userRepository, passwordHasher, tokenService, config }),
    loginWithGoogle: new LoginWithGoogle({
      userRepository,
      tokenService,
      idTokenVerifier: new GoogleIdTokenVerifier(),
      config
    }),
    googleConfig: {
      enabled: Boolean(config.google?.clientId),
      clientId: config.google?.clientId || null
    },
    getCurrentUser: new GetCurrentUser({ userRepository }),
    verifyEmail: new VerifyEmail({ verificationRepository, userRepository, tokenService }),
    resendVerificationEmail: new ResendVerificationEmail({
      userRepository,
      verificationRepository,
      emailSender,
      config,
      resendThrottle,
      logger
    })
  });

  return {
    router: createAuthRouter({ controller, authMiddleware }),
    authMiddleware,
    tokenService,
    userRepository
  };
}

module.exports = { createAuthModule };
