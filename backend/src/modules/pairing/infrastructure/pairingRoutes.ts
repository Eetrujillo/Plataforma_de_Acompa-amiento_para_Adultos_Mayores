import type { RequestHandler } from 'express';
import { Router } from 'express';
import { createPairingController } from './PairingController.ts';
import type { PairingUseCases } from './PairingController.ts';

/**
 * Rutas del slice pairing (HU-008 y HU-009). La emisión lleva los dos guards:
 * primero la sesión (`requireSession`), después el rol (`requireCaregiver` =
 * `requireRole('CAREGIVER')`) — S10: sin token 401, con otro rol 403.
 */
export function createPairingRoutes(
  useCases: PairingUseCases,
  requireSession: RequestHandler,
  requireCaregiver: RequestHandler,
): Router {
  const controller = createPairingController(useCases);
  const router = Router();
  router.post('/qr', requireSession, requireCaregiver, controller.emit);
  // S11: el canje es público — el teléfono del adulto mayor no tiene sesión
  // todavía y el token del QR es la credencial. Sin `Authorization`.
  router.post('/redeem', controller.redeem);
  return router;
}
