import { Router } from 'express';
import { createAuthController } from './AuthController.ts';
import type { AuthUseCases } from './AuthController.ts';

/** Rutas del módulo auth: registro (HU-001) y verificación de correo (HU-002). */
export function createAuthRoutes(useCases: AuthUseCases): Router {
  const controller = createAuthController(useCases);
  const router = Router();
  router.post('/register', controller.register);
  router.post('/verify-email', controller.verifyEmail);
  router.post('/resend-verification', controller.resendVerification);
  return router;
}
