'use strict';

const { RegisterCaregiver } = require('./application/RegisterCaregiver');
const { Login } = require('./application/Login');
const { GetCurrentUser } = require('./application/GetCurrentUser');
const { BcryptPasswordHasher } = require('./infrastructure/BcryptPasswordHasher');
const { JwtTokenService } = require('./infrastructure/JwtTokenService');
const { PrismaUserRepository } = require('./infrastructure/PrismaUserRepository');
const { createAuthController } = require('./infrastructure/AuthController');
const { createAuthRouter } = require('./infrastructure/authRoutes');
const { createAuthMiddleware } = require('../../shared/middlewares/authMiddleware');

/**
 * Auth slice composition root.
 *
 * Returns the router plus the ports other slices and the shared middleware need.
 */
function createAuthModule({ prisma, config }) {
  const userRepository = new PrismaUserRepository({ prisma });
  const passwordHasher = new BcryptPasswordHasher();
  const tokenService = new JwtTokenService(config.jwt);

  const authMiddleware = createAuthMiddleware({ verifyToken: (token) => tokenService.verify(token) });

  const controller = createAuthController({
    registerCaregiver: new RegisterCaregiver({ userRepository, passwordHasher }),
    login: new Login({ userRepository, passwordHasher, tokenService }),
    getCurrentUser: new GetCurrentUser({ userRepository })
  });

  return {
    router: createAuthRouter({ controller, authMiddleware }),
    authMiddleware,
    tokenService,
    userRepository
  };
}

module.exports = { createAuthModule };
