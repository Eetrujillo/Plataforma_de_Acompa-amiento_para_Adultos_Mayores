import type { RequestHandler } from 'express';
import { Router } from 'express';
import { createPairingController } from './PairingController.ts';
import type { PairingUseCases } from './PairingController.ts';

/**
 * Rutas del slice pairing (HU-008). La emisión lleva los dos guards: primero
 * la sesión (`requireSession`), después el rol (`requireCaregiver` =
 * `requireRole('CAREGIVER')`) — S10: sin token 401, con otro rol 403. El
 * canje (HU-009) añadirá su ruta pública; nada más vive acá todavía.
 */
export function createPairingRoutes(
  useCases: PairingUseCases,
  requireSession: RequestHandler,
  requireCaregiver: RequestHandler,
): Router {
  const controller = createPairingController(useCases);
  const router = Router();
  router.post('/qr', requireSession, requireCaregiver, controller.emit);
  return router;
}
