import type { RequestHandler } from 'express';
import { Router } from 'express';
import { createAuthController } from './AuthController.ts';
import type { AuthUseCases } from './AuthController.ts';

/** Rutas del módulo auth: registro (HU-001), verificación (HU-002) y sesión (HU-003). */
export function createAuthRoutes(useCases: AuthUseCases, requireSession: RequestHandler): Router {
  const controller = createAuthController(useCases);
  const router = Router();
  router.post('/register', controller.register);
  router.post('/verify-email', controller.verifyEmail);
  router.post('/resend-verification', controller.resendVerification);
  router.post('/login', controller.login);
  router.get('/me', requireSession, controller.me);
  return router;
}
