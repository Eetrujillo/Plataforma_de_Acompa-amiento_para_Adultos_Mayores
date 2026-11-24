import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../errors/AppError.ts';
import { INVALID_SESSION_MESSAGE } from './authMiddleware.ts';

/**
 * Guard de rol por ruta (decisión D5, S20 de HU-005/HU-007). Va siempre
 * DESPUÉS del guard de sesión: sin `req.sessionUser` el pedido no pasó por él,
 * así que responde el mismo 401 que el auth; con sesión de otro rol responde
 * 403. El rol vive en el token; el authMiddleware ya confirmó que
 * corresponde a una cuenta real.
 */
export function requireRole(role: string): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.sessionUser;
    if (user === undefined) {
      next(new AppError(401, 'UNAUTHORIZED', INVALID_SESSION_MESSAGE));
      return;
    }
    if (user.role !== role) {
      // D5: el código 403 FORBIDDEN es propio de acá. El mensaje NO nombra el
      // rol requerido: a una sesión autenticada de otro rol no se le cuenta
      // qué rol pide la ruta.
      next(new AppError(403, 'FORBIDDEN', 'La ruta no está disponible para el rol de la sesión'));
      return;
    }
    next();
  };
}
