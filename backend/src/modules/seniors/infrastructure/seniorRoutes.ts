import type { RequestHandler } from 'express';
import { Router } from 'express';
import { createSeniorController } from './SeniorController.ts';
import type { SeniorsUseCases } from './SeniorController.ts';

/**
 * Rutas del slice seniors (HU-005/HU-007). Toda ruta lleva los dos guards:
 * primero la sesión (`requireSession`), después el rol (`requireCaregiver`
 * = `requireRole('CAREGIVER')`) — S20: sin token 401, con otro rol 403.
 */
export function createSeniorRoutes(
  useCases: SeniorsUseCases,
  requireSession: RequestHandler,
  requireCaregiver: RequestHandler,
): Router {
  const controller = createSeniorController(useCases);
  const router = Router();
  router.post('/', requireSession, requireCaregiver, controller.create);
  router.get('/', requireSession, requireCaregiver, controller.list);
  router.get('/:id', requireSession, requireCaregiver, controller.get);
  // D3: la ficha médica vive en una ruta propia; el detalle público queda
  // igual al objeto del alta y S11 (excluir médicos) se vuelve observable.
  router.get('/:id/medical', requireSession, requireCaregiver, controller.medical);
  router.get('/:id/caregivers', requireSession, requireCaregiver, controller.caregivers);
  return router;
}
