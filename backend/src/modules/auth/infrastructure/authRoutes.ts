import { Router } from 'express';
import { createAuthController } from './AuthController.ts';
import type { RegisterCaregiver } from '../application/RegisterCaregiver.ts';

/** Rutas del módulo auth. Por ahora, solo el registro (HU-001). */
export function createAuthRoutes(registerCaregiver: RegisterCaregiver): Router {
  const controller = createAuthController(registerCaregiver);
  const router = Router();
  router.post('/register', controller.register);
  return router;
}
