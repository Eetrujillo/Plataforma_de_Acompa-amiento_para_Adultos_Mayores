import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../../shared/errors/AppError.ts';
import { INVALID_SESSION_MESSAGE } from '../../../shared/middlewares/authMiddleware.ts';
import { GeneratePairingQr } from '../application/GeneratePairingQr.ts';
import type { PairingQrResult } from '../application/GeneratePairingQr.ts';

export interface PairingUseCases {
  generatePairingQr: GeneratePairingQr;
}

/** Mensaje de INVALID_BODY; `details.field` marca el campo que falló la forma. */
const INVALID_BODY_MESSAGE = 'El cuerpo del pedido no tiene el formato esperado';

function bodyObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'INVALID_BODY', INVALID_BODY_MESSAGE);
  }
  return body as Record<string, unknown>;
}

function sessionCaregiverId(req: Request): string {
  // S14: el caregiverId sale de la sesión, nunca del cuerpo del pedido.
  const user = req.sessionUser;
  if (user === undefined) {
    throw new AppError(401, 'UNAUTHORIZED', INVALID_SESSION_MESSAGE);
  }
  return user.id;
}

/**
 * Arma el comando de emisión: el `seniorId` llega como texto crudo — falta o
 * no son 24 hex lo marca el caso de uso como SENIOR_ID_REQUIRED (S12).
 */
function buildEmitCommand(req: Request): { seniorId: string; caregiverId: string } {
  const raw = bodyObject(req.body);
  const rawSeniorId = raw['seniorId'];
  return {
    seniorId: typeof rawSeniorId === 'string' ? rawSeniorId : '',
    caregiverId: sessionCaregiverId(req),
  };
}

function emitResponse(res: Response, result: PairingQrResult): void {
  // S21/D10: el QR es una credencial — no se cachea en ningún intermediario.
  res.set('Cache-Control', 'no-store');
  // S9: el cuerpo exacto. El token NO viaja (S6/S11) — la única copia en claro
  // está dentro de la imagen del QR.
  res.status(201).json({
    expiresAt: result.expiresAt.toISOString(),
    seniorId: result.seniorId,
    qrCodeDataUrl: result.qrCodeDataUrl,
  });
}

/** Controlador HTTP del slice pairing (HU-008). */
export function createPairingController(useCases: PairingUseCases) {
  return {
    // Express 4 no propaga los rechazos de handlers async: se capturan y se
    // delegan al errorHandler explícitamente.
    async emit(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const command = buildEmitCommand(req);
        const result = await useCases.generatePairingQr.execute(command);
        emitResponse(res, result);
      } catch (error: unknown) {
        next(error);
      }
    },
  };
}
